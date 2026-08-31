import asyncio
import os

from .celery_app import app
from .renderer import render_video

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.task(bind=True, name="render_video", max_retries=0, acks_late=False)
def render_video_task(self, task_id: str, json_data: dict):
    """
    Celery task with full lifecycle: QUEUED → STARTED → RENDERING → ENCODING → SUCCESS/FAILED

    Uses self.update_state() so the status API can report real-time progress.
    """
    output_path = os.path.join(BACKEND_DIR, "static", "videos", f"{task_id}.mp4")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"[{task_id}] QUEUED → STARTED")

    def progress_callback(state, percent, message):
        self.update_state(
            state=state,
            meta={
                "task_id": task_id,
                "status": state,
                "percent": percent,
                "message": message,
            },
        )
        print(f"[{task_id}] {state} ({percent}%): {message}")

    try:
        result_path = asyncio.run(
            render_video(task_id, json_data, output_path, progress_callback)
        )
        file_size = os.path.getsize(result_path) if os.path.exists(result_path) else 0
        return {
            "task_id": task_id,
            "output_path": result_path,
            "output_url": f"/videos/{task_id}.mp4",
            "status": "completed",
            "file_size": file_size,
        }
    except Exception as e:
        print(f"[{task_id}] FAILED: {e}")
        # Cleanup partial output on failure
        if os.path.exists(output_path):
            os.remove(output_path)
        raise
