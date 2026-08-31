"""Unit tests for workers.renderer — the between-rounds / bumper segment logic.

These are pure-function tests (no browser, no ffmpeg) that pin the exact segment
ordering/timing that BOTH the frontend timeline and the rendered MP4 must agree
on. They mirror frontend/src/lib/timeline.test.ts.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from workers.renderer import (
    _resolve_template_path,
    _round_duration,
    _round_segment,
    _make_bumper_segment,
    _interleave_bumpers,
    TEMPLATE_ID_RE,
)


def _seg_kinds(segs):
    """['B', 'R0', 'B', ...] — bumper vs round-index labels."""
    out = []
    for s in segs:
        out.append("B" if s["data"].get("isBumper") else f"R{s['data'].get('round_index')}")
    return out


# ---- template path resolution ----
def test_resolve_known_template():
    p = _resolve_template_path({"template": "breaking_news"})
    assert p.endswith("breaking_news.html")


def test_resolve_strips_html_suffix():
    p = _resolve_template_path({"template": "breaking_news.html"})
    assert p.endswith("breaking_news.html")


def test_resolve_path_traversal_blocked():
    p = _resolve_template_path({"template": "../../etc/passwd"})
    assert p.endswith("breaking_news.html")


def test_resolve_unknown_falls_back():
    p = _resolve_template_path({"template": "no_such_template_xyz"})
    assert p.endswith("breaking_news.html")


# ---- round duration derivation ----
def test_round_duration_explicit_wins():
    assert _round_duration({"duration": 7}) == 7.0


def test_round_duration_image_defaults_to_5():
    assert _round_duration({"imageUrl": "x.png"}) == 5.0


def test_round_duration_no_media_is_5():
    assert _round_duration({}) == 5.0


def test_round_duration_bad_video_falls_back_to_5():
    assert _round_duration({"videoUrl": "/does/not/exist.mp4"}) == 5.0


# ---- round segment (roundIndex injection for animateFirstRoundOnly) ----
def test_round_segment_injects_round_index():
    seg = _round_segment({"headline": "h", "duration": 3}, 0, 30)
    assert seg["data"]["roundIndex"] == 0
    assert seg["duration"] == 3.0
    assert seg["frames"] == 90


def test_round_segment_indexes_second_round():
    seg = _round_segment({"headline": "h", "duration": 2}, 3, 30)
    assert seg["data"]["roundIndex"] == 3


def test_round_segment_preserves_user_fields():
    seg = _round_segment({"headline": "خبر", "accentColor": "#abc", "duration": 1}, 1, 30)
    assert seg["data"]["headline"] == "خبر"
    assert seg["data"]["accentColor"] == "#abc"
    assert seg["data"]["roundIndex"] == 1


# ---- bumper segment ----
def test_make_bumper_segment_defaults():
    seg = _make_bumper_segment({}, {"backgroundColor": "#111", "accentColor": "#ff0"}, 30)
    assert seg["data"]["isBumper"] is True
    assert seg["data"]["logoText"] == "KASHIDA"
    assert seg["duration"] == 2.0
    assert seg["frames"] == 60


def test_make_bumper_segment_overrides():
    seg = _make_bumper_segment(
        {"duration": 3, "logoText": "الخبر", "backgroundColor": "#000", "accentColor": "#abc"},
        {},
        30,
    )
    assert seg["duration"] == 3.0
    assert seg["frames"] == 90
    assert seg["data"]["logoText"] == "الخبر"
    assert seg["data"]["backgroundColor"] == "#000"


# ---- interleave bumpers (the "between rounds" ordering) ----
def _rounds(n=2, dur=3):
    return [
        {
            "data": {"isBumper": False, "round_index": i, "headline": f"h{i}"},
            "duration": dur,
            "frames": int(dur * 30),
        }
        for i in range(n)
    ]


def test_interleave_full_bumpers():
    segs = _interleave_bumpers(_rounds(2), {"enabled": True, "duration": 2}, 30, {})
    assert _seg_kinds(segs) == ["B", "R0", "B", "R1", "B"]


def test_interleave_single_round_no_interstitial():
    segs = _interleave_bumpers(_rounds(1), {"enabled": True, "duration": 2}, 30, {})
    assert _seg_kinds(segs) == ["B", "R0", "B"]


def test_interleave_no_intro():
    segs = _interleave_bumpers(
        _rounds(2), {"enabled": True, "duration": 2, "showIntro": False}, 30, {}
    )
    assert _seg_kinds(segs) == ["R0", "B", "R1", "B"]


def test_interleave_no_outro():
    segs = _interleave_bumpers(
        _rounds(2), {"enabled": True, "duration": 2, "showOutro": False}, 30, {}
    )
    assert _seg_kinds(segs) == ["B", "R0", "B", "R1"]


def test_interleave_no_interstitial():
    segs = _interleave_bumpers(
        _rounds(2), {"enabled": True, "duration": 2, "showInterstitial": False}, 30, {}
    )
    assert _seg_kinds(segs) == ["B", "R0", "R1", "B"]


def test_interleave_defaults_to_all_bumpers():
    """No enabled key is treated as enabled (caller guards disabled upstream)."""
    segs = _interleave_bumpers(_rounds(2), {"duration": 2}, 30, {})
    assert _seg_kinds(segs) == ["B", "R0", "B", "R1", "B"]


def test_segment_durations_total_12():
    """Total duration of B(2) R0(3) B(2) R1(3) B(2) = 12."""
    segs = _interleave_bumpers(_rounds(2), {"enabled": True, "duration": 2}, 30, {})
    total = sum(s["duration"] for s in segs)
    assert total == pytest.approx(12.0)
