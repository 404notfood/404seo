#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "docker est introuvable dans le PATH" >&2; exit 1; }
docker compose up -d --build
echo "Containers démarrés : https://seo.test"
