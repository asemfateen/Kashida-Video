"""Asset management API endpoints."""

from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Optional

from api.assets import (
    delete_asset,
    list_assets,
    resolve_asset,
    upload_asset,
    validate_asset,
)

router = APIRouter()


@router.get("/api/assets")
def get_assets(category: Optional[str] = None):
    return {"assets": list_assets(category)}


@router.post("/api/assets/{category}")
async def upload_new_asset(category: str, file: UploadFile = File(...)):
    data = await file.read()
    try:
        from pathlib import Path
        safe_name = Path(file.filename).name if file.filename else "upload"
        result = upload_asset(category, safe_name, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get("/api/assets/{category}/{filename}")
def get_asset(category: str, filename: str):
    path = resolve_asset(category, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {
        "category": category,
        "filename": filename,
        "size": path.stat().st_size,
    }


@router.delete("/api/assets/{category}/{filename}")
def delete_existing_asset(category: str, filename: str):
    if not delete_asset(category, filename):
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"deleted": True}


@router.get("/api/assets/{category}/{filename}/validate")
def validate_existing_asset(category: str, filename: str):
    result = validate_asset(category, filename)
    if not result["valid"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
