#!/bin/bash
# =============================================================
# HestiaCP — Installation des templates proxy pour 404seo
# =============================================================
# Usage: sudo bash hestia/install.sh [--domain DOMAIN] [--user USER]
#
# Ce script:
#   1. Copie les templates Nginx dans HestiaCP
#   2. Configure le domaine pour utiliser le template container-proxy
# =============================================================

set -e

DOMAIN="seo.404notfood.fr"
HESTIA_USER="SEO"
TPL_DIR="/usr/local/hestia/data/templates/web/nginx"

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --user) HESTIA_USER="$2"; shift 2 ;;
    *) echo "Option inconnue: $1"; exit 1 ;;
  esac
done

echo "=== Installation template HestiaCP ==="
echo "  Domaine : $DOMAIN"
echo "  User    : $HESTIA_USER"
echo ""

# --- Vérifications ---
if [ "$(id -u)" -ne 0 ]; then
  echo "ERREUR : ce script doit être exécuté en root (sudo)."
  exit 1
fi

if ! command -v v-change-web-domain-proxy-tpl &> /dev/null; then
  echo "ERREUR : HestiaCP n'est pas installé sur ce serveur."
  exit 1
fi

# --- Copie des templates ---
echo ">> Copie des templates Nginx..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp -f "$SCRIPT_DIR/container-proxy.tpl" "$TPL_DIR/container-proxy.tpl"
cp -f "$SCRIPT_DIR/container-proxy.stpl" "$TPL_DIR/container-proxy.stpl"
chmod 644 "$TPL_DIR/container-proxy.tpl" "$TPL_DIR/container-proxy.stpl"
echo "   Templates copiés dans $TPL_DIR"

# --- Application du template ---
echo ">> Application du template au domaine $DOMAIN..."
v-change-web-domain-proxy-tpl "$HESTIA_USER" "$DOMAIN" container-proxy

echo ""
echo "=== Template installé avec succès ! ==="
echo "  Next.js  → http://127.0.0.1:3000"
echo "  API      → http://127.0.0.1:4000"
echo ""
echo "Démarrez les containers avec: bash start-containers.sh"
