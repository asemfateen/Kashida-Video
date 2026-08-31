import asyncio
import gc
import os
import re
import shutil

import ffmpeg
from playwright.async_api import async_playwright

TEMPLATE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "templates",
)

# Optimized Chromium flags for low-RAM (2GB - 4GB VPS) environments
CHROMIUM_LOW_RAM_FLAGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-default-apps",
    "--disable-dev-tools",
    "--disable-extensions",
    "--disable-features=TranslateUI,BlinkGenPropertyTrees",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--disable-sync",
    "--disable-translate",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-first-run",
    "--safebrowsing-disable-auto-update",
    "--js-flags=--max-old-space-size=256",
]

# Only filesystem-safe template ids are allowed to resolve to a template file.
# Anything else (e.g. "../../etc/passwd") falls back to the default template,
# preventing path traversal when loading the requested template.
TEMPLATE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# Default duration for a round whose background is an image (or has no media).
IMAGE_ROUND_SECONDS = 5.0


def _resolve_template_path(json_data: dict) -> str:
    """Map the requested template id to a real .html file on disk.

    Falls back to breaking_news.html when the requested template is unknown.
    """
    requested = json_data.get("template", "breaking_news")
    # Strip the ".html" suffix used by some callers before validating the id.
    if isinstance(requested, str) and requested.endswith(".html"):
        requested = requested[:-len(".html")]
    # Reject unsafe template ids (path traversal, subdirectories, oversize).
    # Unknown/safe-but-missing templates fall through to the default.
    if not (isinstance(requested, str) and TEMPLATE_ID_RE.fullmatch(requested)):
        return os.path.join(TEMPLATE_DIR, "breaking_news.html")
    path = os.path.join(TEMPLATE_DIR, f"{requested}.html")
    if not os.path.exists(path):
        path = os.path.join(TEMPLATE_DIR, "breaking_news.html")
    return path


def _local_path(url: str) -> str:
    """Strip a ``file://`` prefix so ffprobe/ffmpeg can read the path."""
    if url.startswith("file://"):
        return url[len("file://"):]
    return url


def _probe_video_duration(url: str) -> float | None:
    """Return the duration (seconds) of a video file/URL via ffprobe."""
    if not url:
        return None
    try:
        probe = ffmpeg.probe(_local_path(url))
        return float(probe["format"]["duration"])
    except Exception:
        return None


def _round_duration(round_data: dict) -> float:
    """Derive a round's length from its media.

    Rule:
      - explicit ``duration`` (> 0) wins
      - video background  -> length of the clip itself
      - image / no media  -> IMAGE_ROUND_SECONDS
    """
    if round_data.get("duration"):
        return float(round_data["duration"])

    video_url = round_data.get("videoUrl") or ""
    if video_url:
        dur = _probe_video_duration(video_url)
        if dur and dur > 0:
            return max(0.5, dur)

    return IMAGE_ROUND_SECONDS


def _round_segment(round_dict: dict, index: int, fps: int) -> dict:
    """Build a news-round segment dict, tagging it with its 0-based round index.

    The ``roundIndex`` lets the generated template know which news round is being
    rendered so it can hold ``animateFirstRoundOnly`` layers static from round 1
    onward (matching the frontend preview).
    """
    round_dict = {**round_dict, "roundIndex": index}
    return {
        "data": round_dict,
        "duration": _round_duration(round_dict),
        "frames": max(1, int(_round_duration(round_dict) * fps)),
    }


def _make_bumper_segment(bumper: dict, json_data: dict, fps: int) -> dict:
    """Build a single bumper segment dict (a logo + transition brand break)."""
    duration = max(0.2, float(bumper.get("duration") or 2))
    return {
        "data": {
            "isBumper": True,
            "backgroundColor": (
                bumper.get("backgroundColor")
                or json_data.get("backgroundColor")
                or "#0b0b0f"
            ),
            "accentColor": (
                bumper.get("accentColor") or json_data.get("accentColor") or "#e63946"
            ),
            "logoImageUrl": bumper.get("logoImageUrl") or "",
            "logoText": bumper.get("logoText") or "KASHIDA",
            "slogan": bumper.get("slogan") or "",
        },
        "duration": duration,
        "frames": max(1, int(duration * fps)),
    }


def _interleave_bumpers(round_segments: list, bumper: dict, fps: int, json_data: dict) -> list:
    """Insert bumper segments around the round segments.

    Mirrors frontend/src/lib/timeline.ts::buildTimeline:
      - intro bumper before the first round (if showIntro)
      - one interstitial between each pair of rounds (if showInterstitial)
      - outro bumper after the last round (if showOutro)
    A bumper needs no media — it renders silent (the encoder's silent-audio path
    already matches the round segments' codec/sample-rate for a safe c=copy concat).
    """
    segs: list = []
    if bumper.get("showIntro", True):
        segs.append(_make_bumper_segment(bumper, json_data, fps))
    for i, rs in enumerate(round_segments):
        segs.append(rs)
        if bumper.get("showInterstitial", True) and i < len(round_segments) - 1:
            segs.append(_make_bumper_segment(bumper, json_data, fps))
    if bumper.get("showOutro", True):
        segs.append(_make_bumper_segment(bumper, json_data, fps))
    return segs


def _has_audio(url: str) -> bool:
    """Check if the media file has a valid audio stream."""
    if not url:
        return False
    try:
        probe = ffmpeg.probe(_local_path(url))
        for stream in probe.get("streams", []):
            if stream.get("codec_type") == "audio":
                return True
        return False
    except Exception:
        return False


def _encode_frames(frame_dir: str, fps: int, output_path: str, audio_source: str = None, duration: float = None):
    """Stitch a numbered JPEG sequence into an MP4 (libx264) and mux audio if available."""
    video_in = ffmpeg.input(os.path.join(frame_dir, "frame_%04d.jpg"), framerate=fps)
    dur = max(0.5, float(duration)) if duration else 5.0

    if audio_source and _has_audio(audio_source):
        try:
            audio_in = (
                ffmpeg
                .input(_local_path(audio_source))
                .filter("atrim", duration=dur)
                .filter("asetpts", "PTS-STARTPTS")
                # Normalize to the exact sample rate + channel layout used by the
                # silent-audio path below (44100 Hz stereo). `c=copy` concat
                # requires every segment to share identical codec/timebase/channel
                # params — without this, a 48 kHz round would desync/fail against
                # the 44.1 kHz silent bumper segments.
                .filter("aresample", "44100")
                .filter("aformat", "channel_layouts=stereo")
            )
            threads = min(2, os.cpu_count() or 1)
            (
                ffmpeg
                .output(
                    video_in,
                    audio_in,
                    output_path,
                    vcodec="libx264",
                    preset="veryfast",
                    threads=threads,
                    acodec="aac",
                    pix_fmt="yuv420p",
                    crf=23,
                    ar=44100,
                    ac=2,
                    t=dur,
                )
                .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
            )
            return
        except Exception:
            # Fall back to silent audio track if audio stream muxing fails
            pass

    # Generate with synchronized silent audio track for consistent multi-segment stitching
    silent_audio = ffmpeg.input("anullsrc=r=44100:cl=stereo", f="lavfi", t=dur)
    threads = min(2, os.cpu_count() or 1)
    (
        ffmpeg
        .output(
            video_in,
            silent_audio,
            output_path,
            vcodec="libx264",
            preset="veryfast",
            threads=threads,
            acodec="aac",
            pix_fmt="yuv420p",
            crf=23,
            ar=44100,
            ac=2,
            t=dur,
        )
        .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
    )


def _concat_segments(segment_files: list[str], output_path: str):
    """Concatenate already-encoded MP4 segments into one output via concat demuxer."""
    list_path = f"{output_path}.txt"
    try:
        with open(list_path, "w") as f:
            for p in segment_files:
                f.write(f"file '{p}'\n")
        (
            ffmpeg
            .input(list_path, format="concat", safe=0)
            .output(output_path, c="copy")
            .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
        )
    finally:
        if os.path.exists(list_path):
            os.remove(list_path)


async def render_video(task_id: str, json_data: dict, output_path: str,
                       progress_callback=None) -> str:
    """Render a news video to ``output_path``.

    Legacy single-round: ``json_data`` holds one headline + media directly.
    Multi-round: ``json_data["rounds"]`` is a non-empty list; each round is
    rendered (with media-derived timing) and the segments are concatenated
    into a single MP4.
    """
    template_path = _resolve_template_path(json_data)
    # Defensive clamping (the HTTP API path is already validated by Pydantic;
    # this protects the bot path, which builds the payload itself).
    try:
        fps = int(json_data.get("fps", 30))
    except (TypeError, ValueError):
        fps = 30
    fps = max(15, min(60, fps))

    resolution = json_data.get("resolution") or {}
    try:
        width = int(resolution.get("width", 1080))
        height = int(resolution.get("height", 1920))
    except (TypeError, ValueError):
        width, height = 1080, 1920
    width = max(120, min(3840, width))
    height = max(120, min(3840, height))
    # libx264 requires dimensions divisible by 2
    width = width - (width % 2)
    height = height - (height % 2)

    # Build the list of segments to render.
    rounds = json_data.get("rounds") or []
    if rounds:
        segments = []
        for i, r in enumerate(rounds):
            round_dict = {
                "accentColor": json_data.get("accentColor"),
                "backgroundColor": json_data.get("backgroundColor"),
                "labelAr": json_data.get("labelAr"),
                "labelEn": json_data.get("labelEn"),
                **{k: v for k, v in r.items() if v is not None},
            }
            segments.append(_round_segment(round_dict, i, fps))
        # Interleave brand "bumper" segments (intro / interstitial / outro).
        # Mirrors frontend/src/lib/timeline.ts::buildTimeline so the on-screen
        # preview and the rendered MP4 agree on segment order and timing.
        bumper = json_data.get("bumper") or {}
        if isinstance(bumper, dict) and bumper.get("enabled"):
            segments = _interleave_bumpers(segments, bumper, fps, json_data)
    else:
        duration = json_data.get("duration", 5)
        segments = [
            {
                "data": {**json_data, "roundIndex": 0},
                "duration": duration,
                "frames": max(1, int(duration * fps)),
            }
        ]
        bumper = json_data.get("bumper") or {}
        if isinstance(bumper, dict) and bumper.get("enabled"):
            segments = _interleave_bumpers(segments, bumper, fps, json_data)

    frame_root = os.path.join(os.path.dirname(output_path), f"frames_{task_id}")
    os.makedirs(frame_root, exist_ok=True)

    total_frames = sum(s["frames"] for s in segments)

    browser = None
    try:
        if progress_callback:
            progress_callback("STARTED", 0, "Launching browser...")

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                args=CHROMIUM_LOW_RAM_FLAGS,
                headless=True,
            )
            context = await browser.new_context(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
            )
            page = await context.new_page()

            if progress_callback:
                progress_callback("RENDERING", 0, "Loading template...")

            await page.goto(f"file://{template_path}", wait_until="domcontentloaded")

            captured = 0
            for seg_idx, seg in enumerate(segments):
                seg_dir = os.path.join(frame_root, f"round_{seg_idx}")
                os.makedirs(seg_dir, exist_ok=True)

                if progress_callback:
                    progress_callback(
                        "RENDERING",
                        0,
                        f"Round {seg_idx + 1}/{len(segments)}: loading news data...",
                    )

                await page.evaluate("(data) => window.loadNewsData(data)", seg["data"])

                for i in range(seg["frames"]):
                    await page.evaluate(f"window.seekToFrame({i}, {fps})")
                    frame_path = os.path.join(seg_dir, f"frame_{i:04d}.jpg")
                    await page.screenshot(path=frame_path, type="jpeg", quality=88)
                    captured += 1

                    if progress_callback and captured % max(1, total_frames // 10) == 0:
                        pct = int(captured / total_frames * 100)
                        progress_callback(
                            "RENDERING",
                            pct,
                            f"Frame {captured}/{total_frames} "
                            f"(round {seg_idx + 1}/{len(segments)})",
                        )

            await browser.close()
            browser = None

        if progress_callback:
            progress_callback("ENCODING", 0, "Stitching frames into video...")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        if len(segments) == 1:
            # Single round: encode straight from its frame directory.
            _encode_frames(
                os.path.join(frame_root, "round_0"),
                fps,
                output_path,
                audio_source=segments[0]["data"].get("videoUrl"),
                duration=segments[0]["duration"],
            )
        else:
            # Multi-round: encode each segment, then concatenate them.
            segment_files = []
            try:
                for seg_idx in range(len(segments)):
                    seg_mp4 = os.path.join(
                        os.path.dirname(output_path),
                        f"seg_{task_id}_{seg_idx}.mp4",
                    )
                    _encode_frames(
                        os.path.join(frame_root, f"round_{seg_idx}"),
                        fps,
                        seg_mp4,
                        audio_source=segments[seg_idx]["data"].get("videoUrl"),
                        duration=segments[seg_idx]["duration"],
                    )
                    segment_files.append(seg_mp4)
                _concat_segments(segment_files, output_path)
            finally:
                for f in segment_files:
                    if os.path.exists(f):
                        os.remove(f)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise RuntimeError(f"FFmpeg produced empty or missing output: {output_path}")

        if progress_callback:
            file_size = os.path.getsize(output_path)
            progress_callback("DONE", 100, f"Done ({file_size} bytes)")

        print(f"[{task_id}] Video saved to {output_path}")
        return output_path

    finally:
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass
        if os.path.exists(frame_root):
            shutil.rmtree(frame_root, ignore_errors=True)
            print(f"[{task_id}] Cleaned up frame directory")
        gc.collect()
