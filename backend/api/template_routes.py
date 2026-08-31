"""Template management API endpoints."""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.templates import (
    create_template,
    delete_template,
    list_templates,
    load_template,
    load_version,
    persist_meta,
    save_template,
    save_template_html,
    validate_template_id,
    TemplateMeta,
)

router = APIRouter()

# Reasonable upper bounds to prevent oversized / abusive template payloads.
MAX_ID_LEN = 64
MAX_NAME_LEN = 200
MAX_DESCRIPTION_LEN = 2000
MAX_TAGS = 50
MAX_TAG_LEN = 100
MAX_DATA_BYTES = 1_000_000  # ~1 MB of serialized template data
MAX_HTML_BYTES = 750_000  # ~750 KB of generated HTML


class CreateTemplateBody(BaseModel):
    id: str = Field(..., max_length=MAX_ID_LEN)
    name: str = Field(default="", max_length=MAX_NAME_LEN)
    data: dict = Field(default_factory=dict)
    description: str = Field(default="", max_length=MAX_DESCRIPTION_LEN)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)
    html: str = Field(default="", max_length=MAX_HTML_BYTES)
    # When False the save updates the existing record in place without bumping
    # the version or writing a new snapshot — used by autosaves so they don't
    # spam the version history. Manual saves default to True (a checkpoint).
    create_version: bool = True


class UpdateTemplateBody(BaseModel):
    data: dict = Field(default_factory=dict)
    html: str = Field(default="", max_length=MAX_HTML_BYTES)
    create_version: bool = True


def _valid_id_or_400(template_id: str) -> None:
    try:
        validate_template_id(template_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _check_size(data: dict, html: str) -> None:
    data_bytes = len(json.dumps(data))
    if data_bytes > MAX_DATA_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Template data too large ({data_bytes} bytes > {MAX_DATA_BYTES})",
        )
    if len(html) > MAX_HTML_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Template HTML too large ({len(html)} bytes > {MAX_HTML_BYTES})",
        )


def _validate_tags(tags: list[str]) -> None:
    for t in tags:
        if len(t) > MAX_TAG_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"Tag too long ({len(t)} chars > {MAX_TAG_LEN})",
            )


@router.get("/api/templates")
def get_templates():
    metas = list_templates()
    return {"templates": [m.model_dump() for m in metas]}


@router.get("/api/templates/{template_id}")
def get_template(template_id: str):
    _valid_id_or_400(template_id)
    record = load_template(template_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return record.model_dump()


@router.post("/api/templates")
def create_new_template(body: CreateTemplateBody):
    _valid_id_or_400(body.id)
    _check_size(body.data, body.html)
    _validate_tags(body.tags)
    # Upsert: if the template already exists, update it instead of returning 409.
    # This makes saving idempotent regardless of whether the template was created
    # on the backend or in a previous session.
    existing = load_template(body.id)
    if existing is not None:
        record = save_template(body.id, body.data, bump_version=body.create_version)
        record.meta.name = body.name or existing.meta.name
        record.meta.description = body.description or existing.meta.description
        record.meta.tags = body.tags or existing.meta.tags
        persist_meta(record)
    else:
        record = create_template(body.id, body.name, body.data, body.description, body.tags)
    if body.html:
        save_template_html(body.id, body.html)
    return record.model_dump()


@router.put("/api/templates/{template_id}")
def update_template(template_id: str, body: UpdateTemplateBody):
    _valid_id_or_400(template_id)
    _check_size(body.data, body.html)
    try:
        record = save_template(template_id, body.data, bump_version=body.create_version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if body.html:
        save_template_html(template_id, body.html)
    return record.model_dump()


@router.delete("/api/templates/{template_id}")
def delete_existing_template(template_id: str):
    _valid_id_or_400(template_id)
    if not delete_template(template_id):
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return {"deleted": True}


@router.get("/api/templates/{template_id}/versions/{version}")
def get_template_version(template_id: str, version: int):
    _valid_id_or_400(template_id)
    data = load_version(template_id, version)
    if data is None:
        raise HTTPException(status_code=404,
                            detail=f"Version {version} of '{template_id}' not found")
    return {"template_id": template_id, "version": version, "data": data}
