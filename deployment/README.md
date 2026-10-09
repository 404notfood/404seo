# Déploiement HestiaCP — seo.404notfood.fr

Node.js 24 LTS, PostgreSQL, Redis, npm et cinq services PM2. Next.js écoute sur 127.0.0.1:3030, Fastify sur 127.0.0.1:4000. Nginx termine HTTPS ; /api/auth/ va vers Next.js, les autres /api/ vers Fastify.

## Installation

Créer le domaine et son utilisateur dans HestiaCP, pointer le DNS vers le VPS, activer Let's Encrypt et la redirection HTTPS. Installer Node.js 24 LTS et PM2. PostgreSQL/Redis doivent écouter uniquement sur localhost, leurs ports doivent rester fermés depuis Internet.

Cloner le dépôt comme utilisateur Hestia dans /home/seo/404seo, hors de public_html. Adapter seo au véritable utilisateur. Ne pas lancer Node, PM2 ou les navigateurs en root.

```bash
cd /home/seo/404seo
cp deployment/.env.example .env.production
chmod 600 .env.production
nano .env.production
```

Remplacer les valeurs d'exemple. Générer BETTER_AUTH_SECRET avec `openssl rand -base64 32`. Conserver les URL publiques https://seo.404notfood.fr. Les secrets ne doivent jamais être commités. NEXT_PUBLIC_* est intégré au build : reconstruire après modification.

Comme utilisateur Hestia :

```bash
set -a
source .env.production
set +a
export NODE_ENV=production
npm ci --include=dev --include=optional
```

Ensuite, `sudo bash deployment/setup.sh` installe Redis et les dépendances système Chromium. Revenir à l'utilisateur Hestia :

```bash
npx playwright install chromium
npx puppeteer browsers install chrome
npm run db:generate
npm run typecheck
npm test
npm run lint
npm run build
node deployment/preflight.mjs --config-only
node deployment/backup.mjs create
(cd site && npx prisma migrate deploy)
mkdir -p logs
cp -r site/public site/.next/standalone/site/
cp -r site/.next/static site/.next/standalone/site/.next/
cp -r site/.next/server site/.next/standalone/site/.next/
pm2 start deployment/ecosystem.config.cjs
pm2 save
pm2 startup
```

Exécuter la commande de démarrage automatique affichée par PM2. --include=dev est requis car API/workers utilisent tsx. --include=optional installe les binaires natifs adaptés au serveur, notamment Lightning CSS et Tailwind ; leurs entrées doivent être présentes dans package-lock.json. Le sandbox Chromium est activé en production ; ne pas ajouter --no-sandbox. Configurer le sandbox Linux si le système interdit les namespaces utilisateur.

Installer les templates persistants :

```bash
sudo bash deployment/hestia/install.sh --user seo --domain seo.404notfood.fr
```

L'installateur choisit les templates web (Nginx seul) ou proxy (Nginx + Apache) suivant Hestia et valide nginx -t. Ne pas remplacer directement la configuration générée du domaine : Hestia la réécrit lors d'un rebuild ([documentation](https://hestiacp.com/docs/server-administration/web-templates)). deployment/nginx.ssl.conf est désormais une notice historique.

## Services externes

- Stripe : clés serveur, signature webhook https://seo.404notfood.fr/api/billing/webhook, prix dans PlanConfig via l'administration. Tester souscription, renouvellement et résiliation avant passage en mode réel.
- Google : autoriser https://seo.404notfood.fr/api/auth/callback/google pour la connexion et https://seo.404notfood.fr/api/google/callback pour GBP/Analytics. Les permissions GBP dépendent du compte et du projet Google Cloud.
- GA4 : activer **Google Analytics Admin API** et **Google Analytics Data API** dans le projet Google Cloud OAuth. Le scope `analytics.readonly` est inclus dans la connexion Analytics + Search Console. Renseigner une propriété et un flux web couvrant le projet, puis vérifier l’import et les comparaisons avec un compte réel. Voir [ANALYTICS.md](../ANALYTICS.md).
- Resend : clé et expéditeur vérifié pour inscription/récupération. Sans clé, emails et obligation de vérification d'adresse sont désactivés.
- Extension : origine exacte chrome-extension://ID dans CHROME_EXTENSION_ORIGINS ; utiliser un ID stable.

## Mises à jour

Sauvegarder PostgreSQL et .env.production avant migration. Comme utilisateur Hestia :

```bash
cd /home/seo/404seo
bash deployment/deploy.sh
```

Le script récupère main en fast-forward, utilise npm ci, vérifie TypeScript/tests/lint/build avant les migrations, copie les assets standalone et relance PM2. Un échec arrête le script. Un retour Git ne restaure pas le schéma : prévoir la sauvegarde. Les workers attendent les tâches actives à l'arrêt dans la limite du délai PM2 de 120 secondes.

## Recette sur le VPS

La migration additive 20261002040000_url_inventory ajoute les snapshots sitemap et leur verrou par projet. Dans /internal-linking, ouvrir l’inventaire sitemap/GSC et importer les sitemaps publics du projet. Vérifier les preuves, les avertissements de couverture et les dates avant de corriger des pages candidates. Voir [URL_INVENTORY.md](../URL_INVENTORY.md). L’import réseau conserve les protections SSRF communes et ne lance aucun crawl automatique des URLs trouvées.

Contrôler pm2 status, les logs des cinq services, nginx -t, connexion/inscription, un audit réel et son PDF, les notifications et chaque intégration activée. Confirmer que 3030, 4000, 5432 et 6379 ne sont pas accessibles depuis Internet. Les tests du dépôt ne remplacent pas cette recette sur le serveur.

Après la migration du maillage, relancer un audit puis vérifier `/internal-linking` : les anciens audits n’ont pas de paragraphes ni d’ancres contextualisées. Voir [INTERNAL_LINKING.md](../INTERNAL_LINKING.md) pour les bornes et la recette.

## Contrôle avant mise en service

Configurer les valeurs réelles dans .env.production, protégé par chmod 600, puis lancer :

```bash
npm run deployment:check -- --config-only
npm run deployment:check
npm run deployment:check -- --commercial
```

Le premier contrôle ne contacte pas PostgreSQL. Le deuxième vérifie aussi les migrations et plans actifs. Le mode commercial bloque sur les intégrations, budgets, prix Stripe ou informations de société encore incomplets. Aucun secret n’est affiché. Ces contrôles ne valident pas les comptes fournisseurs, paiements, emails, DNS ni TLS : effectuer leur recette avant ouverture des inscriptions payantes. Sans Resend configuré, le contrôle commercial échoue, même si une version de test peut fonctionner sans vérification email.

Les trois migrations du 2 octobre ajoutent les lots CMS, le registre de coûts IA, la preuve des mesures de position et les sauvegardes de segments textuels. Les nouveaux quotas et budgets IA sont nuls par défaut. Configurer aiMonthlyQuota, aiMonthlyBudgetCents (centimes USD) et cmsMonthlyQuota dans chaque abonnement concerné. Renseigner le modèle et ses deux prix par million de tokens, puis comparer l’usage calculé avec le compte fournisseur. Voir [CMS_AUTOMATION.md](../CMS_AUTOMATION.md).

Le cinquième processus est 404seo-cms-worker, en mode fork. /health contrôle la vie de l’API ; **/health/ready** renvoie 503 si PostgreSQL, Redis ou un heartbeat des trois workers est indisponible. Le déploiement attend cette disponibilité après redémarrage. Le mode fork et les migrations n’assurent pas une mise à jour sans interruption : prévoir un créneau de maintenance.

## Sauvegarde chiffrée et exercice de restauration

Installer les outils clients PostgreSQL compatibles avec la version du serveur. Définir BACKUP_DIR comme répertoire absolu privé hors du projet et de public_html, et BACKUP_ENCRYPTION_KEY comme clé aléatoire hexadécimale de 32 octets, distincte de CMS_CREDENTIAL_KEY. Protéger le répertoire par chmod 700 et conserver une copie de la clé de sauvegarde **hors du VPS**. La perte de cette clé empêche de déchiffrer les archives.

```bash
cd /home/seo/404seo
npm run deployment:backup
```

L’archive comprend le dump PostgreSQL et .env.production chiffrés séparément en AES-256-GCM, plus un manifeste de tailles et SHA-256. Le dump ne transite pas par un fichier SQL en clair. deploy.sh exige une sauvegarde réussie avant les migrations. Copier les archives complètes vers un stockage extérieur privé ; les sauvegardes Hestia ordinaires ne remplacent pas cette copie et doivent elles-mêmes être protégées.

Créer une base PostgreSQL locale **vide**, avec un nom commençant par seo_restore_, et renseigner RESTORE_DATABASE_URL dans l’environnement de production. Puis :

```bash
node deployment/backup.mjs restore-drill /home/seo/seo-backups/IDENTIFIANT_ARCHIVE
```

L’exercice refuse la base source, une destination distante, un nom non réservé et une base déjà remplie. Il vérifie le manifeste puis authentifie le déchiffrement avant toute écriture PostgreSQL. La restauration utilise une transaction unique. La configuration déchiffrée est vérifiée, sans être installée ou affichée. Cet outil teste la restaurabilité ; il ne remplace pas la base métier.

Après une perte du VPS, restaurer d’abord sur un environnement isolé et réinstaller les mêmes versions du code et des modules CMS. Reconstituer Redis et relancer les workers : les lots CMS sont durables en PostgreSQL. Vérifier les opérations UNCERTAIN avant publication ; une restauration ancienne peut avoir perdu la trace d’écritures récentes sur les CMS externes, dont les marqueurs doivent être rapprochés. Contrôler les audits interrompus dont les jobs Redis ont disparu et les relancer. Ne pas relancer automatiquement des écritures externes après une restauration.

## Surveillance et tâches HestiaCP

```bash
npm run deployment:monitor
node deployment/monitor.mjs --quiet
```

Le contrôle examine l’API prête, les cinq processus PM2, les lots en retard, les publications incertaines et la présence d’une archive complète de moins de 26 heures. Il retourne un code non nul et des motifs sans secrets lorsqu’une intervention est nécessaire. --quiet reste silencieux lorsque tout fonctionne. La surveillance des sauvegardes contrôle leur présence et leur date ; l’exercice de restauration contrôle leur intégrité réelle.

Installer sous **l’utilisateur Hestia du projet**, avec son PATH Node/PM2 et un expéditeur de cron configuré, ces tâches adaptées aux chemins réels :

```cron
15 2 * * * cd /home/seo/404seo && /usr/bin/node deployment/backup.mjs create
*/5 * * * * cd /home/seo/404seo && /usr/bin/node deployment/monitor.mjs --quiet
```

Ne pas rediriger les erreurs vers /dev/null : elles servent aux alertes cron. Configurer la rétention et la copie extérieure suivant le volume et la durée de conservation souhaités. Aucun cron, compte fournisseur ou service VPS n’a été installé depuis cette session locale.
