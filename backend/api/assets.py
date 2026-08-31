"""Asset Management.

Handles upload, validation, storage, and resolution of images, videos,
audio, and fonts for the rendering pipeline.

Assets are stored under data/assets/{type}/ and referenced by stable
identifiers (filenames). The renderer resolves assets deterministically.
"""

import mimetypes
import os
import re
from pathlib import Path
from typing import Optional

ASSETS_DIR = Path(__file__).resolve().parent.parent / "data" / "assets"

ALLOWED_TYPES = {
    "image": {".png", ".jpg", ".jpeg", ".webp", ".svg"},
    "video": {".mp4", ".webm", ".mov"},
    "audio": {".mp3", ".wav", ".ogg", ".aac"},
    "font": {".ttf", ".otf", ".woff", ".woff2"},
}

MAX_FILE_SIZE_MB = 50

# Only filesystem-safe filenames — blocks path traversal, null bytes, shell metacharacters.
_SAFE_FILENAME_RE = re.compile(r'^[\w\-\.]+$', re.UNICODE)


def _sanitize_filename(filename: str) -> str:
    """Strip directory components and reject unsafe filenames."""
    from pathlib import Path
    name = Path(filename).name  # strip any directory prefix (../, ..\\, etc.)
    if not name or not _SAFE_FILENAME_RE.fullmatch(name):
        raise ValueError(f"Unsafe filename: {filename!r}")
    return name


def _ensure_dirs():
    for subdir in ALLOWED_TYPES:
        (ASSETS_DIR / subdir).mkdir(parents=True, exist_ok=True)


def asset_category(filename: str) -> Optional[str]:
    ext = Path(filename).suffix.lower()
    for category, extensions in ALLOWED_TYPES.items():
        if ext in extensions:
            return category
    return None


def upload_asset(category: str, filename: str, data: bytes) -> dict:
    filename = _sanitize_filename(filename)
    _ensure_dirs()
    if category not in ALLOWED_TYPES:
        raise ValueError(f"Unknown asset category '{category}'")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_TYPES[category]:
        raise ValueError(f"File type '{ext}' not allowed for category '{category}'")
    if len(data) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise ValueError(f"File exceeds {MAX_FILE_SIZE_MB}MB limit")

    dest = ASSETS_DIR / category / filename
    with open(dest, "wb") as f:
        f.write(data)

    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return {
        "category": category,
        "filename": filename,
        "path": str(dest),
        "size": len(data),
        "mime": mime,
    }


def resolve_asset(category: str, filename: str) -> Optional[Path]:
    filename = _sanitize_filename(filename)
    path = ASSETS_DIR / category / filename
    if path.exists() and path.is_file():
        return path
    return None


def list_assets(category: Optional[str] = None) -> list[dict]:
    _ensure_dirs()
    categories = [category] if category else list(ALLOWED_TYPES.keys())
    result = []
    for cat in categories:
        cat_dir = ASSETS_DIR / cat
        for f in sorted(cat_dir.iterdir()):
            if f.is_file():
                mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
                result.append({
                    "category": cat,
                    "filename": f.name,
                    "size": f.stat().st_size,
                    "mime": mime,
                })
    return result


def delete_asset(category: str, filename: str) -> bool:
    filename = _sanitize_filename(filename)
    path = ASSETS_DIR / category / filename
    if path.exists() and path.is_file():
        path.unlink()
        return True
    return False


def validate_asset(category: str, filename: str) -> dict:
    filename = _sanitize_filename(filename)
    path = resolve_asset(category, filename)
    if path is None:
        return {"valid": False, "error": "not_found"}
    if not os.access(path, os.R_OK):
        return {"valid": False, "error": "not_readable"}
    return {
        "valid": True,
        "category": category,
        "filename": filename,
        "size": path.stat().st_size,
    }


def validate_assets_for_render(asset_refs: list[dict]) -> list[dict]:
    results = []
    for ref in asset_refs:
        cat = ref.get("category", "")
        fname = ref.get("filename", "")
        results.append(validate_asset(cat, fname))
    return results
