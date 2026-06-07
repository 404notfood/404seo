#!/usr/bin/env bash
# =============================================================================
# 404seo — Installation initiale Podman (rootless) sur VPS HestiaCP
# =============================================================================
# A executer UNE SEULE FOIS, en tant que l'utilisateur applicatif (PAS root)
# qui possede le projet (ex: l'utilisateur HestiaCP "SEO" ou un user dedie).
#
#   bash deployment/podman/setup-podman.sh
#
# Ce script :
#   1. Verifie/installe Podman (apt, peut demander sudo)
#   2. Active le "lingering" systemd (services --user qui survivent au logout)
#   3. Active podman.socket --user (compat docker-compose)
#   4. Prepare l'arborescence ~/404seo attendue par les Quadlets
#   5. Rappelle les etapes Postgres + .env + Nginx
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
USER_NAME="$(id -un)"

echo "=========================================="
echo "  404seo — Setup Podman (rootless)"
echo "  Utilisateur : $USER_NAME"
echo "  Projet      : $PROJECT_DIR"
echo "=========================================="
echo ""

if [ "$(id -u)" -eq 0 ]; then
  echo "ERREUR : lance ce script en tant qu'utilisateur applicatif, PAS root."
  echo "         (Podman rootless = pas de root)"
  exit 1
fi

# ── 1. Podman ─────────────────────────────────────────────────────────────────
if ! command -v podman >/dev/null 2>&1; then
  echo ">> Podman absent. Installation (sudo requis)..."
  sudo apt-get update
  sudo apt-get install -y podman podman-compose uidmap slirp4netns fuse-overlayfs
else
  echo "[OK] Podman $(podman --version | awk '{print $3}')"
fi

# ── 1bis. D-Bus session utilisateur (REQUIS pour systemd --user + Quadlets) ───
# Sans dbus-user-session / dbus-launch, Podman rootless affiche
#   "Failed to add pause process to systemd sandbox cgroup: dbus-launch not found"
# et la gestion systemd --user des conteneurs (boot auto) est instable.
if ! command -v dbus-launch >/dev/null 2>&1 \
   || ! dpkg -s dbus-user-session >/dev/null 2>&1; then
  echo ">> Installation de la session D-Bus utilisateur..."
  sudo apt-get install -y dbus-user-session dbus-x11 systemd-container || true
fi

# podman-compose (fallback pip si paquet apt absent)
if ! command -v podman-compose >/dev/null 2>&1; then
  echo ">> Installation de podman-compose via pip..."
  sudo apt-get install -y python3-pip || true
  pip3 install --user podman-compose || true
fi

# ── 2. Lingering (les services --user tournent sans session ouverte) ─────────
echo ">> Activation du lingering systemd pour $USER_NAME..."
sudo loginctl enable-linger "$USER_NAME"

# Variables d'env pour systemctl --user en SSH non-interactif
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

# ── 3. Socket Podman (compat docker-compose / outils Docker API) ─────────────
echo ">> Activation de podman.socket --user..."
systemctl --user enable --now podman.socket 2>/dev/null || true

# ── 4. Arborescence attendue par les Quadlets ─────────────────────────────────
# Les Quadlets referencent %h/404seo/... : on s'assure que ~/404seo pointe sur le projet.
LINK_TARGET="$HOME/404seo"
if [ "$PROJECT_DIR" != "$LINK_TARGET" ] && [ ! -e "$LINK_TARGET" ]; then
  echo ">> Creation du lien ~/404seo -> $PROJECT_DIR"
  ln -s "$PROJECT_DIR" "$LINK_TARGET"
fi

mkdir -p "$PROJECT_DIR/logs"

# ── 5. Rappels ────────────────────────────────────────────────────────────────
cat <<EOF

=========================================="
  Setup Podman termine.
=========================================="

PROCHAINES ETAPES (manuelles) :

  1) Configurer le .env :
       cp $SCRIPT_DIR/.env.example $SCRIPT_DIR/.env
       nano $SCRIPT_DIR/.env
     -> renseigner DATABASE_URL, BETTER_AUTH_SECRET, REDIS_PASSWORD, Stripe, Google, Resend, Anthropic.

  2) Autoriser PostgreSQL (HestiaCP) a accepter les conteneurs :
     Les conteneurs joignent l'hote via host.containers.internal (passerelle Podman).
     - Postgres doit ecouter sur l'IP de la passerelle podman OU sur 0.0.0.0 (filtre par pg_hba).
       Dans postgresql.conf :   listen_addresses = 'localhost,10.88.0.1'   (adapter l'IP passerelle)
       Verifier l'IP passerelle :  podman network inspect 404seo | grep -i gateway
     - Dans pg_hba.conf, autoriser le sous-reseau podman (ex 10.88.0.0/16) en scram-sha-256.
     - sudo systemctl reload postgresql
     (Voir README.md, section "PostgreSQL natif".)

  3) Premier deploiement (build images + demarrage) :
       bash $SCRIPT_DIR/deploy-podman.sh

  4) (Recommande) Demarrage auto au boot via Quadlet systemd :
       bash $SCRIPT_DIR/deploy-podman.sh --install-quadlet

  5) Brancher Nginx HestiaCP :
     Copier deployment/podman/nginx.podman.conf dans la config du domaine
     (voir README.md, section "Nginx HestiaCP").

EOF
