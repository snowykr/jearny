#!/usr/bin/env bash
# Warn when the current track branch edits files owned by the other track or shared files.
# Usage: scripts/check-ownership.sh [base-ref]   (default: origin/main)
set -euo pipefail
base="${1:-origin/main}"
branch="$(git rev-parse --abbrev-ref HEAD)"

a='^(src/game/|src/content/maps/|public/sprites/|assets/)'
b='^(src/domain/|src/session/|src/storage/|src/ui/|src/audio/|src/content/|content/|tools/voice/|public/audio/)'
shared='^(src/contracts/|src/main\.ts|package(-lock)?\.json|tsconfig\.json|vite\.config\.ts|index\.html|docs/|\.github/)'

case "$branch" in
  track-a/*) mine="$a"; theirs="$b" ;;
  track-b/*) mine="$b"; theirs="$a" ;;
  *) echo "Not on a track-a/* or track-b/* branch ($branch); nothing to check."; exit 0 ;;
esac

status=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [[ "$f" =~ $shared ]]; then
    echo "SHARED   $f  -> send as a separate small PR to main"; status=1
  elif [[ "$f" =~ $mine ]]; then
    :
  elif [[ "$f" =~ $theirs ]]; then
    echo "FOREIGN  $f  -> owned by the other track"; status=1
  fi
done < <(git diff --name-only "$(git merge-base "$base" HEAD)"...HEAD)

[ "$status" -eq 0 ] && echo "Ownership OK for $branch."
exit "$status"
