"""Canonical JSON contract for the Kashida Video rendering pipeline.

This module defines the Pydantic models that govern the shape of a render
request.  Every field that reaches the renderer and the HTML template must
pass through these models first, giving us a single source of truth for
validation and defaults.

VideoRequest fields
-------------------
Required:
    headline        – Main headline text (Arabic).  Must be non-empty.

Optional (with defaults):
    template        – Template to render.  Default "breaking_news".
    subheadline     – Secondary text below the headline.  Default "".
    accentColor     – Hex colour used for accents (bars, labels, live dot).
                      Default "#e63946".
    backgroundColor – Background hex colour.  Default "#0b0b0f".
    duration        – Video length in seconds, clamped to [1, 30].
                      Default 5.
    fps             – Frames per second, clamped to [15, 60].  Default 30.
    resolution      – Output resolution as {width, height}.
                      Default {width: 1080, height: 1920}.
    labelAr         – Arabic text for the breaking-news badge.
                      Default "عاجل".
    labelEn         – English text for the breaking-news badge.
                      Default "BREAKING".
    timestamp       – Timestamp string shown on the overlay.  Default "".
"""

from pydantic import BaseModel, Field


class VideoResolution(BaseModel):
    width: int = Field(default=1080, ge=120, le=3840)
    height: int = Field(default=1920, ge=120, le=3840)


class NewsRound(BaseModel):
    """A single news item within a multi-round video.

    One news bulletin video can be composed of several rounds, each carrying
    its own headline, media (image or video — text-only is not allowed), colors,
    badge labels, and background placement.

    Timing is derived from the round's media: a video background lasts as long
    as the clip itself; an image (or media-less) round defaults to 5 seconds,
    unless ``duration`` is explicitly provided to override that.
    """

    headline: str = Field(default="", max_length=500, description="Main headline text (Arabic)")
    subheadline: str = Field(default="", max_length=500)
    accentColor: str = Field(default="#e63946", pattern=r"^#[0-9a-fA-F]{6}$")
    backgroundColor: str = Field(default="#0b0b0f", pattern=r"^#[0-9a-fA-F]{6}$")
    duration: float = Field(default=0, ge=0, le=60, description="Optional explicit duration override (0 = derive from media)")
    labelAr: str = Field(default="عاجل", max_length=50)
    labelEn: str = Field(default="BREAKING", max_length=50)
    timestamp: str = Field(default="", max_length=100)
    imageUrl: str = Field(default="", description="URL or path of background image")
    videoUrl: str = Field(default="", description="URL, data URL, or asset path of background video clip")
    videoScale: float = Field(default=1.0, ge=0.5, le=3.0)
    videoPositionX: int = Field(default=50, ge=0, le=100)
    videoPositionY: int = Field(default=50, ge=0, le=100)
    videoFit: str = Field(default="cover")
    imageScale: float = Field(default=1.0, ge=0.5, le=3.0)
    imagePositionX: int = Field(default=50, ge=0, le=100)
    imagePositionY: int = Field(default=50, ge=0, le=100)
    imageFit: str = Field(default="cover")
    overlayOpacity: float = Field(default=0.6, ge=0.0, le=1.0)


class BumperConfig(BaseModel):
    """The brand "bumper" — a logo + transition interstitial between news rounds.

    Played before the first round (intro), between rounds (interstitial), and
    after the last round (outro), each toggleable. The logo entrance animation is
    the transition, and ``duration`` is user-settable. Absent on the request
    (or ``enabled=false``) means no bumpers (legacy behaviour).
    """

    enabled: bool = False
    showIntro: bool = True
    showInterstitial: bool = True
    showOutro: bool = True
    duration: float = Field(default=2, ge=0.2, le=10)
    backgroundColor: str = Field(default="#0b0b0f", pattern=r"^#[0-9a-fA-F]{6}$")
    accentColor: str = Field(default="#e63946", pattern=r"^#[0-9a-fA-F]{6}$")
    logoImageUrl: str = Field(default="", description="Optional image logo (URL or asset path)")
    logoText: str = Field(default="KASHIDA", max_length=200)
    slogan: str = Field(default="", max_length=300)


class VideoRequest(BaseModel):
    template: str = "breaking_news"
    headline: str = Field(default="", max_length=500, description="Main headline text (Arabic)")
    subheadline: str = Field(default="", max_length=500)
    accentColor: str = Field(default="#e63946", pattern=r"^#[0-9a-fA-F]{6}$")
    backgroundColor: str = Field(default="#0b0b0f", pattern=r"^#[0-9a-fA-F]{6}$")
    duration: float = Field(default=5, ge=1, le=30)
    fps: int = Field(default=30, ge=15, le=60)
    resolution: VideoResolution = VideoResolution()
    labelAr: str = Field(default="عاجل", max_length=50)
    labelEn: str = Field(default="BREAKING", max_length=50)
    timestamp: str = Field(default="", max_length=100)
    imageUrl: str = Field(default="", description="URL or path of background image (fallback)")
    videoUrl: str = Field(default="", description="URL, data URL, or asset path of background video loop")
    videoScale: float = Field(default=1.0, ge=0.5, le=3.0)
    videoPositionX: int = Field(default=50, ge=0, le=100)
    videoPositionY: int = Field(default=50, ge=0, le=100)
    videoFit: str = Field(default="cover")
    imageScale: float = Field(default=1.0, ge=0.5, le=3.0)
    imagePositionX: int = Field(default=50, ge=0, le=100)
    imagePositionY: int = Field(default=50, ge=0, le=100)
    imageFit: str = Field(default="cover")
    overlayOpacity: float = Field(default=0.6, ge=0.0, le=1.0)
    rounds: list[NewsRound] = Field(
        default=[],
        description="Optional list of news rounds for a multi-round video. "
                    "When provided, each round is rendered and concatenated into "
                    "one MP4. Ignored if empty (single-round legacy flow).",
    )
    bumper: BumperConfig | None = Field(
        default=None,
        description="Optional brand bumper (logo + transition interstitial). When "
                    "set and enabled, intro/interstitial/outro bumper segments are "
                    "rendered around the rounds. Absent or disabled = no bumpers.",
    )

    def model_post_init(self, __context):
        # When rounds are not supplied, headline is required and frame cap applies
        if not self.rounds:
            if not self.headline.strip():
                raise ValueError("headline is required when rounds is empty")
            total_frames = self.fps * self.duration
            if total_frames > 1800:
                raise ValueError(f"fps × duration ({total_frames}) exceeds max 1800 frames")
        else:
            # Multi-round validation
            for i, r in enumerate(self.rounds):
                if not r.headline.strip():
                    raise ValueError(f"round[{i}].headline cannot be empty")
