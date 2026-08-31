from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8001").split(",")

app = FastAPI(title="Kashida Video API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from api.routes import router  # noqa: E402
from api.template_routes import router as template_router  # noqa: E402
from api.asset_routes import router as asset_router  # noqa: E402

app.include_router(router)
app.include_router(template_router)
app.include_router(asset_router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
ASSETS_DIR = Path(__file__).resolve().parent.parent / "data" / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/videos", StaticFiles(directory=str(STATIC_DIR / "videos")), name="videos")
app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup_seed():
    from api.templates import seed_default_templates
    seed_default_templates()


@app.post("/api/telegram/webhook")
async def telegram_webhook(request: Request):
    from telegram import Update

    from api.telegram import handle_update

    data = await request.json()
    update = Update.de_json(data, None)
    await handle_update(update)
    return {"ok": True}
