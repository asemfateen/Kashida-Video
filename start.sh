#!/usr/bin/env bash

# ==============================================================================
# Kashida Video — One-Click Startup Script (All-in-One)
# ==============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/venv"
PYTHON_BIN="$VENV_DIR/bin/python"

# Prepend virtualenv bin to PATH so redis-server / redis-cli are available
export PATH="$VENV_DIR/bin:$PATH"

echo "=================================================="
echo " 🚀 Starting Kashida Video Stack..."
echo "=================================================="

# 0. Free stale ports if any
if command -v fuser &>/dev/null; then
  fuser -k 8001/tcp 2>/dev/null || true
fi

# 1. Start Redis
HAS_REDIS=false
if command -v redis-server &>/dev/null; then
  echo "👉 Checking Redis..."
  if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null; then
    echo "   ✅ Redis is already running."
    HAS_REDIS=true
  else
    echo "   ⚡ Starting Redis daemon..."
    redis-server --daemonize yes 2>/dev/null || true
    sleep 1
    if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null; then
      echo "   ✅ Redis started successfully."
      HAS_REDIS=true
    else
      echo "   ⚠️ Redis daemon did not start; using Direct Thread Rendering mode."
    fi
  fi
else
  echo "👉 Redis server not found in PATH."
  echo "   ℹ️ Running in Direct Thread Rendering mode (no Redis required)."
fi

# 2. Cleanup trap on Exit / Ctrl+C
cleanup() {
  echo ""
  echo "🛑 Stopping Kashida Video servers..."
  if [ -n "$UVICORN_PID" ]; then
    kill "$UVICORN_PID" 2>/dev/null || true
  fi
  if [ -n "$CELERY_PID" ]; then
    kill "$CELERY_PID" 2>/dev/null || true
  fi
  if [ -n "$BOT_PID" ]; then
    kill "$BOT_PID" 2>/dev/null || true
  fi
  echo "✅ All background services stopped. Goodbye!"
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Start FastAPI Backend
echo "👉 Starting FastAPI Backend on http://localhost:8001..."
cd "$BACKEND_DIR"
"$PYTHON_BIN" -m uvicorn api.main:app --port 8001 --reload &
UVICORN_PID=$!
sleep 1.5

# 4. Start Celery Worker (if Redis is active)
if [ "$HAS_REDIS" = true ]; then
  echo "👉 Starting Celery Rendering Worker..."
  "$PYTHON_BIN" -m celery -A workers.celery_app.app worker --loglevel=warning --pool=solo &
  CELERY_PID=$!
  sleep 1
fi

# 5. Start Telegram Bot (if token configured)
if grep -q "TELEGRAM_BOT_TOKEN=" "$BACKEND_DIR/.env" 2>/dev/null && ! grep -q "TELEGRAM_BOT_TOKEN=\"\"" "$BACKEND_DIR/.env" && ! grep -q "TELEGRAM_BOT_TOKEN=''" "$BACKEND_DIR/.env"; then
  echo "👉 Starting Telegram Bot in background..."
  "$PYTHON_BIN" -m api.bot &
  BOT_PID=$!
fi

# 6. Start Frontend Studio
echo "👉 Starting Frontend Studio on http://localhost:5173..."
cd "$FRONTEND_DIR"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "⚡ Installing frontend dependencies..."
  npm install
fi

echo "=================================================="
echo " ✨ All services running!"
echo " 🌐 Studio UI:     http://localhost:5173"
echo " 🔌 Backend API:   http://localhost:8001"
echo " 📖 API Docs:      http://localhost:8001/docs"
echo "=================================================="
echo " (Press Ctrl+C at any time to stop everything)"
echo ""

npm run dev
