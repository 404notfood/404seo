#!/usr/bin/env bash
# =============================================================================
# 404seo — Setup Podman (rootless) — partie UTILISATEUR (seo, SANS sudo)
# =============================================================================
# Un utilisateur HestiaCP n'a PAS les droits sudo. Ce script ne fait donc QUE
# ce qui ne demande aucun privilege root, et VERIFIE que les prerequis root
# ont bien ete installes au prealable.
#
# >>> AVANT ce script, un administrateur (root / utilisateur 'debian' avec sudo)
#     doit avoir lance UNE FOIS :  deployment/podman/setup-root.sh
#     (installe podman + dbus + active le lingering pour l'utilisateur seo)
#
# A lancer en tant que 'seo' :
#   bash deployment/podman/setup-podman.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
USER_NAME="$(id -un)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

echo "=========================================="
echo "  404seo — Setup Podman (rootless)"
echo "  Utilisateur : $USER_NAME"
echo "  Projet      : $PROJECT_DIR"
echo "=========================================="
echo ""

if [ "$(id -u)" -eq 0 ]; then
  echo "ERREUR : lance ce script en tant qu'utilisateur applicatif (seo), PAS root."
  exit 1
fi

# ── Verification des prerequis ROOT (installes par setup-root.sh) ────────────
MISSING=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "  [MANQUANT] $1"
    MISSING=1
  else
    echo "  [OK]       $1"
  fi
}

echo ">> Verification des prerequis (installes par root) :"
need podman
need podman-compose
need dbus-launch

# Lingering : indispensable pour que les conteneurs survivent au logout SSH
LINGER_OK=1
if command -v loginctl >/dev/null 2>&1; then
  if [ "$(loginctl show-user "$USER_NAME" -p Linger --value 2>/dev/null)" != "yes" ]; then
    echo "  [MANQUANT] lingering systemd pour $USER_NAME"
    LINGER_OK=0
    MISSING=1
  else
    echo "  [OK]       lingering systemd"
  fi
fi

if [ "$MISSING" -ne 0 ]; then
  cat <<EOF

------------------------------------------------------------------------------
 Des prerequis necessitant les droits root ne sont pas installes.
 Demande a un administrateur (root, ou l'utilisateur 'debian' avec sudo) de
 lancer UNE FOIS le script root, puis relance ce script :

     sudo bash $SCRIPT_DIR/setup-root.sh $USER_NAME

 (Ce script root installe podman/dbus si besoin et active le lingering
  pour l'utilisateur '$USER_NAME'.)
------------------------------------------------------------------------------
EOF
  exit 1
fi

echo "[OK] Tous les prerequis root sont en place."
echo ""

# ── Etapes SANS root (executables par seo) ───────────────────────────────────

# Socket Podman --user (compat docker-compose / API Docker)
echo ">> Activation de podman.socket --user..."
systemctl --user enable --now podman.socket 2>/dev/null || \
  echo "  (!) podman.socket non active — non bloquant pour Quadlets/compose."

# Lien ~/404seo attendu par les Quadlets (%h/404seo/...)
LINK_TARGET="$HOME/404seo"
if [ "$PROJECT_DIR" != "$LINK_TARGET" ] && [ ! -e "$LINK_TARGET" ]; then
  echo ">> Creation du lien ~/404seo -> $PROJECT_DIR"
  ln -s "$PROJECT_DIR" "$LINK_TARGET"
fi

mkdir -p "$PROJECT_DIR/logs"

# ── Rappels ───────────────────────────────────────────────────────────────────
cat <<EOF

==========================================
  Setup Podman (utilisateur) termine.
==========================================

PROCHAINES ETAPES :

  1) Configurer le .env :
       cp $SCRIPT_DIR/.env.example $SCRIPT_DIR/.env
       nano $SCRIPT_DIR/.env
     -> DATABASE_URL, BETTER_AUTH_SECRET, REDIS_PASSWORD, Stripe, Google, Resend, Anthropic.

  2) Autoriser PostgreSQL a accepter les conteneurs (necessite root) :
     Voir README.md / INSTALL-VPS.md section PostgreSQL.
     (creation reseau podman -> IP passerelle -> postgresql.conf + pg_hba.conf -> reload)

  3) Premier deploiement (build images + demarrage) :
       bash $SCRIPT_DIR/deploy-podman.sh --install-quadlet

  4) Brancher Nginx HestiaCP (necessite root) :
       sudo cp $SCRIPT_DIR/nginx.podman.conf \\
           /home/$USER_NAME/conf/web/seo.404notfood.fr/nginx.ssl.conf
       sudo nginx -t && sudo systemctl reload nginx

EOF
