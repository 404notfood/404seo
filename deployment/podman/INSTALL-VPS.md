# 🚀 Checklist premier déploiement VPS — 404seo (Podman)

> Suivre **dans l'ordre**, ligne par ligne. Domaine cible : `https://seo.404notfood.fr`
>
> Pré-requis déjà présents sur ton VPS : **HestiaCP** (Nginx + PostgreSQL),
> **Node via nvm**, Composer (inutile ici, ignore-le).
> Il manque uniquement **Podman** + l'outillage rootless.

---

## ⚠️ Note importante sur Node + nvm

`nvm` installe Node dans ton `$HOME` → il n'est dispo **que** pour ton
utilisateur en shell interactif (chargé par `~/.bashrc`). Deux conséquences :

1. Les migrations Prisma lancées par `deploy-podman.sh` ont besoin de `node`/`npx`
   dans le `PATH`. Lance toujours le script depuis un **shell de login**
   (connexion SSH normale), pas via cron/systemd brut.
2. Pour fiabiliser, vérifie que `node` répond **avant** de déployer :
   ```bash
   node -v    # doit afficher v22.x (ou v20+)
   npx -v
   ```
   Si `node: command not found`, recharge nvm : `source ~/.nvm/nvm.sh && nvm use 22`

---

## Étape 0 — Créer l'utilisateur HestiaCP `seo`

Cet utilisateur joue **deux rôles** :
1. il **possède le domaine** `seo.404notfood.fr` dans HestiaCP (chemins
   `/home/seo/...`, certificats SSL) ;
2. il **fait tourner Podman rootless** (`$HOME = /home/seo` = là où vivent le
   repo, le `.env` et les Quadlets).

### 0a. Créer l'utilisateur dans HestiaCP (en root)
```bash
# Adapte l'email et le mot de passe
sudo v-add-user seo 'MOT_DE_PASSE_FORT' laurentbwa@gmail.com default 'SEO App'
```
> Ou via l'interface web HestiaCP : **Users → Add User** (login : `seo`).

### 0b. Ajouter le domaine + activer SSL
```bash
sudo v-add-domain seo seo.404notfood.fr
sudo v-add-letsencrypt-domain seo seo.404notfood.fr
```

### 0c. Passer sur l'utilisateur seo pour la suite
> ⚠️ Toutes les commandes des étapes suivantes s'exécutent en tant que `seo`
> (PAS root), sauf celles préfixées `sudo`.
>
> **Utilise `machinectl shell` et PAS `su - seo`** : Podman rootless + les
> Quadlets (services `systemd --user`) ont besoin d'une vraie session systemd
> utilisateur avec son bus D-Bus. `su -` ne la crée pas → tu aurais des erreurs
> `Failed to connect to user scope bus` / `dbus-launch not found`.
```bash
# Requiert systemd-container (installé à l'étape 1)
sudo machinectl shell seo@
whoami      # doit afficher : seo
```
> Si `machinectl shell` n'est pas encore dispo (paquet pas installé), fais
> l'étape 1 d'abord depuis ton compte actuel, puis reviens ici.

> Note : Node/nvm a été installé sous TON compte initial, pas forcément sous
> `seo`. Vérifie `node -v` une fois connecté en `seo` ; si absent, réinstalle
> nvm pour cet utilisateur (voir encadré nvm plus haut) ou installe Node via
> NodeSource en global (`sudo` une fois).

---

## Étape 0bis — Vérifier sous quel user tu es

```bash
whoami      # doit afficher : seo
```

---

## Étape 1 — Installer Podman + prérequis root (compte AVEC sudo)

> ⚠️ **Important** : un utilisateur HestiaCP (`seo`) **n'a PAS sudo** (c'est
> volontaire). Tout ce qui exige root se fait depuis un compte privilégié :
> l'utilisateur **`debian`** (ou root) qui a sudo.
>
> Toute cette étape se fait donc **en tant que `debian`/root**, PAS `seo`.

Un script dédié fait tout en une commande (paquets + dbus + lingering + subuid) :

```bash
# Connecté en debian (compte avec sudo) :
cd /home/seo/404seo     # le repo cloné par seo (lisible par debian via sudo si besoin)
sudo bash deployment/podman/setup-root.sh seo
```

> Si `debian` ne peut pas lire `/home/seo/404seo`, copie juste le script :
> `sudo cp /home/seo/404seo/deployment/podman/setup-root.sh /tmp/ && sudo bash /tmp/setup-root.sh seo`

Ce script installe : `podman`, `podman-compose`, `uidmap`, `slirp4netns`,
`fuse-overlayfs`, `dbus-user-session`, `dbus-x11`, `systemd-container`, puis
active le **lingering** pour `seo` et lui alloue les sous-UID/GID.

### Vérifier (toujours en debian)
```bash
podman --version
command -v dbus-launch                              # doit renvoyer un chemin
loginctl show-user seo -p Linger --value           # doit afficher : yes
```

> Tu as déjà installé podman/dbus manuellement plus tôt ? Le script est
> idempotent : il saute ce qui est déjà là et se contente d'activer le
> lingering + subuid. Lance-le quand même pour être sûr.

### Test rootless (en tant que seo)
```bash
sudo machinectl shell seo@
podman run --rm docker.io/library/hello-world
```
Si ça affiche "Hello from Docker!" sans warning dbus → rootless OK. ✅

---

## Étape 2 — Récupérer le projet

```bash
cd ~
git clone <URL_DE_TON_REPO> 404seo
cd 404seo
```

> Les Quadlets attendent le projet dans `~/404seo`. Si tu clones ailleurs,
> `setup-podman.sh` crée un lien symbolique `~/404seo` automatiquement.

---

## Étape 3 — Préparer PostgreSQL (HestiaCP, déjà installé)

> ⚠️ Toute cette étape utilise `sudo` → fais-la depuis le compte **`debian`**
> (qui a sudo), PAS depuis `seo`. Seule la commande `podman network ...` (3b)
> se fait en `seo`.

### 3a. Créer la base et l'utilisateur
> Remplace `TON_MOT_DE_PASSE` par le mot de passe que TU choisis. C'est le même
> qu'il faudra reporter dans `DATABASE_URL` (étape 5).
```bash
sudo -u postgres psql -c "CREATE USER seo_user WITH PASSWORD 'TON_MOT_DE_PASSE';"
sudo -u postgres psql -c "CREATE DATABASE seo_db OWNER seo_user;"
```

### 3b. Connexion conteneurs → Postgres : RIEN à faire 🎉
Ce déploiement utilise **`--network=host`** (mode réseau hôte, le plus fiable en
Podman 4.x rootless). Les conteneurs partagent la pile réseau de l'hôte, donc
**Postgres reste sur `127.0.0.1:5432` et les conteneurs le joignent directement**.

➡️ **Aucune modification de `postgresql.conf` ni `pg_hba.conf`.** Postgres reste
fermé sur localhost — c'est idéal pour la sécurité. Dans le `.env`, on met
simplement :
```
DATABASE_URL="postgresql://seo_user:TON_MOT_DE_PASSE@127.0.0.1:5432/seo_db"
```

> Pourquoi ce choix : en Podman 4.3.1 rootless, un Postgres qui écoute sur
> `127.0.0.1` n'est PAS joignable depuis un réseau bridge isolé sans exposer
> Postgres sur une IP publique (risqué). Le mode host évite tout ça.

---

## Étape 4 — Setup Podman côté utilisateur (en tant que `seo`, SANS sudo)

```bash
sudo machinectl shell seo@      # si pas déjà dans la session seo
cd ~/404seo
bash deployment/podman/setup-podman.sh
```

Ce script **ne demande aucun sudo** : il vérifie que les prérequis root
(podman, dbus, lingering) sont en place — installés à l'étape 1 par
`setup-root.sh` — puis active le socket Podman `--user` et crée le lien
`~/404seo` attendu par les Quadlets.

> S'il affiche `[MANQUANT] ...`, c'est que l'étape 1 (`setup-root.sh`) n'a pas
> été faite ou a échoué : retourne sur le compte `debian` et relance-la.

---

## Étape 5 — Configurer les secrets (.env)

```bash
cp deployment/podman/.env.example deployment/podman/.env
nano deployment/podman/.env
chmod 600 deployment/podman/.env
```

À remplir **obligatoirement** :
- `DATABASE_URL` → `postgresql://seo_user:TON_MOT_DE_PASSE@127.0.0.1:5432/seo_db`
  (le **même mot de passe** que celui choisi à l'étape 3a ; `127.0.0.1` car
  mode `--network=host`)
- `BETTER_AUTH_SECRET` → génère-le : `openssl rand -base64 32`
- `REDIS_PASSWORD` → un mot de passe fort
- `REDIS_URL` → `redis://:LE_MEME_MDP@redis:6379`
- Clés Stripe, Google OAuth, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`

---

## Étape 6 — Premier déploiement

```bash
cd ~/404seo
bash deployment/podman/deploy-podman.sh --install-quadlet
```

Ce que fait le script :
1. build des 3 images (site, api, worker) — **long la 1re fois** (téléchargement
   de l'image Playwright ~1.5 Go + npm install)
2. migrations Prisma (`prisma migrate deploy`)
3. installe les units systemd (boot auto) et démarre tout
4. health check sur `http://127.0.0.1:4000/health`

Vérifie :
```bash
podman ps
systemctl --user status '404seo-*'
curl -fsS http://127.0.0.1:4000/health   # doit répondre {"status":"ok",...}
curl -I   http://127.0.0.1:3030          # doit répondre 200/307
```

---

## Étape 7 — Brancher Nginx HestiaCP (façade SSL publique)

### 7a. Vérifier que le domaine + SSL sont en place
Déjà fait à l'étape 0b (`v-add-domain` + `v-add-letsencrypt-domain`). Vérifie
que le certificat existe :
```bash
ls /home/seo/conf/web/seo.404notfood.fr/ssl/
# doit contenir seo.404notfood.fr.pem et .key
```

### 7b. Installer la conf reverse proxy
```bash
sudo cp deployment/podman/nginx.podman.conf \
    /home/seo/conf/web/seo.404notfood.fr/nginx.ssl.conf
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ Vérifie l'IP `51.254.138.28` dans `nginx.podman.conf` : si l'IP publique de
> ton VPS est différente, remplace-la.

### 7c. Test public
```bash
curl -I https://seo.404notfood.fr
curl    https://seo.404notfood.fr/api/health
```

---

## Étape 8 — Pare-feu (vérification)

Ports publics ouverts : **22, 80, 443** (+ 8083 si tu exposes le panel Hestia).
**NE PAS** ouvrir 3030 / 4000 / 5432 / 6379 — ils sont sur `127.0.0.1` / réseau
interne Podman. Le pare-feu HestiaCP gère déjà ça par défaut.

---

## ✅ Récapitulatif "qu'est-ce que j'installe ?"

| Composant | État sur ton VPS | Action |
|---|---|---|
| HestiaCP (Nginx, pare-feu, SSL) | ✅ déjà là | rien |
| PostgreSQL | ✅ déjà là (Hestia) | créer base + autoriser réseau Podman |
| Node / nvm | ✅ déjà là | vérifier `node -v` |
| Composer | ✅ déjà là | inutile ici, ignorer |
| **Podman + rootless tooling** | ❌ **à installer** | **Étape 1** |
| **podman-compose** | ❌ **à installer** | **Étape 1** |
| Redis | ❌ | conteneurisé automatiquement (rien à installer) |
| Docker | ❌ | **pas besoin** (on utilise Podman) |

---

## 🔧 Dépannage rootless

**`ERRO ... newuidmap: write to uid_map failed`**
```bash
# Vérifier que ton user a des sous-UID/GID alloués
grep "$(whoami)" /etc/subuid /etc/subgid
# Si vide :
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "$(whoami)"
podman system migrate
```

**Les conteneurs ne survivent pas à la déconnexion SSH**
```bash
sudo loginctl enable-linger "$(whoami)"
```

**`systemctl --user` ne marche pas en SSH**
```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
# (à ajouter dans ~/.bashrc pour le rendre permanent)
```

**Voir les logs d'un service**
```bash
journalctl --user -u 404seo-api -f
podman logs -f 404seo-worker-crawl
```
