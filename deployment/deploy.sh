#!/bin/bash
# =============================================================
# 404seo — Script de deploiement (mise a jour)
# =============================================================
# Usage : bash deployment/deploy.sh
#
# Ce script :
#   1. Pull les derniers changements
#   2. Installe les dependances
#   3. Genere le client Prisma (site + racine)
#   4. Applique les migrations
#   5. Build Next.js
#   6. Copie les assets statiques dans le standalone
#   7. Relance PM2 avec arrêt gracieux des workers
# =============================================================

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"
if [ "$(id -u)" -eq 0 ]; then
  echo "ERREUR: deploy.sh doit être exécuté par l'utilisateur Hestia, sans sudo."
  exit 1
fi
if [ ! -f "$PROJECT_DIR/.env.production" ]; then
  echo "ERREUR: configurez .env.production à partir de deployment/.env.example."
  exit 1
fi
chmod 600 "$PROJECT_DIR/.env.production"
set -a
source "$PROJECT_DIR/.env.production"
set +a
export NODE_ENV=production

echo "=========================================="
echo "  404seo — Deploiement"
echo "=========================================="
echo ""

# ── Creer le dossier logs si absent ─────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"

# ── Git pull ────────────────────────────────────────────────────────────
echo ">> Pull des derniers changements..."
git pull --ff-only origin main
echo ""

# ── Install des dependances ─────────────────────────────────────────────
echo ">> Installation des dependances..."
npm ci --include=dev --include=optional
node deployment/preflight.mjs --config-only
echo ""

# ── Prisma generate (site + racine pour l'API Fastify) ──────────────────
echo ">> Generation du client Prisma..."
cd site && npx prisma generate && cd ..
echo ""

# Vérifier le code et produire les builds avant toute migration.
npm run typecheck
npm test
npm run lint
npm run build

# Une sauvegarde complète doit réussir avant les migrations.
node deployment/backup.mjs create
# Migrations versionnées, sans reset de la base.
(cd site && npx prisma migrate deploy)
# ── Copie des assets statiques dans le standalone ───────────────────────
# Next.js standalone ne copie pas public/ automatiquement
echo ">> Copie des assets statiques et chunks SSR..."
STANDALONE_DIR="$PROJECT_DIR/site/.next/standalone/site"

if [ ! -d "$STANDALONE_DIR" ]; then
  echo "ERREUR: Le dossier standalone n'existe pas: $STANDALONE_DIR"
  echo "Verifiez que next.config.ts a bien output: 'standalone'"
  exit 1
fi

cp -r "$PROJECT_DIR/site/public" "$STANDALONE_DIR/"
cp -r "$PROJECT_DIR/site/.next/static" "$STANDALONE_DIR/.next/"
# Copier les chunks server (Turbopack monorepo peut ne pas tous les inclure)
if [ -d "$PROJECT_DIR/site/.next/server" ]; then
  cp -r "$PROJECT_DIR/site/.next/server" "$STANDALONE_DIR/.next/"
fi
echo ""

# ── Build + packaging de l'extension Chrome ─────────────────────────────
# Produit apps/extension/seo-audit-pro-v<version>.zip, récupérable en SFTP
# puis chargeable dans Chrome ("Charger l'extension non empaquetée").
# Best-effort : un échec ici ne doit pas interrompre le déploiement du service.
echo ">> Build + packaging de l'extension Chrome..."
( cd apps/extension && npm run package ) || echo "AVERTISSEMENT: packaging de l'extension échoué (déploiement poursuivi)"
echo ""

# ── Relance PM2 (les workers utilisent le mode fork) ──────────────────
echo ">> Reload PM2..."
pm2 startOrReload "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
pm2 save
for attempt in {1..12}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:4000/health/ready >/dev/null; then break; fi
  if [ "$attempt" -eq 12 ]; then echo "ERREUR : les services ne sont pas prêts après le redémarrage."; exit 1; fi
  sleep 5
done
node deployment/preflight.mjs
echo ""

# ── Verification status PM2 ────────────────────────────────────────────
echo ">> Status PM2 :"
pm2 status
echo ""

echo "=========================================="
echo "  Deploiement termine !"
echo "=========================================="
echo ""
echo "  pm2 status    — Voir les process"
echo "  pm2 logs      — Logs en temps reel"
echo ""
