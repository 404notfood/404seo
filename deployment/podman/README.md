# Déploiement Podman (rootless) + HestiaCP — 404seo

> Dossier **autonome et supprimable**. Tu peux effacer `deployment/podman/`
> sans rien casser dans le projet : il ne contient que de l'infra de déploiement.
> Le déploiement PM2 historique reste disponible dans `deployment/` (fallback).

## Architecture retenue

On conteneurise **uniquement l'application** (site + api + workers) + Redis.
**PostgreSQL reste natif HestiaCP** et **Nginx HestiaCP reste le reverse proxy SSL**.
C'est le choix le plus fiable sur un VPS HestiaCP déjà chargé : zéro conflit de
ports 80/443, pas de second gestionnaire de certificats, données Postgres
intouchées.

```text
Internet
  │
  ▼
HestiaCP Nginx + Let's Encrypt (443)        ← seule porte d'entrée publique
  ├── /api/auth/*  → 127.0.0.1:3030  (BetterAuth, géré par Next.js)
  ├── /api/*       → 127.0.0.1:4000  (Fastify)
  └── /*           → 127.0.0.1:3030  (Next.js)

Podman rootless (--network=host : tous les conteneurs sur la pile réseau hôte)
  ├── 404seo-site    (image 404seo-site)    → bind 127.0.0.1:3030
  ├── 404seo-api     (image 404seo-api)     → bind 127.0.0.1:4000
  ├── 404seo-redis   (redis:7-alpine)       → bind 127.0.0.1:6379
  ├── 404seo-worker-crawl (image 404seo-worker, Playwright/Chromium)
  └── 404seo-scheduler    (image 404seo-worker)

PostgreSQL natif HestiaCP (127.0.0.1:5432)
  └── joint directement via 127.0.0.1 (mode host) — Postgres reste fermé sur localhost
```

> **Mode réseau `host`** : choisi car en Podman 4.x rootless, un Postgres qui
> écoute sur `127.0.0.1` n'est pas joignable depuis un réseau bridge isolé sans
> l'exposer sur une IP publique (risqué). Le mode host laisse Postgres fermé sur
> localhost ; chaque process applicatif BIND sur `127.0.0.1` pour rester derrière
> Nginx. Pas d'isolation réseau entre conteneurs (acceptable : ils sont tous à toi).

### Pourquoi Podman (et pas Docker)
- **Rootless** : si l'app (qui crawle des sites externes) est compromise,
  l'attaquant n'est pas root sur l'hôte.
- **Sans démon** : pas de `dockerd` root permanent en conflit potentiel avec HestiaCP.
- **Quadlet** : intégration systemd native → démarrage auto au boot, `systemctl`, journald.

### Pourquoi 3 images
- `site` : Next.js standalone, image finale minimale.
- `api` : Fastify en `tsx` (comme PM2, zéro étape de build fragile).
- `worker` : basée sur l'image officielle **Playwright** (Chromium + deps système
  inclus à la bonne version) → aucune galère de libs manquantes au crawl.

---

## Fichiers du dossier

| Fichier | Rôle |
|---|---|
| `Dockerfile.site` / `.api` / `.worker` | Build des 3 images (contexte = racine du repo) |
| `compose.yml` | Orchestration via `podman-compose` (dev/test ou prod simple) |
| `quadlet/*.container` `.network` `.volume` | Units systemd (prod : boot auto) |
| `.env.example` | Toutes les variables (copier vers `.env`) |
| `.containerignore` | Exclusions du contexte de build |
| `setup-podman.sh` | Install initiale (Podman, lingering, arborescence) |
| `deploy-podman.sh` | Build + migrate Prisma + (re)start + health |
| `nginx.podman.conf` | Conf Nginx HestiaCP (identique au PM2 : ports 3030/4000) |

---

## 1. Installation initiale (une fois)

En tant qu'**utilisateur applicatif** (l'utilisateur HestiaCP `seo`, **pas root**) :

```bash
cd ~/404seo            # ou le chemin où le repo est cloné
bash deployment/podman/setup-podman.sh
```

Le script installe Podman (sudo ponctuel), active le *lingering* (les services
tournent sans session SSH ouverte), le socket Podman, et crée le lien `~/404seo`.

### PostgreSQL natif (à faire une fois, compte avec sudo)

Créer la base et l'utilisateur :

```bash
sudo -u postgres psql -c "CREATE USER seo_user WITH PASSWORD 'CHANGE_ME_ALPHANUM';"
sudo -u postgres psql -c "CREATE DATABASE seo_db OWNER seo_user;"
```

**C'est tout pour Postgres.** En mode `--network=host`, les conteneurs joignent
Postgres directement via `127.0.0.1:5432` → **aucune modification de
`postgresql.conf` ni `pg_hba.conf`**. Postgres reste fermé sur localhost.

> Dans `.env` :
> `DATABASE_URL="postgresql://seo_user:CHANGE_ME_ALPHANUM@127.0.0.1:5432/seo_db"`

---

## 2. Configurer les secrets

```bash
cp deployment/podman/.env.example deployment/podman/.env
nano deployment/podman/.env
chmod 600 deployment/podman/.env
```

À renseigner : `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
`REDIS_PASSWORD`, les clés Stripe, Google OAuth, Resend, `ANTHROPIC_API_KEY`.

---

## 3. Premier déploiement

```bash
# Build images + migrations + démarrage + installation des units systemd (boot auto)
bash deployment/podman/deploy-podman.sh --install-quadlet
```

Sans `--install-quadlet`, le script démarre via `podman-compose` (pratique pour
tester). Avec, il installe les Quadlets → services systemd qui redémarrent seuls
au boot et en cas de crash.

---

## 4. Brancher Nginx HestiaCP

```bash
sudo cp deployment/podman/nginx.podman.conf \
    /home/seo/conf/web/seo.404notfood.fr/nginx.ssl.conf
sudo nginx -t && sudo systemctl reload nginx
```

Les ports proxifiés (3030 / 4000) sont **identiques** au déploiement PM2 — la
conf Nginx est donc interchangeable entre les deux modes.

---

## 5. Mises à jour

```bash
bash deployment/podman/deploy-podman.sh        # git pull + rebuild + migrate + restart
```

---

## 6. Exploitation

```bash
# Prod (Quadlet / systemd --user)
systemctl --user status '404seo-*'
journalctl --user -u 404seo-api -f
systemctl --user restart 404seo-api.service

# podman-compose
podman ps
podman logs -f 404seo-worker-crawl

# Health
curl -I  http://127.0.0.1:3030
curl -fsS http://127.0.0.1:4000/health
curl -I  https://seo.404notfood.fr
```

---

## 7. Sécurité / pare-feu

Ports publics ouverts : **22, 80, 443** (+ panel Hestia si exposé).
**Ne jamais** ouvrir 3030 / 4000 / 5432 / 6379 dans UFW : ils sont liés à
`127.0.0.1` (app) ou au réseau interne Podman (Redis). Seul Nginx est en façade.

---

## 8. Revenir en arrière (rollback vers PM2)

```bash
# Arrêter la stack Podman
systemctl --user stop '404seo-*'      # (ou: podman-compose -f deployment/podman/compose.yml down)
# Relancer PM2
pm2 start deployment/ecosystem.config.cjs
# Remettre la conf Nginx PM2 (identique de toute façon)
```

Le dossier `deployment/podman/` peut être supprimé sans impact sur le code.

---

## Notes techniques

- **API & workers en `tsx`** : identique au fonctionnement PM2 actuel
  (`build = tsc --noEmit`), pas de compilation TS fragile dans le monorepo.
- **Next.js** : `output: standalone` + `turbopack.root: ".."` → le `server.js`
  standalone est sous `site/server.js` dans l'image (d'où `CMD node site/server.js`).
- **Redis** : alias réseau `redis` (= `REDIS_HOST` du `.env`), mot de passe +
  `appendonly`, volume persistant `404seo-redis-data`.
- **Worker crawl** : `shm_size: 1g` requis par Chromium headless.
- **Version Playwright** : le tag de `Dockerfile.worker`
  (`mcr.microsoft.com/playwright:v1.50.1-noble`) doit suivre la version de
  `playwright` dans `packages/crawler/package.json`.
```
