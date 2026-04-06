#!/usr/bin/env bash
# fetch.sh — Pull fresh data from all configured TTN data sources.
#
# Usage:
#   ./fetch.sh               # uses virtualenv at ./venv if present
#   ./fetch.sh /path/to/venv # specify a custom virtualenv path

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtualenv if available
VENV="${1:-$SCRIPT_DIR/venv}"
if [ -f "$VENV/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "$VENV/bin/activate"
    echo "[loramap] Using virtualenv: $VENV"
fi

# Verify flask is available
if ! command -v flask &>/dev/null; then
    echo "[loramap] ERROR: 'flask' command not found. Install dependencies or activate your virtualenv." >&2
    exit 1
fi

echo "[loramap] Starting fetch — $(date '+%Y-%m-%d %H:%M:%S')"
flask fetch-all
echo "[loramap] Fetch complete — $(date '+%Y-%m-%d %H:%M:%S')"
