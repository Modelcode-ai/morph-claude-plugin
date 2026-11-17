#!/usr/bin/env bash
# Bundle the engine into dist/ so the installed plugin needs no node_modules.
set -euo pipefail
cd "$(dirname "$0")"
bun build engine/src/cli.ts --target=node --format=esm --outfile dist/witness.mjs >/dev/null
mkdir -p dist/viewer && cp engine/src/viewer/index.html dist/viewer/index.html
echo "built dist/witness.mjs"
