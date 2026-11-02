#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/plugins"
for dir in */; do
  echo "== ${dir%/}"
  (cd "$dir" && { [ -d node_modules ] || npm install --include=dev --silent; } && npm test --silent)
done
