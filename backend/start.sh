#!/usr/bin/env bash
# Start script for Render free tier.
# Render auto-sets $PORT; bind to 0.0.0.0 so external requests reach the app.
set -e

PORT="${PORT:-8000}"
echo "🚀 Starting Sân Bóng API on 0.0.0.0:$PORT"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
