#!/usr/bin/env bash
# =============================================================================
# 404seo — Entrypoint API
# =============================================================================
# Resout dynamiquement le binaire Chromium fourni par l'image Playwright et
# l'expose a Puppeteer (generation des PDF dans @seo/reporter) via
# PUPPETEER_EXECUTABLE_PATH, puis exec la commande passee (CMD).
#
# Robuste aux montees de version de l'image Playwright (le sous-dossier
# chromium-XXXX change a chaque version).
# =============================================================================
set -e

if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
  # Cherche un binaire chrome dans l'arborescence Playwright
  CHROME_BIN="$(find "${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}" \
      -type f -name 'chrome' -path '*chrome-linux*' 2>/dev/null | head -n1 || true)"
  if [ -n "$CHROME_BIN" ]; then
    export PUPPETEER_EXECUTABLE_PATH="$CHROME_BIN"
  fi
fi

exec "$@"
