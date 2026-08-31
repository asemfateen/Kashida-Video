"""Template Storage and Management.

File-based versioned template storage. Templates are stored as JSON files
in backend/data/templates/. Each template has an ID, version history,
and a canonical JSON schema that the renderer consumes.
"""

import json
import os
import re
import time
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "data" / "templates"
TEMPLATES_HTML_DIR = Path(__file__).resolve().parent.parent / "templates"

# Template ids may only contain URL-safe, filesystem-safe characters. This
# prevents path traversal through template ids (e.g. "../../etc/passwd" or
# "foo/bar") when writing template JSON/HTML files.
TEMPLATE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def validate_template_id(template_id: str) -> None:
    """Raise ValueError if ``template_id`` is unsafe for use in file paths."""
    if not isinstance(template_id, str) or not TEMPLATE_ID_RE.fullmatch(template_id):
        raise ValueError(f"Invalid template id: {template_id!r}")


class TemplateMeta(BaseModel):
    id: str
    name: str
    description: str = ""
    version: int = 1
    created_at: float
    updated_at: float
    tags: list[str] = []


class TemplateRecord(BaseModel):
    meta: TemplateMeta
    data: dict


def _ensure_dir():
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)


def _meta_path(template_id: str) -> Path:
    return TEMPLATES_DIR / f"{template_id}.json"


def _versions_dir(template_id: str) -> Path:
    return TEMPLATES_DIR / template_id / "versions"


def create_template(template_id: str, name: str, data: dict,
                    description: str = "", tags: list[str] = None) -> TemplateRecord:
    validate_template_id(template_id)
    _ensure_dir()
    now = time.time()
    meta = TemplateMeta(
        id=template_id,
        name=name,
        description=description,
        version=1,
        created_at=now,
        updated_at=now,
        tags=tags or [],
    )
    record = TemplateRecord(meta=meta, data=data)
    _save(record)
    _save_version(record)
    return record


def save_template(template_id: str, data: dict, bump_version: bool = True) -> TemplateRecord:
    """Update an existing template's data.

    When ``bump_version`` is False the record is updated in place (same version,
    no new version snapshot). This is used for autosaves, which happen constantly
    and shouldn't fork throwaway versions — only meaningful manual saves should
    create a checkpoint.
    """
    validate_template_id(template_id)
    _ensure_dir()
    record = load_template(template_id)
    if record is None:
        raise ValueError(f"Template '{template_id}' not found")
    record.meta.updated_at = time.time()
    record.data = data
    if bump_version:
        record.meta.version += 1
        _save_version(record)
    _save(record)
    return record


def load_template(template_id: str) -> Optional[TemplateRecord]:
    validate_template_id(template_id)
    path = _meta_path(template_id)
    if not path.exists():
        return None
    with open(path) as f:
        raw = json.load(f)
    return TemplateRecord(**raw)


def list_templates() -> list[TemplateMeta]:
    _ensure_dir()
    result = []
    for p in sorted(TEMPLATES_DIR.glob("*.json")):
        try:
            with open(p) as f:
                raw = json.load(f)
            result.append(TemplateMeta(**raw["meta"]))
        except Exception:
            continue
    return result


def delete_template(template_id: str) -> bool:
    validate_template_id(template_id)
    path = _meta_path(template_id)
    if not path.exists():
        return False
    path.unlink()
    vers_dir = _versions_dir(template_id)
    if vers_dir.exists():
        import shutil
        shutil.rmtree(vers_dir)
    html_path = TEMPLATES_HTML_DIR / f"{template_id}.html"
    if html_path.exists():
        html_path.unlink()
    return True


def _save(record: TemplateRecord):
    path = _meta_path(record.meta.id)
    with open(path, "w") as f:
        json.dump(record.model_dump(), f, ensure_ascii=False, indent=2)


def _save_version(record: TemplateRecord):
    vdir = _versions_dir(record.meta.id)
    vdir.mkdir(parents=True, exist_ok=True)
    vpath = vdir / f"v{record.meta.version}.json"
    with open(vpath, "w") as f:
        json.dump(record.data, f, ensure_ascii=False, indent=2)


def persist_meta(record: TemplateRecord):
    """Persist a template's meta (name/description/tags) without bumping version."""
    _save(record)


def save_template_html(template_id: str, html: str):
    """Write the generated renderable HTML for a template to backend/templates/.

    The renderer resolves templates by looking for ``<id>.html`` in
    ``backend/templates/``, so web-created templates must be written here to be
    usable by the bot and the render API.
    """
    validate_template_id(template_id)
    TEMPLATES_HTML_DIR.mkdir(parents=True, exist_ok=True)
    path = TEMPLATES_HTML_DIR / f"{template_id}.html"
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def load_version(template_id: str, version: int) -> Optional[dict]:
    validate_template_id(template_id)
    vpath = _versions_dir(template_id) / f"v{version}.json"
    if not vpath.exists():
        return None
    with open(vpath) as f:
        return json.load(f)


def seed_default_templates():
    """Create default templates if none exist."""
    templates_to_seed = [
        {
            "id": "breaking_news",
            "name": "🚨 خبر عاجل (Breaking News)",
            "description": "قالب الأخبار العاجلة والتغطية المباشرة",
            "tags": ["news", "breaking"],
            "data": {
                "template": "breaking_news",
                "headline": "",
                "subheadline": "كشيدة",
                "accentColor": "#e63946",
                "backgroundColor": "#0b0b0f",
                "duration": 5,
                "fps": 30,
                "resolution": {"width": 1080, "height": 1920},
                "labelAr": "عاجل",
                "labelEn": "BREAKING",
            },
        },
        {
            "id": "opinion_quote",
            "name": "💬 اقتباس وتصريح (Quote & Statement)",
            "description": "قالب اقتباس التصريحات والكلمات الرسمية",
            "tags": ["quote", "statement"],
            "data": {
                "template": "opinion_quote",
                "headline": "",
                "subheadline": "تصريح رسمي",
                "accentColor": "#e63946",
                "backgroundColor": "#0b0b0f",
                "duration": 5,
                "fps": 30,
                "resolution": {"width": 1080, "height": 1920},
                "labelAr": "اقتباس",
                "labelEn": "STATEMENT",
            },
        },
        {
            "id": "economy_report",
            "name": "📊 تقرير اقتصادي (Economy & Markets)",
            "description": "قالب الأخبار الاقتصادية والمالية",
            "tags": ["economy", "markets"],
            "data": {
                "template": "economy_report",
                "headline": "",
                "subheadline": "أسواق المال",
                "accentColor": "#FFB703",
                "backgroundColor": "#080b12",
                "duration": 5,
                "fps": 30,
                "resolution": {"width": 1080, "height": 1920},
                "labelAr": "اقتصاد",
                "labelEn": "MARKETS",
            },
        },
        {
            "id": "sports_highlight",
            "name": "🏆 تغطية رياضية (Sports Highlight)",
            "description": "قالب الأحداث والتغطيات الرياضية",
            "tags": ["sports", "highlight"],
            "data": {
                "template": "sports_highlight",
                "headline": "",
                "subheadline": "متابعة رياضية",
                "accentColor": "#00F5D4",
                "backgroundColor": "#06110e",
                "duration": 5,
                "fps": 30,
                "resolution": {"width": 1080, "height": 1920},
                "labelAr": "رياضة",
                "labelEn": "SPORTS",
            },
        },
        {
            "id": "reel_card_news",
            "name": "🎴 بطاقة ريلز إخبارية (Reel News Card)",
            "description": "قالب بطاقة الأخبار العريضة لريلز وتيك توك مع حركة الكلمات المتقطعة وشارة خاصة",
            "tags": ["reels", "news", "card"],
            "data": {
                "template": "reel_card_news",
                "headline": "",
                "subheadline": "تغطية ميدانية",
                "accentColor": "#E41E3F",
                "backgroundColor": "#0b0b0f",
                "duration": 5,
                "fps": 30,
                "resolution": {"width": 1080, "height": 1920},
                "labelAr": "خاص",
                "labelEn": "SPECIAL",
            },
        },
        {
            "id": "sports_pill_highlight",
            "name": "⚽ كبسولات ريلز الرياضية (Stacked Highlight Pills)",
            "description": "قالب الكبسولات الملوّنة المتراكمة لعناوين الريلز والرياضة والترندات",
            "tags": ["reels", "sports", "pills"],
            "data": {
                "template": "sports_pill_highlight",
                "headline": "",
                "subheadline": "تغطية رياضية",
                "accentColor": "#7C3AED",
                "backgroundColor": "#0b0b0f",
                "duration": 5,
                "fps": 30,
                "resolution": {"width": 1080, "height": 1920},
                "labelAr": "مونديال 🏆",
                "labelEn": "",
            },
        },
    ]

    for item in templates_to_seed:
        if load_template(item["id"]) is None:
            create_template(
                item["id"],
                item["name"],
                item["data"],
                description=item["description"],
                tags=item["tags"],
            )
