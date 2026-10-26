#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
command -v git >/dev/null
command -v docker >/dev/null
docker info >/dev/null
if [ ! -d src/.git ]; then
    clone_dir=$(mktemp -d)
    trap 'rm -rf "$clone_dir"' EXIT
    git clone --branch 'main' -- 'https://github.com/404notfood/404seo' "$clone_dir/repo"
    mkdir -p src
    # Preserve generated environment files while copying the repository.
    cp -Rn "$clone_dir/repo/." src/
fi
docker compose build
chmod 600 .env
bash start-containers.sh
