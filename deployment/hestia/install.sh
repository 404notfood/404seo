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
HESTIA_USER="seo"
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

# Les binaires HestiaCP ne sont pas toujours dans le PATH de sudo : on pointe
# explicitement vers /usr/local/hestia/bin.
HESTIA_BIN="/usr/local/hestia/bin"
if [ ! -x "$HESTIA_BIN/v-change-web-domain-proxy-tpl" ]; then
  echo "ERREUR : HestiaCP introuvable ($HESTIA_BIN/v-change-web-domain-proxy-tpl absent)."
  echo "  Verifie le chemin : ls $HESTIA_BIN | grep proxy-tpl"
  exit 1
fi
export PATH="$HESTIA_BIN:$PATH"

# --- Copie des templates ---
echo ">> Copie des templates Nginx..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$TPL_DIR"
cp -f "$SCRIPT_DIR/container-proxy.tpl"  "$TPL_DIR/container-proxy.tpl"
cp -f "$SCRIPT_DIR/container-proxy.stpl" "$TPL_DIR/container-proxy.stpl"
chmod 644 "$TPL_DIR/container-proxy.tpl" "$TPL_DIR/container-proxy.stpl"
echo "   Templates copiés dans $TPL_DIR"

# --- Application du template ---
echo ">> Application du template proxy au domaine $DOMAIN..."
"$HESTIA_BIN/v-change-web-domain-proxy-tpl" "$HESTIA_USER" "$DOMAIN" container-proxy

# Rebuild + reload pour generer la conf a partir du template
echo ">> Rebuild du domaine + reload Nginx..."
"$HESTIA_BIN/v-rebuild-web-domain" "$HESTIA_USER" "$DOMAIN" 2>/dev/null || true
nginx -t && systemctl reload nginx

echo ""
echo "=== Template installé avec succès ! ==="
echo "  Next.js  → http://127.0.0.1:3030"
echo "  API      → http://127.0.0.1:4000"
echo ""
echo "RAPPEL : les conteneurs Podman doivent deja tourner (sinon 502)."
echo "  En tant que seo : bash ~/404seo/deployment/podman/deploy-podman.sh --install-quadlet"
