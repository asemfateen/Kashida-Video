# Kashida Video

Automated Arabic news video generation platform with Twick editor integration and Telegram delivery.

## Architecture

```
Frontend (React/Vite) → FastAPI → Celery+Redis → Playwright (frame capture) → FFmpeg → MP4
```

## Quick Start

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Start Redis
nohup /tmp/redis-stable/src/redis-server --daemonize yes --port 6379 &

# Start services
uvicorn api.main:app --reload --port 8001 &
celery -A workers.celery_app.app worker --loglevel=info --pool=solo &
python -m api.bot &

# Frontend
cd frontend && npm install && npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/render-video` | Submit render job |
| GET | `/api/render-video/{task_id}` | Poll task status |
| GET | `/api/templates` | List templates |
| GET | `/api/templates/{id}` | Get template |
| POST | `/api/assets/upload` | Upload asset |
| GET | `/api/assets/list` | List assets |
| GET | `/health` | Health check |

## Telegram Bot

Send any text to the bot at @YourBotUsername. It renders a 3-second breaking news video and returns it.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `TELEGRAM_BOT_TOKEN` | Bot API token | — |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |

## Testing

```bash
cd backend && source venv/bin/activate
python tests/test_api.py
```

## Project Structure

```
backend/
├── api/          # FastAPI routes, Telegram bot, contracts
├── workers/      # Celery app, Playwright renderer, tasks
├── templates/    # GSAP HTML templates + fonts
├── data/         # Templates + assets storage
├── static/       # Rendered video output
└── tests/        # Automated tests
frontend/
└── src/          # React + Twick editor
```
