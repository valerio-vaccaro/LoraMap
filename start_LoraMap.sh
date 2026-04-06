#!/usr/bin/env bash
# LoraMap startup script
# Activates the local virtualenv, runs pending DB migrations, then starts Flask.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
VENV_ACTIVATE="$VENV_DIR/bin/activate"

# ── Virtualenv check ────────────────────────────────────────────────────────
if [ ! -f "$VENV_ACTIVATE" ]; then
    echo "❌  Virtualenv not found at $VENV_DIR"
    echo "    Run:  python3 -m venv venv && pip install -r requirements.txt"
    exit 1
fi

source "$VENV_ACTIVATE"
echo "✅  Virtualenv: $VIRTUAL_ENV"

# ── .env check ───────────────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️   No .env file found — copying from .env.example"
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    echo "    Edit $ENV_FILE before running in production."
fi

# ── DB migrations ────────────────────────────────────────────────────────────
echo "🗄️   Applying any pending migrations…"
flask --app "$SCRIPT_DIR/app.py" db upgrade

# ── Flask ─────────────────────────────────────────────────────────────────────
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5000}"
FLASK_ENV="${FLASK_ENV:-production}"

echo "🚀  Starting LoraMap on http://$HOST:$PORT  (FLASK_ENV=$FLASK_ENV)"
exec flask --app "$SCRIPT_DIR/app.py" run --host "$HOST" --port "$PORT"
