#!/bin/bash
# Dépendances système, après npm ci exécuté sans sudo.
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "Exécuter avec sudo pour installer les paquets système."
  exit 1
fi
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
if ! command -v node >/dev/null || [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]; then
  echo "Installer Node.js 24 LTS et npm avant de continuer."
  exit 1
fi
if [ ! -f node_modules/playwright/cli.js ]; then
  echo "Exécuter npm ci --include=dev comme utilisateur Hestia avant ce script."
  exit 1
fi
apt-get update
apt-get install -y redis-server
systemctl enable --now redis-server
node node_modules/playwright/cli.js install-deps chromium
echo "Dépendances installées. Continuer deployment/README.md sans sudo."
