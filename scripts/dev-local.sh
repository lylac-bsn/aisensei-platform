#!/bin/bash
# Local dev: static site on :5000, Gemini WebSocket proxy on :8080
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 &>/dev/null; then
  echo "python3 is required"
  exit 1
fi

# Optional local proxy (only needed for ?proxy=local)
if python3 -c "import websockets, google.auth" 2>/dev/null; then
  if gcloud auth application-default print-access-token &>/dev/null; then
    PORT=8080 python3 proxy-server/server.py &
    PROXY_PID=$!
  else
    echo "Note: local proxy skipped (run: gcloud auth application-default login)"
  fi
else
  echo "Installing proxy dependencies..."
  python3 -m pip install -r proxy-server/requirements.txt -q
fi

cleanup() {
  kill "${PROXY_PID:-}" "$HTTP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

python3 -m http.server 5000 --bind 127.0.0.1 &
HTTP_PID=$!

sleep 1
echo ""
echo "Local dev ready:"
echo "  Voice tab:  http://127.0.0.1:5000/voice-tab.html"
echo "  Login:      http://127.0.0.1:5000/index.html"
echo ""
echo "Voice uses the Cloud Run proxy by default (no local gcloud login needed)."
echo "To test the local proxy instead: add ?proxy=local and run gcloud auth application-default login"
echo ""
echo "Optional local proxy: ws://127.0.0.1:8080 (only with ?proxy=local)"

wait
