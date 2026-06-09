#!/bin/bash
# =============================================================
# 404seo — Installation initiale VPS
# =============================================================
# Usage : sudo bash deployment/setup.sh
#
# Ce script (run une seule fois) :
#   1. Installe Node.js 22 et npm
#   2. Installe PM2 globalement
#   3. Installe Redis (via apt)
#   4. Installe les dependances du projet
#   5. Build Next.js
#   6. Lance PM2 + sauvegarde pour startup auto
#   7. Installe le template Nginx HestiaCP
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "  404seo — Installation initiale"
echo "=========================================="
echo ""

# ── Verifications ────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "ERREUR : ce script doit etre execute en root (sudo)."
  exit 1
fi

# Recuperer l'utilisateur reel (pas root)
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")

echo "  Utilisateur : $REAL_USER"
echo "  Projet      : $PROJECT_DIR"
echo ""

# ── 1. Node.js 22 LTS ────────────────────────────────────────────────────
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 22 ]]; then
  echo ">> Installation de Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "[OK] Node.js $(node -v)"
echo "[OK] npm $(npm -v)"

# ── 2. PM2 ───────────────────────────────────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  echo ">> Installation de PM2..."
  npm install -g pm2
fi
echo "[OK] PM2 $(pm2 -v)"

# ── 3. Redis (via apt) ───────────────────────────────────────────────────
if ! command -v redis-server &> /dev/null; then
  echo ">> Installation de Redis..."
  apt-get install -y redis-server
  systemctl enable redis-server
  systemctl start redis-server
fi
echo "[OK] Redis $(redis-server --version | awk '{print $3}')"

# ── 4. Playwright system deps ────────────────────────────────────────────
echo ">> Installation des dependances systeme Playwright (libnspr4, libnss3, etc.)..."
# install-deps installe les libs systeme necessaires a Chromium headless
npx --yes playwright install-deps chromium 2>/dev/null || apt-get install -y \
  libnspr4 libnss3 libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 \
  libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 2>/dev/null || true
echo "[OK] Deps Playwright"

# ── 5. Creer le dossier de logs ──────────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"
chown "$REAL_USER:$REAL_USER" "$PROJECT_DIR/logs"
echo "[OK] Dossier logs cree"

echo ""
echo "=========================================="
echo "  Dependances systeme installees !"
echo "=========================================="
echo ""
echo "  Maintenant, en tant que $REAL_USER (sans sudo) :"
echo ""
echo "    1. Copier et editer le fichier .env :"
echo "       cp $SCRIPT_DIR/.env.example $PROJECT_DIR/site/.env.local"
echo "       nano $PROJECT_DIR/site/.env.local"
echo ""
echo "    2. Installer les dependances npm :"
echo "       cd $PROJECT_DIR && npm install"
echo ""
echo "    3. Prisma : generer + migrer :"
echo "       cd $PROJECT_DIR/site && npx prisma generate && npx prisma migrate deploy"
echo ""
echo "    4. Installer Playwright Chromium :"
echo "       npx playwright install chromium"
echo ""
echo "    5. Build Next.js :"
echo "       cd $PROJECT_DIR/site && npm run build"
echo ""
echo "    6. Lancer PM2 :"
echo "       cd $PROJECT_DIR && pm2 start deployment/ecosystem.config.cjs"
echo "       pm2 save"
echo "       pm2 startup  (puis executer la commande affichee)"
echo ""
echo "    7. Installer le template Nginx HestiaCP :"
echo "       sudo bash $SCRIPT_DIR/hestia/install.sh"
echo ""
