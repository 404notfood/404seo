#!/usr/bin/env bash
# =============================================================================
# 404seo — Demarrage des conteneurs (podman run direct, --network=host)
# =============================================================================
# Alternative a podman-compose (bugge en 0.x : melange host+bridge) et a
# Quadlet (absent en Podman 4.3.1). Lance les 5 conteneurs en --network=host.
#
#   bash deployment/podman/start-containers.sh
#
# Idempotent : arrete/supprime les conteneurs existants avant de relancer.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERREUR : $ENV_FILE introuvable."
  exit 1
fi

# Charger REDIS_PASSWORD pour la commande redis
set -a; . "$ENV_FILE"; set +a

echo ">> Arret des conteneurs existants (si presents)..."
for c in 404seo-redis 404seo-api 404seo-site 404seo-worker-crawl 404seo-scheduler; do
  podman rm -f "$c" 2>/dev/null || true
done

# Volume persistant Redis
podman volume inspect 404seo-redis-data >/dev/null 2>&1 || podman volume create 404seo-redis-data

echo ">> Demarrage Redis..."
podman run -d --name 404seo-redis \
  --network host \
  --env-file "$ENV_FILE" \
  -v 404seo-redis-data:/data \
  --restart unless-stopped \
  docker.io/library/redis:7-alpine \
  sh -c 'exec redis-server --bind 127.0.0.1 --port 6379 --requirepass "$REDIS_PASSWORD" --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru'

# Attendre que Redis reponde
echo -n "   attente Redis"
for i in $(seq 1 10); do
  if podman exec 404seo-redis redis-cli -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
    echo " [OK]"; break
  fi
  echo -n "."; sleep 1
done

echo ">> Demarrage API Fastify..."
podman run -d --name 404seo-api \
  --network host \
  --env-file "$ENV_FILE" \
  -e API_HOST=127.0.0.1 \
  -e API_PORT=4000 \
  -e NODE_ENV=production \
  --shm-size 512m \
  --restart unless-stopped \
  localhost/404seo-api:latest

echo ">> Demarrage site Next.js..."
podman run -d --name 404seo-site \
  --network host \
  --env-file "$ENV_FILE" \
  -e PORT=3030 \
  -e HOSTNAME=127.0.0.1 \
  -e NODE_ENV=production \
  --restart unless-stopped \
  localhost/404seo-site:latest

echo ">> Demarrage worker crawl..."
podman run -d --name 404seo-worker-crawl \
  --network host \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  --shm-size 1g \
  --restart unless-stopped \
  localhost/404seo-worker:latest \
  node_modules/.bin/tsx workers/crawl-worker.ts

echo ">> Demarrage scheduler..."
podman run -d --name 404seo-scheduler \
  --network host \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  --restart unless-stopped \
  localhost/404seo-worker:latest \
  node_modules/.bin/tsx workers/schedule-worker.ts

echo ""
echo ">> Etat des conteneurs :"
podman ps --format '  {{.Names}}\t{{.Status}}'

echo ""
echo ">> Health check API (127.0.0.1:4000/health)..."
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:4000/health" >/dev/null 2>&1; then
    echo "   [OK] API repond."
    break
  fi
  sleep 2
  [ "$i" -eq 15 ] && echo "   (!) API ne repond pas encore — voir: podman logs 404seo-api"
done
