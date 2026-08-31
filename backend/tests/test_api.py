"""Hermetic API test suite for Kashida Video system.

Covers: schema validation, multi-round payloads, templates API, assets API, and task status.
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.main import app

client = TestClient(app)


# ────────────── SCHEMA & RENDER REQUEST TESTS ──────────────

def test_missing_headline_single_round():
    resp = client.post("/api/render-video", json={"subheadline": "test"})
    assert resp.status_code in (400, 422)


def test_empty_headline_single_round():
    resp = client.post("/api/render-video", json={"headline": ""})
    assert resp.status_code in (400, 422)


def test_invalid_duration():
    resp = client.post("/api/render-video", json={"headline": "test", "duration": -1})
    assert resp.status_code in (400, 422)


def test_invalid_fps():
    resp = client.post("/api/render-video", json={"headline": "test", "fps": 5})
    assert resp.status_code in (400, 422)


def test_valid_single_round_request():
    resp = client.post("/api/render-video", json={"headline": "schema test", "duration": 3, "fps": 30})
    assert resp.status_code == 200
    data = resp.json()
    assert "task_id" in data


def test_valid_multi_round_request():
    payload = {
        "template": "breaking_news",
        "fps": 30,
        "resolution": {"width": 1080, "height": 1920},
        "rounds": [
            {
                "headline": "الخبر الأول",
                "subheadline": "تفاصيل الخبر الأول",
                "duration": 4,
                "accentColor": "#e63946",
                "backgroundColor": "#0b0b0f",
            },
            {
                "headline": "الخبر الثاني",
                "subheadline": "تفاصيل الخبر الثاني",
                "duration": 5,
                "accentColor": "#e63946",
                "backgroundColor": "#0b0b0f",
            },
        ],
        "bumper": {
            "enabled": True,
            "showIntro": True,
            "showInterstitial": True,
            "showOutro": True,
            "duration": 2,
            "logoText": "كشيدة",
        },
    }
    resp = client.post("/api/render-video", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "task_id" in data


def test_multi_round_empty_round_headline_rejected():
    payload = {
        "template": "breaking_news",
        "rounds": [
            {"headline": ""},
        ],
    }
    resp = client.post("/api/render-video", json=payload)
    assert resp.status_code in (400, 422)


# ────────────── TEMPLATE TESTS ──────────────

def test_list_templates():
    resp = client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "templates" in data
    assert len(data["templates"]) >= 1


def test_get_template():
    resp = client.get("/api/templates/breaking_news")
    assert resp.status_code == 200
    data = resp.json()
    assert data["meta"]["id"] == "breaking_news"
    assert "data" in data


def test_template_not_found():
    resp = client.get("/api/templates/nonexistent_template_xyz")
    assert resp.status_code == 404


def test_template_version():
    resp = client.get("/api/templates/breaking_news/versions/1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"] == 1


# ────────────── ASSET TESTS ──────────────

def test_list_assets():
    resp = client.get("/api/assets")
    assert resp.status_code == 200
    data = resp.json()
    assert "assets" in data


def test_list_assets_by_category():
    resp = client.get("/api/assets?category=image")
    assert resp.status_code == 200


def test_asset_not_found():
    resp = client.get("/api/assets/image/nonexistent_asset_xyz.png")
    assert resp.status_code == 404


# ────────────── TASK STATUS TESTS ──────────────

def test_unknown_task_status():
    resp = client.get("/api/render-video/nonexistent123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("pending", "PENDING")

