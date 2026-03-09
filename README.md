<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000?style=for-the-badge&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Fastify-5-000?style=for-the-badge&logo=fastify" alt="Fastify 5" />
  <img src="https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma" alt="Prisma 6" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Stripe-Billing-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" />
</p>

<h1 align="center">
  SEO Radar
  <br />
  <sub><sup>Plateforme SaaS d'audit SEO intelligente</sup></sub>
</h1>

<p align="center">
  <strong>L'outil SEO qui te donne un plan d'action, pas des donnees.</strong>
  <br />
  Audit technique complet, scoring pondere, recommandations IA, rapports PDF — le tout en quelques secondes.
</p>

<p align="center">
  <a href="#-fonctionnalites">Fonctionnalites</a> •
  <a href="#%EF%B8%8F-stack-technique">Stack</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-commandes">Commandes</a> •
  <a href="#-plans-tarifaires">Plans</a>
</p>

---

## Fonctionnalites

### Audit SEO complet

| Module | Description |
|--------|-------------|
| **Crawl** | Exploration multi-pages via Playwright + Cheerio avec protection anti-SSRF |
| **Analyse technique** | Status codes, redirections, canonicals, indexabilite, robots.txt, sitemap |
| **Analyse on-page** | Titles, meta descriptions, headings (H1-H6), images alt, liens internes/externes |
| **Performance & UX** | Temps de reponse, poids des pages, Core Web Vitals (LCP, CLS, FID, TTFB) |
| **Scoring** | Algorithme pondere sur 4 axes — score global 0-100 avec grade A/B/C/D/F |
| **Recommandations IA** | Suggestions priorisees generees par Claude API (Anthropic) |
| **Rapport PDF** | Document complet genere via Puppeteer — cover, scores, issues, plan d'action |

### Plateforme SaaS

- **Multi-tenant** — isolation complete des donnees par organisation
- **Roles** — Admin (acces complet), Membre (audits + projets), Invite (lecture seule)
- **Plans Stripe** — Starter / Pro / Agency avec quotas de pages mensuels
- **Dashboard** — stats temps reel, historique d'audits, visualisations Recharts
- **Extension Chrome** — analyse SEO rapide directement dans le navigateur

---

## Stack technique

```
Frontend       Next.js 16 (App Router) + TailwindCSS + Shadcn UI + Recharts
Auth           BetterAuth (proxy.ts) + sessions PostgreSQL
Backend        Fastify 5 + Zod validation
ORM            Prisma 6 + PostgreSQL
Queue          BullMQ + Redis
Crawler        Playwright + Cheerio
PDF            Puppeteer
IA             Claude API (Anthropic)
Billing        Stripe (Checkout + Webhooks + Customer Portal)
Data fetching  TanStack Query v5
Extension      Chrome Manifest V3 + Vite
Monorepo       Turborepo + npm workspaces
Infra locale   Laragon (PostgreSQL + Redis + Node.js natifs)
Infra VPS      HestiaCP + PM2 + Nginx
```

---

## Architecture

```
seo/
├── site/                   Next.js 16 — Frontend web
│   ├── app/
│   │   ├── (auth)/         Login + Register
│   │   ├── (dashboard)/    Dashboard, Audits, Projets, Settings, Billing
│   │   └── api/auth/       Handler BetterAuth
│   ├── components/
│   │   ├── layout/         Sidebar, Providers
│   │   ├── audit/          ScoreGauge, ScoreRadar, IssueList, AuditProgress
│   │   └── ui/             Shadcn UI (button, card, dialog, etc.)
│   ├── hooks/              useAudits, useProjects, useMe, useRole
│   ├── lib/                auth, prisma, api-client, utils
│   └── prisma/             Schema + migrations
│
├── apps/
│   ├── api/                Fastify — API REST
│   │   ├── plugins/        Auth (JWT + cookie + auto-tenant)
│   │   ├── routes/         /audits, /projects, /billing, /me
│   │   └── lib/            Prisma, Redis, Guards (requireRole, requirePlan)
│   └── extension/          Chrome Extension (Manifest V3)
│       ├── popup/          UI analyse rapide
│       ├── content/        Content script (10 checks SEO)
│       ├── background/     Service worker (badge couleur)
│       └── options/        Configuration API
│
├── packages/
│   ├── crawler/            SEOCrawler (Playwright + Cheerio, anti-SSRF)
│   ├── analyzer/           analyzePage() — technical, onPage, uxMobile
│   ├── scorer/             calculateGlobalScore(), generateRecommendations()
│   ├── reporter/           generatePDF() via Puppeteer
│   ├── ai/                 Module IA (Claude API)
│   └── shared/             Types + utils partages
│
├── workers/                Workers BullMQ (crawl → analyze → score → report)
├── blueprint/              Documentation architecture complete
└── turbo.json              Configuration Turborepo
```

### Flux d'un audit

```
Client                    API Fastify              BullMQ Workers
  │                          │                          │
  ├─ POST /api/audits ──────►│                          │
  │                          ├─ Cree Audit (PENDING) ──►│
  │                          ├─ Ajoute job a la queue──►│
  │  ◄── { auditId } ───────┤                          │
  │                          │                          ├─ CRAWLING
  │  GET /audits/:id/progress│                          │  Playwright crawl
  │  (SSE polling) ─────────►│ ◄── update status ──────┤
  │  ◄── stream events ──────┤                          ├─ ANALYZING
  │                          │                          │  Checks SEO
  │                          │                          ├─ SCORING
  │                          │                          │  Score 0-100
  │                          │                          ├─ GENERATING_REPORT
  │                          │                          │  PDF Puppeteer
  │                          │ ◄── COMPLETED ──────────┤
  │  ◄── score + results ────┤                          │
```

---

## Installation

### Prerequis

- **Node.js** >= 20
- **PostgreSQL** >= 15
- **Redis** >= 7
- **npm** >= 10

> Sous Windows, [Laragon](https://laragon.org/) fournit PostgreSQL + Redis nativement.

### Setup

```bash
# 1. Cloner le depot
git clone <repo-url> seo && cd seo

# 2. Installer les dependances
npm install

# 3. Configurer les variables d'environnement
cp site/.env.example site/.env.local
```

Remplir `site/.env.local` :

```env
# Base de donnees
DATABASE_URL="postgresql://postgres:root@localhost:5432/seo_saas"

# BetterAuth
BETTER_AUTH_SECRET="votre-secret-aleatoire-64-chars"
BETTER_AUTH_URL="http://localhost:3000"

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_AGENCY=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# API
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

```bash
# 4. Appliquer les migrations
cd site && npx prisma migrate dev && cd ..

# 5. Lancer en dev (tout le monorepo)
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:4000 |
| Prisma Studio | `npx prisma studio` (port 5555) |

---

## Commandes

```bash
# Developpement
npm run dev                          # Tout le monorepo (Turborepo)
npm run dev -w site                  # Next.js seulement
npm run dev -w apps/api              # Fastify seulement

# Build
npm run build                        # Build complet

# Base de donnees
npm run db:migrate                    # Nouvelle migration Prisma
npm run db:generate                   # Regenerer le client Prisma
npm run db:studio                     # GUI Prisma Studio

# Extension Chrome
cd apps/extension && npm run build    # Build → dist/ (charger dans chrome://extensions)
```

---

## Systeme de roles

| Role | Voir les audits | Lancer un audit | Creer un projet | Supprimer | Gerer les users |
|------|:-:|:-:|:-:|:-:|:-:|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Membre** | ✅ | ✅ | ✅ | — | — |
| **Invite** | ✅ | — | — | — | — |

Le premier utilisateur inscrit recoit automatiquement le role **Admin** et un tenant est cree pour lui.

---

## Plans tarifaires

| Plan | Prix | Pages/mois | Cible |
|------|------|:----------:|-------|
| **Starter** | Gratuit | 100 | Independants, test |
| **Pro** | 99 EUR/mois | 10 000 | Startups, PME |
| **Agency** | 249 EUR/mois | 100 000 | Agences SEO |
| **Enterprise** | Sur devis | Illimite | Grands comptes |

Integration Stripe complete : Checkout, webhooks, Customer Portal, gestion automatique des quotas.

---

## Extension Chrome

L'extension fournit une **analyse SEO rapide** directement dans le navigateur :

- 10 checks instantanes (title, meta, H1, images, liens, HTTPS, viewport, etc.)
- Score 0-100 avec badge colore sur l'icone
- Connexion a l'API pour lancer un audit complet depuis le popup
- Zero tracking, zero donnees envoyees sans autorisation

```bash
cd apps/extension
npm run build        # → dist/
# Charger dist/ dans chrome://extensions (mode developpeur)
```

---

## Securite

- **Anti-SSRF** — validation des URLs avant crawl (`isValidPublicUrl()`) : bloque localhost, 127.x, 10.x, 192.168.x, 172.16.x
- **Multi-tenant** — `tenantId` obligatoire sur toutes les tables, verification systematique
- **Sanitisation** — tout HTML parse via Cheerio avant stockage
- **Rate limiting** — sur les routes API publiques
- **Transactions** — Prisma transactions pour les operations multi-tables
- **Sessions** — expiration 7 jours, renouvellement quotidien, cache cookie 5 min

---

## Documentation

Le dossier `blueprint/` contient toute la documentation d'architecture :

| Dossier | Contenu |
|---------|---------|
| `00-analyse/` | Decisions techniques, analyse globale |
| `01-architecture/` | Schema systeme, flux, arborescence |
| `02-frontend/` | Notes Next.js 16, BetterAuth, TanStack Query |
| `03-backend/` | Auth config, proxy, handlers |
| `04-services/` | Crawler, analyzer, scorer, PDF, workers |
| `05-database/` | Schema Prisma, strategie DB, index |
| `06-infrastructure/` | Laragon + HestiaCP + Podman Quadlet |
| `07-docs/` | Liens vers toutes les docs officielles |
| `08-business/` | Plans tarifaires, growth strategy, KPIs |
| `09-design/` | Design system, palette, composants |
| `10-chrome-extension/` | Extension Chrome Manifest V3 |

---

## Design

<table>
<tr>
<td><strong>Deep Navy</strong><br/><code>#0F172A</code></td>
<td><strong>Blue electrique</strong><br/><code>#2563EB</code></td>
<td><strong>Cyan IA</strong><br/><code>#06B6D4</code></td>
<td><strong>Blanc</strong><br/><code>#FFFFFF</code></td>
<td><strong>Gris clair</strong><br/><code>#F1F5F9</code></td>
</tr>
</table>

- Sidebar dark navy, navigation avec bordure bleue active
- Cards `rounded-2xl` avec hover shadow
- Score gauge SVG circulaire anime
- Animations : count-up, radar-spin, pulse-cyan, slide-up
- Boutons primary avec glow cyan au hover

---

## Licence

Projet prive — Tous droits reserves.
"# 404seo" 
