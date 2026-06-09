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
#   7. Reload PM2 (zero downtime)
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  404seo — Deploiement"
echo "=========================================="
echo ""

# ── Creer le dossier logs si absent ─────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"

# ── Git pull ────────────────────────────────────────────────────────────
echo ">> Pull des derniers changements..."
git pull origin main
echo ""

# ── Install des dependances ─────────────────────────────────────────────
echo ">> Installation des dependances..."
npm install
echo ""

# ── Prisma generate (site + racine pour l'API Fastify) ──────────────────
echo ">> Generation du client Prisma..."
cd site && npx prisma generate && cd ..
echo ""

# ── Migrations ──────────────────────────────────────────────────────────
echo ">> Application des migrations..."
cd site && npx prisma migrate deploy && cd ..
echo ""

# ── Build Next.js ───────────────────────────────────────────────────────
echo ">> Build Next.js..."
cd site && npm run build && cd ..
echo ""

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

# ── Reload PM2 (zero downtime) ─────────────────────────────────────────
echo ">> Reload PM2..."
pm2 reload "$SCRIPT_DIR/ecosystem.config.cjs" --update-env
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
