# Déploiement HestiaCP — seo.404notfood.fr

Node.js 24 LTS, PostgreSQL, Redis, npm et quatre services PM2. Next.js écoute sur 127.0.0.1:3030, Fastify sur 127.0.0.1:4000. Nginx termine HTTPS ; /api/auth/ va vers Next.js, les autres /api/ vers Fastify.

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
npm ci --include=dev
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
(cd site && npx prisma migrate deploy)
mkdir -p logs
cp -r site/public site/.next/standalone/site/
cp -r site/.next/static site/.next/standalone/site/.next/
cp -r site/.next/server site/.next/standalone/site/.next/
pm2 start deployment/ecosystem.config.cjs
pm2 save
pm2 startup
```

Exécuter la commande de démarrage automatique affichée par PM2. --include=dev est requis car API/workers utilisent tsx. Le sandbox Chromium est activé en production ; ne pas ajouter --no-sandbox. Configurer le sandbox Linux si le système interdit les namespaces utilisateur.

Installer les templates persistants :

```bash
sudo bash deployment/hestia/install.sh --user seo --domain seo.404notfood.fr
```

L'installateur choisit les templates web (Nginx seul) ou proxy (Nginx + Apache) suivant Hestia et valide nginx -t. Ne pas remplacer directement la configuration générée du domaine : Hestia la réécrit lors d'un rebuild ([documentation](https://hestiacp.com/docs/server-administration/web-templates)). deployment/nginx.ssl.conf est désormais une notice historique.

## Services externes

- Stripe : clés serveur, signature webhook https://seo.404notfood.fr/api/billing/webhook, prix dans PlanConfig via l'administration. Tester souscription, renouvellement et résiliation avant passage en mode réel.
- Google : autoriser https://seo.404notfood.fr/api/auth/callback/google pour la connexion et https://seo.404notfood.fr/api/google/callback pour GBP/Analytics. Les permissions GBP dépendent du compte et du projet Google Cloud.
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

Contrôler pm2 status, les logs des quatre services, nginx -t, connexion/inscription, un audit réel et son PDF, les notifications et chaque intégration activée. Confirmer que 3030, 4000, 5432 et 6379 ne sont pas accessibles depuis Internet. Les tests du dépôt ne remplacent pas cette recette sur le serveur.
