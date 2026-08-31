import asyncio
import os
import threading
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks
from celery.result import AsyncResult

import time
from collections import OrderedDict

from api.contracts import VideoRequest
from workers.renderer import render_video

router = APIRouter()
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class _BoundedTaskStore:
    """LRU-bounded in-memory task store with TTL eviction."""

    def __init__(self, max_size: int = 500, ttl_seconds: float = 3600):
        self._store: OrderedDict[str, dict] = OrderedDict()
        self._max = max_size
        self._ttl = ttl_seconds
        self._lock = threading.Lock()

    def set(self, task_id: str, data: dict) -> None:
        entry = {**data, "_ts": time.time()}
        with self._lock:
            self._store[task_id] = entry
            self._store.move_to_end(task_id)
            while len(self._store) > self._max:
                self._store.popitem(last=False)

    def get(self, task_id: str) -> dict | None:
        with self._lock:
            entry = self._store.get(task_id)
            if entry is None:
                return None
            if time.time() - entry["_ts"] > self._ttl:
                del self._store[task_id]
                return None
            return entry


in_memory_tasks = _BoundedTaskStore()


def _run_direct_render(task_id: str, json_data: dict):
    output_path = os.path.join(BACKEND_DIR, "static", "videos", f"{task_id}.mp4")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    in_memory_tasks.set(task_id, {
        "task_id": task_id,
        "status": "STARTED",
        "percent": 10,
        "message": "Initializing direct renderer...",
    })

    def progress_cb(state, percent, message):
        in_memory_tasks.set(task_id, {
            "task_id": task_id,
            "status": state,
            "percent": percent,
            "message": message,
        })

    try:
        result_path = asyncio.run(render_video(task_id, json_data, output_path, progress_cb))
        file_size = os.path.getsize(result_path) if os.path.exists(result_path) else 0
        in_memory_tasks.set(task_id, {
            "task_id": task_id,
            "output_path": result_path,
            "output_url": f"/videos/{task_id}.mp4",
            "status": "completed",
            "percent": 100,
            "file_size": file_size,
        })
    except Exception as e:
        in_memory_tasks.set(task_id, {
            "task_id": task_id,
            "status": "failed",
            "error": str(e),
            "percent": 0,
        })


def _get_render_task():
    try:
        from workers.tasks import render_video_task
        return render_video_task
    except Exception:
        return None


@router.post("/api/render-video")
def render_video_endpoint(body: VideoRequest):
    task_id = uuid4().hex
    json_data = body.model_dump()

    # Attempt Celery queuing first
    celery_success = False
    try:
        render_task = _get_render_task()
        if render_task:
            render_task.apply_async(args=[task_id, json_data], task_id=task_id)
            celery_success = True
    except Exception:
        celery_success = False

    # Fallback to direct thread if Celery/Redis is unreachable
    if not celery_success:
        t = threading.Thread(target=_run_direct_render, args=(task_id, json_data), daemon=True)
        t.start()

    return {"task_id": task_id, "status": "queued"}


@router.get("/api/render-video/{task_id}")
def get_render_status(task_id: str):
    # Check in-memory tasks first
    task_info = in_memory_tasks.get(task_id)
    if task_info is not None:
        return task_info

    # Check Celery result
    try:
        from workers.celery_app import app as celery_app
        result = AsyncResult(task_id, app=celery_app)

        if result.ready():
            if result.successful():
                return {
                    "task_id": task_id,
                    "status": "completed",
                    **result.result,
                }
            return {
                "task_id": task_id,
                "status": "failed",
                "error": str(result.result),
            }

        meta = result.info if result.info else {}
        return {
            "task_id": task_id,
            "status": meta.get("status", result.state or "pending"),
            "percent": meta.get("percent", 0),
            "message": meta.get("message", ""),
        }
    except Exception:
        return {"task_id": task_id, "status": "pending", "percent": 0}
