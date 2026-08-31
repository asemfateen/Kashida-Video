#!/usr/bin/env bash

# ==============================================================================
# Kashida Video — Production & VPS Server Startup Script
# Optimized for low-resource environments (2GB - 4GB RAM, 1-2 vCPUs)
# ==============================================================================

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
VENV_DIR="$BACKEND_DIR/venv"
PYTHON_BIN="$VENV_DIR/bin/python"

# Export venv paths
export PATH="$VENV_DIR/bin:$PATH"

echo "================================================================"
echo " 🚀 Kashida Video — Server Initializer"
echo "================================================================"

# 1. Check Python Virtual Environment
if [ ! -f "$PYTHON_BIN" ]; then
  echo "❌ Virtual environment not found at $VENV_DIR"
  echo "⚡ Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip
  "$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

# 2. Check Playwright Chromium Browser
if [ ! -d "$HOME/.cache/ms-playwright" ] && [ ! -d "/root/.cache/ms-playwright" ]; then
  echo "⚡ Installing Playwright Chromium browser..."
  "$PYTHON_BIN" -m playwright install chromium
fi

# 3. Check FFmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "⚠️  WARNING: 'ffmpeg' was not found in PATH."
  echo "   Please install ffmpeg (e.g. 'sudo apt-get install -y ffmpeg')."
fi

# 4. RAM & Swap Diagnostics
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
SWAP_TOTAL_KB=$(grep SwapTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")

if [ "$TOTAL_RAM_MB" -gt 0 ] && [ "$TOTAL_RAM_MB" -lt 3500 ] && [ "$SWAP_TOTAL_KB" -eq 0 ]; then
  echo "💡 Notice: Total RAM is ${TOTAL_RAM_MB}MB with 0MB Swap."
  echo "   Recommendation for low-RAM servers: enable a 2GB swapfile for peak render safety:"
  echo "   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
fi

# 5. Clean up any stale port processes
if command -v fuser &>/dev/null; then
  fuser -k 8001/tcp 2>/dev/null || true
  fuser -k 5173/tcp 2>/dev/null || true
fi

# 6. Start Redis Server (Capped to 128MB RAM for safety)
HAS_REDIS=false
if command -v redis-server &>/dev/null; then
  echo "👉 Checking Redis Server..."
  if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null; then
    echo "   ✅ Redis is active."
    HAS_REDIS=true
  else
    echo "   ⚡ Starting Redis daemon (128MB memory cap)..."
    redis-server --daemonize yes --maxmemory 128mb --maxmemory-policy allkeys-lru 2>/dev/null || true
    sleep 1
    if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null; then
      echo "   ✅ Redis started successfully."
      HAS_REDIS=true
    else
      echo "   ⚠️ Redis daemon unavailable; tasks will use direct asynchronous rendering."
    fi
  fi
else
  echo "👉 Redis server not installed; using direct thread rendering mode."
fi

# 7. Process Cleanup Trap
cleanup() {
  echo ""
  echo "🛑 Stopping all Kashida Video server processes..."
  [ -n "$UVICORN_PID" ] && kill "$UVICORN_PID" 2>/dev/null || true
  [ -n "$CELERY_PID" ] && kill "$CELERY_PID" 2>/dev/null || true
  [ -n "$BOT_PID" ] && kill "$BOT_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  echo "✅ All server processes cleanly terminated."
}
trap cleanup SIGINT SIGTERM EXIT

# 8. Start FastAPI Backend API Server
echo "👉 Starting FastAPI Backend API on http://0.0.0.0:8001..."
cd "$BACKEND_DIR"
"$PYTHON_BIN" -m uvicorn api.main:app --host 0.0.0.0 --port 8001 --workers 1 &
UVICORN_PID=$!
sleep 1.5

# 9. Start Celery Rendering Worker
if [ "$HAS_REDIS" = true ]; then
  echo "👉 Starting Celery Rendering Worker (Solo pool)..."
  "$PYTHON_BIN" -m celery -A workers.celery_app.app worker --loglevel=info --pool=solo &
  CELERY_PID=$!
  sleep 1
fi

# 10. Start Telegram Bot (if configured)
if [ -f "$BACKEND_DIR/.env" ]; then
  if grep -q "TELEGRAM_BOT_TOKEN=" "$BACKEND_DIR/.env" 2>/dev/null && \
     ! grep -E "TELEGRAM_BOT_TOKEN=(\"\"|''|\$)" "$BACKEND_DIR/.env" &>/dev/null; then
    echo "👉 Starting Telegram Bot worker..."
    "$PYTHON_BIN" -m api.bot &
    BOT_PID=$!
  fi
fi

# 11. Start Frontend Web Interface
echo "👉 Starting Frontend Studio on http://0.0.0.0:5173..."
cd "$FRONTEND_DIR"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "⚡ Installing npm dependencies..."
  npm install
fi

echo "================================================================"
echo " ✨ All services successfully started!"
echo " 🌐 Frontend Studio:  http://localhost:5173"
echo " 🔌 Backend API:      http://localhost:8001"
echo " 📖 API Swagger Docs: http://localhost:8001/docs"
echo "================================================================"
echo " (Press Ctrl+C to stop all servers)"
echo ""

# Run frontend in foreground to maintain process lifecycle
npm run dev -- --host 0.0.0.0 --port 5173
