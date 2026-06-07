#!/usr/bin/env bash
# =============================================================================
# 404seo — Deploiement / mise a jour Podman
# =============================================================================
# Usage :
#   bash deployment/podman/deploy-podman.sh                     # build + (re)start via compose
#   bash deployment/podman/deploy-podman.sh --install-quadlet   # + installe les units systemd
#   bash deployment/podman/deploy-podman.sh --no-pull           # ne pas git pull (build local)
#
# Etapes :
#   1. git pull (sauf --no-pull)
#   2. build des 3 images (site / api / worker)
#   3. migrations Prisma (client local de l'hote, sinon conteneur jetable)
#   4. (re)demarrage : Quadlet systemd si installe, sinon podman-compose
#   5. health check
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

PULL=1
INSTALL_QUADLET=0
for arg in "$@"; do
  case "$arg" in
    --no-pull)         PULL=0 ;;
    --install-quadlet) INSTALL_QUADLET=1 ;;
    *) echo "Option inconnue : $arg" ; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"

echo "=========================================="
echo "  404seo — Deploiement Podman"
echo "=========================================="

# ── 0. Verifs ─────────────────────────────────────────────────────────────────
if ! command -v podman >/dev/null 2>&1; then
  echo "ERREUR : podman absent. Lance d'abord setup-podman.sh."
  exit 1
fi
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "ERREUR : $SCRIPT_DIR/.env introuvable. Copie .env.example et remplis-le."
  exit 1
fi
set -a; . "$SCRIPT_DIR/.env"; set +a

# ── 1. Git pull ───────────────────────────────────────────────────────────────
if [ "$PULL" -eq 1 ]; then
  echo ">> git pull..."
  git pull --ff-only origin main || echo "(!) git pull ignore (branche locale ou conflit)"
fi

# ── 2. Build des images ───────────────────────────────────────────────────────
echo ">> Build image site..."
podman build -f "$SCRIPT_DIR/Dockerfile.site"   -t localhost/404seo-site:latest   "$PROJECT_DIR"
echo ">> Build image api..."
podman build -f "$SCRIPT_DIR/Dockerfile.api"    -t localhost/404seo-api:latest    "$PROJECT_DIR"
echo ">> Build image worker..."
podman build -f "$SCRIPT_DIR/Dockerfile.worker" -t localhost/404seo-worker:latest "$PROJECT_DIR"

# ── 3. Migrations Prisma ──────────────────────────────────────────────────────
# Depuis l'hote si le client local existe, sinon via un conteneur jetable
# base sur l'image api (qui embarque prisma + le schema).
echo ">> Migrations Prisma (prisma migrate deploy)..."
if command -v npx >/dev/null 2>&1 && [ -d "$PROJECT_DIR/site/node_modules" ]; then
  ( cd "$PROJECT_DIR/site" && npx prisma migrate deploy )
else
  podman run --rm \
    --env-file "$SCRIPT_DIR/.env" \
    --add-host host.containers.internal:host-gateway \
    localhost/404seo-api:latest \
    npx prisma migrate deploy --schema site/prisma/schema.prisma
fi

# ── 4. Demarrage ──────────────────────────────────────────────────────────────
QUADLET_DIR="$HOME/.config/containers/systemd"

if [ "$INSTALL_QUADLET" -eq 1 ]; then
  echo ">> Installation des Quadlets dans $QUADLET_DIR..."
  mkdir -p "$QUADLET_DIR"
  cp "$SCRIPT_DIR"/quadlet/*.container "$QUADLET_DIR"/
  cp "$SCRIPT_DIR"/quadlet/*.network   "$QUADLET_DIR"/
  cp "$SCRIPT_DIR"/quadlet/*.volume    "$QUADLET_DIR"/
fi

if [ -d "$QUADLET_DIR" ] && ls "$QUADLET_DIR"/404seo-*.container >/dev/null 2>&1; then
  echo ">> Demarrage via Quadlet systemd (--user)..."
  systemctl --user daemon-reload
  for svc in 404seo-redis 404seo-api 404seo-site 404seo-worker-crawl 404seo-scheduler; do
    systemctl --user restart "$svc.service"
  done
  systemctl --user --no-pager status '404seo-*' 2>/dev/null | grep -E 'Active:|404seo' || true
else
  echo ">> Demarrage via podman-compose..."
  ( cd "$SCRIPT_DIR" && podman-compose --env-file .env up -d )
  podman ps --format '  {{.Names}}\t{{.Status}}'
fi

# ── 5. Health check ───────────────────────────────────────────────────────────
echo ">> Health check API (127.0.0.1:${API_PORT:-4000}/health)..."
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null 2>&1; then
    echo "[OK] API repond."
    break
  fi
  sleep 2
  [ "$i" -eq 15 ] && echo "(!) API ne repond pas encore — verifie les logs."
done

echo ""
echo "=========================================="
echo "  Deploiement termine."
echo "=========================================="
echo "  Site          : https://seo.404notfood.fr"
echo "  Logs Quadlet  : journalctl --user -u 404seo-api -f"
echo "  Logs compose  : podman logs -f 404seo-api"
echo "  Status        : podman ps"
