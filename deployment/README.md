# 404seo — Deploiement PM2 + HestiaCP

## Architecture

```
Internet
  |
  v
HestiaCP Nginx (SSL Let's Encrypt)
  |
  |-- /api/*  -->  Fastify API    (127.0.0.1:4000)  [PM2]
  '-- /*      -->  Next.js 16     (127.0.0.1:3030)  [PM2]
                    |
                    |-- Worker BullMQ                [PM2]
                    '-- Redis 7   (127.0.0.1:6379)  [apt]

PostgreSQL -> HestiaCP natif
```

## Stack

| Service | Gere par | Port |
|---------|----------|------|
| Next.js 16 | PM2 | 3030 |
| Fastify API | PM2 | 4000 |
| Worker BullMQ | PM2 | - |
| Redis 7 | apt/systemd | 6379 |
| PostgreSQL | HestiaCP | 5432 |
| Nginx + SSL | HestiaCP | 443 |

## Installation initiale (une seule fois)

### 1. Dependances systeme

```bash
sudo bash deployment/setup.sh
```

Installe : Node.js 22, npm, PM2, Redis, deps Playwright.

### 2. Configurer les variables d'environnement

```bash
cp deployment/.env.example site/.env.local
nano site/.env.local
```

### 3. Installer les dependances et build

```bash
npm install
cd site && npx prisma generate && npx prisma migrate deploy && npm run build && cd ..
npx playwright install chromium
```

### 4. Lancer PM2

```bash
pm2 start deployment/ecosystem.config.cjs
pm2 save
pm2 startup   # puis executer la commande affichee
```

### 5. Template Nginx HestiaCP

Copier `nginx.ssl.conf` dans la config du domaine HestiaCP :

```bash
sudo cp deployment/nginx.ssl.conf /home/SEO/conf/web/seo.404notfood.fr/nginx.ssl.conf
sudo systemctl reload nginx
```

## Deploiement (mise a jour)

```bash
bash deployment/deploy.sh
```

Ce script fait : git pull, npm install, prisma migrate, build Next.js, pm2 reload.

## Commandes utiles

```bash
# Status des process
pm2 status

# Logs en temps reel
pm2 logs
pm2 logs 404seo-site
pm2 logs 404seo-api
pm2 logs 404seo-worker

# Redemarrer un service
pm2 restart 404seo-api

# Reload zero-downtime
pm2 reload deployment/ecosystem.config.cjs

# Arreter tout
pm2 stop all

# Redis
sudo systemctl status redis-server
sudo systemctl restart redis-server

# Migration Prisma
cd site && npx prisma migrate deploy

# Prisma Studio (debug DB)
cd site && npx prisma studio
```

## Structure

```
deployment/
|-- ecosystem.config.cjs    <- Config PM2 (3 process)
|-- .env.example            <- Template variables d'env
|-- deploy.sh               <- Script de mise a jour
|-- setup.sh                <- Installation initiale VPS
|-- nginx.ssl.conf          <- Config Nginx complete
|-- hestia/
|   '-- install.sh          <- Installation template HestiaCP
'-- README.md
```
