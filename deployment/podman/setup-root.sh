#!/usr/bin/env bash
# =============================================================================
# 404seo — Setup Podman — partie ROOT (a lancer UNE FOIS par un admin sudo)
# =============================================================================
# Un utilisateur HestiaCP (ex: seo) n'a pas sudo. Cette partie privilegiee est
# donc faite par root, ou par l'utilisateur 'debian' qui a sudo.
#
# Usage (depuis un compte ayant sudo, ex: debian) :
#   sudo bash deployment/podman/setup-root.sh seo
#
# (Remplacer 'seo' par le nom de l'utilisateur applicatif si different.)
#
# Ce script :
#   1. Installe podman, podman-compose et l'outillage rootless
#   2. Installe la session D-Bus utilisateur (requise pour systemd --user)
#   3. Active le "lingering" pour l'utilisateur applicatif
#      (ses conteneurs tournent sans session SSH ouverte)
# =============================================================================
set -euo pipefail

APP_USER="${1:-seo}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERREUR : lance ce script avec sudo (droits root requis)."
  echo "  sudo bash $0 $APP_USER"
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  echo "ERREUR : l'utilisateur '$APP_USER' n'existe pas."
  echo "  Cree-le d'abord dans HestiaCP (v-add-user) puis relance."
  exit 1
fi

echo "=========================================="
echo "  404seo — Setup Podman (ROOT)"
echo "  Utilisateur applicatif : $APP_USER"
echo "=========================================="
echo ""

# ── 1. Paquets ────────────────────────────────────────────────────────────────
echo ">> apt-get update..."
apt-get update

echo ">> Installation Podman + outillage rootless + D-Bus..."
apt-get install -y \
  podman \
  podman-compose \
  uidmap \
  slirp4netns \
  fuse-overlayfs \
  dbus-user-session \
  dbus-x11 \
  systemd-container \
  python3-pip \
  git \
  curl

# podman-compose en fallback pip si le paquet apt n'existe pas (vieilles distros)
if ! command -v podman-compose >/dev/null 2>&1; then
  echo ">> podman-compose absent en apt — installation via pip (global)..."
  pip3 install podman-compose || true
fi

# ── 2. Sous-UID / sous-GID pour le rootless (souvent deja fait, par securite) ─
if ! grep -q "^${APP_USER}:" /etc/subuid 2>/dev/null; then
  echo ">> Allocation des sous-UID/GID pour $APP_USER..."
  usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "$APP_USER"
fi

# ── 3. Lingering ──────────────────────────────────────────────────────────────
echo ">> Activation du lingering systemd pour $APP_USER..."
loginctl enable-linger "$APP_USER"

echo ""
echo "=========================================="
echo "  Setup ROOT termine."
echo "=========================================="
echo ""
echo "  Verifications :"
echo "    podman --version"
echo "    command -v dbus-launch"
echo "    loginctl show-user $APP_USER -p Linger --value   # doit afficher: yes"
echo ""
echo "  Etape suivante, en tant que '$APP_USER' :"
echo "    sudo machinectl shell $APP_USER@"
echo "    cd ~/404seo && bash deployment/podman/setup-podman.sh"
echo ""
