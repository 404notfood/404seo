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

set -euo pipefail

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
# On utilise le WEB template (v-change-web-domain-tpl) et NON le proxy template :
# sur une install Nginx-seul, PROXY_SYSTEM n'est pas active, mais le WEB template
# definit directement le reverse proxy dans le server{} Nginx.
HESTIA_BIN="/usr/local/hestia/bin"
if [ ! -x "$HESTIA_BIN/v-change-web-domain-tpl" ]; then
  echo "ERREUR : HestiaCP introuvable ($HESTIA_BIN/v-change-web-domain-tpl absent)."
  exit 1
fi
export PATH="$HESTIA_BIN:$PATH"

# --- Copie des templates (WEB template : container.tpl / container.stpl) ---
# HestiaCP valide les templates dans $WEBTPL/$WEB_SYSTEM/$WEB_BACKEND/ (cf.
# is_web_template_valid dans func/domain.sh). En nginx-only, WEB_BACKEND=php-fpm,
# donc le bon dossier est nginx/php-fpm/ — PAS nginx/ directement.
echo ">> Copie des templates Nginx (web)..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_BACKEND="$(. /usr/local/hestia/conf/hestia.conf; echo "${WEB_BACKEND:-php-fpm}")"
PROXY_SYSTEM="$(. /usr/local/hestia/conf/hestia.conf; echo "${PROXY_SYSTEM:-}")"
if [ "$PROXY_SYSTEM" = "nginx" ]; then
  TPL_TARGET="$TPL_DIR"
  TEMPLATE="container-proxy"
  CHANGE_COMMAND="v-change-web-domain-proxy-tpl"
else
  TPL_TARGET="$TPL_DIR/$WEB_BACKEND"
  TEMPLATE="container"
  CHANGE_COMMAND="v-change-web-domain-tpl"
fi
mkdir -p "$TPL_TARGET"
cp -f "$SCRIPT_DIR/$TEMPLATE.tpl"  "$TPL_TARGET/$TEMPLATE.tpl"
cp -f "$SCRIPT_DIR/$TEMPLATE.stpl" "$TPL_TARGET/$TEMPLATE.stpl"
chmod 644 "$TPL_TARGET/$TEMPLATE.tpl" "$TPL_TARGET/$TEMPLATE.stpl"
echo "   Templates copiés dans $TPL_TARGET"

# --- Application du WEB template ---
echo ">> Application du web template au domaine $DOMAIN..."
"$HESTIA_BIN/$CHANGE_COMMAND" "$HESTIA_USER" "$DOMAIN" "$TEMPLATE"

# Rebuild + reload pour generer la conf a partir du template
echo ">> Rebuild du domaine + reload Nginx..."
"$HESTIA_BIN/v-rebuild-web-domain" "$HESTIA_USER" "$DOMAIN"
nginx -t && systemctl reload nginx

echo ""
echo "=== Template installé avec succès ! ==="
echo "  Next.js  → http://127.0.0.1:3030"
echo "  API      → http://127.0.0.1:4000"
echo ""
echo "RAPPEL : les process PM2 doivent deja tourner (sinon 502)."
echo "  En tant que seo : pm2 start ~/404seo/deployment/ecosystem.config.cjs && pm2 save"
