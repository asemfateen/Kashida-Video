import os

from celery import Celery
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "kashida_video",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,
    worker_prefetch_multiplier=1,
    worker_concurrency=1,  # Single-render concurrency prevents RAM exhaustion on 2GB-4GB VPS
    worker_max_tasks_per_child=10,  # Recycle worker child to release fragmented memory
    worker_max_memory_per_child=350000,  # Auto-recycle worker child if RSS exceeds 350MB
    task_acks_late=True,
)

app.autodiscover_tasks(["workers"])
