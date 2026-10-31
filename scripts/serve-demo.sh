#!/usr/bin/env bash
# Builds the prototype and serves it locally, for the offline demo fallback.
# Usage: ./scripts/serve-demo.sh [port]   (default 4173)
set -euo pipefail

PORT="${1:-4173}"

cd "$(dirname "$0")/.."

echo "==> Building (tsc --noEmit && vite build)"
npm run build

if [ ! -f dist/index.html ]; then
  echo "error: dist/index.html missing after build" >&2
  exit 1
fi

echo "==> Serving dist on http://localhost:${PORT}/"
echo "    Phone on the same Wi-Fi: use the LAN address of this Mac."
echo "    Stop with Ctrl+C."
exec npx --yes vite preview --port "$PORT" --strictPort
