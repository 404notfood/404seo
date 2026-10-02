# Audit du projet avant déploiement — 1 octobre 2026

Les corrections portent sur le frontend Next.js, BetterAuth, les routes Fastify, Prisma, le crawler, le PDF, les workers, l'extension Chrome, les dépendances et le déploiement HestiaCP pour **https://seo.404notfood.fr**. Elles sont présentes dans le répertoire de travail ; aucun déploiement, commit ni modification de la base métier locale n'a été effectué.

## Failles et défauts corrigés

| Priorité | Constat | Correction |
| --- | --- | --- |
| Critique | Les champs BetterAuth additionnels pouvaient être fournis à l'inscription, notamment rôle, superadministrateur et tenant. | `input: false` sur les champs privilégiés ; création du tenant et attribution du rôle côté serveur. Un test d'inscription malveillante confirme un compte GUEST sans privilège, rattaché à son propre tenant. |
| Haute | Protection incomplète des pages du dashboard, sessions et origines des mutations. | Vérification de session côté serveur dans le layout, contrôle frais des bannissements/suspensions, proxy complété, vérification HMAC des cookies Fastify, CSRF/CORS par origines exactes, exceptions publiques limitées par méthode et chemin. |
| Haute | Une validation initiale d'URL ne protège pas les redirections, sous-ressources ni changements DNS. | Client HTTP commun : adresses réservées refusées en IPv4/IPv6, résolution de toutes les adresses, IP publique épinglée à chaque socket, validation de chaque redirection, délais et tailles bornés. Routage au niveau du contexte Chromium, Service Workers et WebSockets bloqués. |
| Haute | Le PDF pouvait charger des ressources externes avec les privilèges réseau du serveur. | JavaScript désactivé ; réseau bloqué sauf logo validé et téléchargé par le client sécurisé ; formats d'images limités ; sandbox conservé. Limite de deux générations simultanées. |
| Haute | Des tables enfants ne portaient pas leur tenant ; des identifiants Google globalement uniques pouvaient mélanger les synchronisations. | `tenantId` obligatoire sur neuf tables enfants, clés étrangères composites vers leurs parents, identifiants d'avis/posts Google uniques par tenant. Backfill conservant les données. |
| Haute | Certaines opérations backlinks, concurrents et positions n'appliquaient pas complètement la propriété du projet. | Filtrage par tenant et utilisateur, contrôles de propriétaire sur les mutations, schémas et pagination bornés, URL de liens limitées à HTTP(S). Les vérifications de positions simultanées sont bornées. |
| Haute | Quotas vérifiés avant écriture, donc contournables par des requêtes concurrentes ; compteurs absents sans abonnement et historique supprimable. | Verrou PostgreSQL par tenant et vérification dans la transaction de création. Budget réservé pour les audits actifs, rapports terminés comptabilisés, quota illimité respecté. Suppression logique des projets/audits pour conserver les consommations ; planifications désactivées lors de la suppression. Usage affiché par mois UTC. |
| Haute | Déduplication Stripe volatile et événement marqué traité avant la réussite des écritures. | Verrou Redis, déduplication durable après succès, reprise en cas d'échec, transactions pour l'abonnement et les droits, lecture de l'état courant pour les mises à jour. Gestion de l'abonnement réservée au propriétaire initial ou ADMIN, tout en permettant l'achat au propriétaire GUEST. |
| Moyenne | OAuth Google et synchronisations pouvaient poursuivre sans recontrôler le propriétaire. | State à usage unique lié à un cookie HttpOnly, origine du parcours conservée et utilisateur/tenant revalidés au callback ; écritures soumises au rôle requis. |
| Moyenne | Reprises de workers pouvant dupliquer pages, résultats ou consommation ; rapport produit même si toutes les pages sont inaccessibles. | Identifiants de jobs déterministes, remplacement des résultats d'analyse en transaction, rapport et incrément de consommation atomiques, audit terminé préservé. Un crawl sans réponse HTTP échoue. Le scheduler récupère les audits PENDING après un échec de transmission à Redis. Arrêt SIGTERM/SIGINT et fermeture des connexions. |
| Moyenne | Configuration de production dispersée, écoute réseau trop large, templates historiques divergents. | `.env.production` commun, validation du secret et des URL de production, écoute Node sur loopback, IP cliente écrasée par Nginx, limites de corps HTTP, headers de sécurité. Templates persistants adaptés aux deux modes Hestia. Scripts avec arrêt sur erreur et fins de ligne LF. |
| Moyenne | Dépendances vulnérables, installation historique issue de pnpm et problèmes de compilation/lint. | Lockfile npm, mises à jour compatibles avec la stack imposée, retrait des plugins inutilisés, adaptation Puppeteer/Vite, corrections TypeScript/React/lint. Next.js reste en version 16 et Prisma en version 6. |

Les règles d'entrée BetterAuth sont documentées dans [Additional fields](https://better-auth.com/docs/concepts/database). L'interception des requêtes de navigateur et ses limites sont documentées dans [Playwright network](https://playwright.dev/docs/network). La configuration Hestia repose sur [ses templates persistants](https://hestiacp.com/docs/server-administration/web-templates).

## Vérifications réalisées

- **TypeScript** : neuf workspaces vérifiés avec `npm run typecheck`.
- **Lint** : ESLint du frontend sans erreur ni avertissement. Les autres workspaces sont couverts par TypeScript ; ils ne possèdent pas de tâche ESLint.
- **Build** : build des neuf workspaces, Next.js 16.3.8 en mode production et extension Vite.
- **Standalone** : démarrage de l'artefact Next.js de production, accueil et endpoint de session accessibles ; cinq routes privées redirigent un visiteur anonyme vers la connexion et les headers de sécurité sont présents.
- **Sécurité et fonctionnalités automatisées** : seize tests réussis, dont inscription malveillante réelle BetterAuth, cookie valide/falsifié, permissions administrateur, CSRF, bannissement, clés étrangères entre tenants, lancements concurrents et conservation du quota après suppression logique. Les tests réseau simulent DNS mixtes, épinglage du socket, redirection privée et réponse trop volumineuse. Le plan d’action ajoute la persistance, l’import GSC transactionnel, la séparation des comptes Google, la vérification des corrections et les régressions.
- **Prisma** : les 19 migrations s'appliquent sur une base PostgreSQL isolée ; le diff entre cette base et le schéma est vide. Une seconde base, peuplée avant les migrations de sécurité, confirme la conservation et le backfill des neuf tables enfants.
- **Crawler réel** : example.com accessible en HTTP 200, titre extrait, analyse et scoring exécutés ; cible localhost rejetée.
- **Pipeline réel** : Redis isolé et worker BullMQ démarrés sur la base de test ; crawl, analyse et rapport terminés. Une nouvelle exécution du job de rapport conserve un seul rapport et une seule page consommée.
- **PDF réel** : un PDF de 64 Ko généré avec Chromium, avec données contenant des tentatives d'injection et un logo localhost interdit.
- **Nginx** : les quatre templates substitués passent `nginx -t` avec Nginx 1.28.2 et un certificat de test. Syntaxe des scripts Bash vérifiée.
- **Extension** : les fichiers référencés par le manifeste généré existent ; le chemin de l'injection de secours correspond au nouveau build.
- **Dépendances** : `npm audit` signale **0 vulnérabilité connue** dans le lockfile vérifié. Ce résultat dépend du registre et de la date du contrôle.

Pour reproduire les tests standards :

```bash
npm run db:generate
npm run typecheck
npm test
npm run lint
npm run build
npm audit
```

Le test d'intégration PostgreSQL requiert `TEST_DATABASE_URL` et refuse une base autre que `seo_security_audit` sur `127.0.0.1`. Sans cette variable, il est explicitement ignoré ; ne jamais le pointer vers la base métier. La base de test utilisée pendant cet audit écoute sur le port 55432 et n'utilise aucune donnée du projet.

## Migrations ajoutées

1. `20261001000000_auth_rate_limits` : stockage partagé des limites BetterAuth.
2. `20261001010000_tenant_child_integrity` : backfill des tenants et intégrité des relations enfants.
3. `20261001020000_google_account_index` : correction d'un ancien index unique qui empêchait plusieurs comptes Google par tenant.
4. `20261001030000_preserve_project_audits` : suppression logique des projets.
5. `20261002000000_action_plan_search_console` : snapshots Search Console, métriques, suivi des actions et clés étrangères composites. Voir [le fonctionnement et les limites du plan d’action](ACTION_PLAN.md).

Elles ne sont pas appliquées à la base métier. Sauvegarder la base avant `prisma migrate deploy`. Les contraintes composites refuseront des données historiquement incohérentes plutôt que les supprimer automatiquement ; traiter une éventuelle incohérence dans la copie de préproduction avant mise en service.

Les tables d'authentification et les configurations globales restent globales selon leur rôle : elles ne reçoivent pas artificiellement un tenant obligatoire incompatible avec BetterAuth ou la configuration de plans.

## Ce qui reste à valider sur le VPS

Suivre [deployment/README.md](deployment/README.md) et renseigner `.env.production`. Les clés Stripe, Google, Resend et IA ainsi que les accès au VPS n'ont pas été fournis pour une recette de bout en bout.

La recette doit confirmer les certificats réels, permissions Hestia/PM2, sandbox Chromium Linux, PostgreSQL/Redis privés, sauvegardes, le pipeline BullMQ et son arrêt gracieux sur Linux, partage/PDF, abonnement Stripe réel en mode test, callbacks Google et envoi d'emails. Les protections réseau du code n'impliquent pas que le pare-feu du VPS est correctement configuré.

Les intégrations existantes dépendent de leurs permissions et disponibilités externes. Cet audit corrige le code disponible ; il ne complète pas les écrans ou modules qui étaient déjà des démonstrations. Il ne constitue pas une garantie d'absence de toute faille future ni un test d'intrusion du VPS, encore hors ligne.

Les anciens `node_modules` ont été conservés dans des dossiers ignorés `node_modules.pre-audit` pendant la conversion npm. Les outils et bases temporaires sont sous `.audit-artifacts`, également ignoré. Les modifications déjà présentes avant l'audit, notamment le packaging de l'extension, ont été conservées.
