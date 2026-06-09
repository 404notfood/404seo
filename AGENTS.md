# AGENTS.md — SaaS SEO Platform

> Instructions permanentes pour Codex sur ce projet.
> Ce fichier est lu automatiquement à chaque session.

---

## PROJET

Application SaaS d'audit SEO (type SEMrush/Ahrefs) — voir `blueprint/README.md` pour l'architecture complète.

## STACK — NE JAMAIS SUBSTITUER

| Rôle | Technologie |
|------|-------------|
| Framework | **Next.js 16.x** App Router UNIQUEMENT |
| Auth | **BetterAuth** — PAS Clerk, PAS NextAuth |
| Auth routing | **`proxy.ts`** (Next.js 16) — PAS `middleware.ts` |
| CSS | **TailwindCSS** — PAS styled-components, PAS emotion |
| Composants | **Shadcn UI** — PAS Material UI, PAS Chakra |
| Graphiques | **Recharts** |
| Data fetching | **TanStack Query v5** |
| Backend | **Fastify** — PAS Express |
| ORM | **Prisma 6.x** + **PostgreSQL** |
| Queue | **BullMQ** + **Redis** |
| Crawler | **Playwright** + **Cheerio** |
| PDF | **Puppeteer** |
| Packages | **npm** — PAS pnpm, PAS yarn |
| Infra locale | **Laragon** (PostgreSQL + Redis + Node.js natifs) |
| Infra VPS | **HestiaCP** + **PM2** — PAS Docker, PAS Podman |

## RÈGLES DE CODE

### TypeScript
- TypeScript strict sur tout le projet
- Pas de `any` explicite — utiliser `unknown` si nécessaire
- Interfaces pour les types partagés dans `packages/shared/src/types/`

### Next.js 16
- App Router uniquement — PAS de `/pages`
- Server Components par défaut, `"use client"` seulement si nécessaire
- Fichier auth proxy : `proxy.ts` à la racine (export `function proxy()`)
- Handler BetterAuth : `app/api/auth/[...all]/route.ts`

### Sécurité (CRITIQUE)
- Toujours valider les URLs avec `isValidPublicUrl()` avant crawl (anti-SSRF)
- Bloquer : localhost, 127.x, 10.x, 192.168.x, 172.16.x
- Sanitiser tout HTML avec `cheerio` avant stockage
- Rate limiting sur toutes les routes API publiques

### Base de données
- `tenantId` obligatoire sur toutes les tables Prisma
- Pas de DELETE direct — vérifier l'appartenance au tenant avant
- Transactions Prisma pour les opérations multi-tables

### Workers BullMQ
- Toujours `exec_mode: "fork"` pour les workers (jamais cluster)
- `maxRetriesPerRequest: null` sur la connexion Redis (requis par BullMQ)
- Graceful shutdown : `process.on("SIGTERM", ...)` dans chaque worker

## STRUCTURE MONOREPO

```
apps/web/          → Next.js 16
apps/api/          → Fastify
packages/crawler/  → Playwright + Cheerio
packages/analyzer/ → Analyse SEO
packages/scorer/   → Scoring pondéré
packages/reporter/ → PDF Puppeteer
packages/ai/       → Module IA (Codex API)
packages/shared/   → Types + utils partagés
workers/           → Workers BullMQ
prisma/            → schema.prisma + migrations
```

## CONVENTIONS DE FICHIERS

```
composants React  : PascalCase.tsx
hooks             : use*.ts
utilitaires       : camelCase.ts
types             : *.types.ts
constantes        : UPPER_CASE dans constants.ts
```

## COMMANDES FRÉQUENTES

```bash
npm run dev                          # Démarrer tout (Turborepo)
npm run dev --workspace=apps/web     # Next.js seulement
npm run dev --workspace=apps/api     # Fastify seulement
npx prisma studio                    # GUI base de données
npx prisma migrate dev               # Nouvelle migration
npx prisma generate                  # Régénérer le client
npm run build                        # Build de tout
```

## BLUEPRINT DE RÉFÉRENCE

Toute l'architecture est documentée dans `blueprint/` :
- `blueprint/00-analyse/` — Décisions techniques
- `blueprint/01-architecture/ARCHITECTURE.md` — Schéma système
- `blueprint/03-backend/` — Auth, proxy, handlers
- `blueprint/04-services/` — Crawler, analyzer, scorer, PDF, workers
- `blueprint/05-database/schema.prisma` — Schéma Prisma
- `blueprint/06-infrastructure/` — Laragon + HestiaCP + PM2
- `blueprint/07-docs/DOCUMENTATION-LINKS.md` — Tous les liens de docs

## LANGUE

Toujours répondre en **français**. Code et identifiants en anglais.
