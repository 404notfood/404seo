# Déploiement — seo

VPS Project Generator 1.3.0 ; schéma 1. Installation native Debian 13, sans panel ni conteneur.
Le formulaire décrit ce qui est **prévu** ; install.sh ce qui est **généré**. Ni le manifest
ni l'audit du navigateur ne prouvent ce qui est **installé** ou **vérifié** sur le VPS.
Les sources applicatives et les secrets ne sont pas inclus dans ce bundle.

## Paramètres et prérequis

- Compte : seo ; application : /home/seo/app ; stack : Next.js.
- PHP : non utilisé ; Node : 24 dans /opt/nvm.
- Gestionnaire : npm ; installation/build à la racine du dépôt.
- Configuration : .env.production ; modèle : deployment/.env.example.
- Domaines : seo.404notfood.fr (application).
- Interfaces DB : désactivées.
- Mail : désactivé.

Le bootstrap fournit Nginx, systemd, logrotate, OpenSSL et les runtimes sélectionnés,
les clients/serveurs DB/Redis et Certbot/dig pour HTTPS. Composer est requis pour Laravel.


Le script vérifie Node exact dans le NVM partagé root, sans charger .bashrc ni réinstaller Node.
PHP 8.6 / Node 20 ne sont disponibles que si explicitement confirmés et présents.
PM2 6 est installé sous le compte projet dans ~/.local ; aucun PM2 global root.
Option navigateurs : apt-get installe une liste fixe de bibliothèques/fonts Debian 13. Le code Playwright/Puppeteer du projet et les téléchargements de navigateurs tournent sous le compte applicatif, jamais root.

Les sources/lockfiles et hooks npm/Composer doivent être fiables : ils s'exécutent
sous le compte projet et peuvent accéder à ses secrets. Le générateur reste entièrement local.

## Supprimer ce projet

Le bootstrap serveur installe la commande globale **supp** :

```bash
sudo supp seo --dry-run
sudo supp seo
```

Retaper **seo** lorsque la commande le demande. La suppression est définitive :
sources, fichiers et sauvegardes locales, base et compte DB, compte Linux et sessions,
services/PM2/Redis dédié, configurations Nginx/PHP/SSH, certificat et registre.
Le socle, Redis partagé, domaines/boîtes mail, DNS et sauvegardes distantes sont conservés.
Les connexions pgAdmin gérées sont supprimées ; les connexions manuelles restent.
Le script bloque si une configuration gérée a été modifiée manuellement ou si un
chemin est lié ou monté. En cas d'interruption, relancer la même commande.
Si supp manque sur un serveur déjà installé, transférer le fichier supp du paquet
serveur puis lancer : sudo install -o root -g root -m 750 ./supp /usr/local/sbin/supp.

## Préparation et déploiement

Relire install.sh, nginx.conf.template et manifest.json ; préparer DNS A/AAAA, sources, intégrations et sauvegardes.
nginx.conf.template montre le vhost final destiné à /etc/nginx/sites-available/seo.conf.
install.sh prépare l'hébergement avant de toucher aux sources : compte et espace projet,
SSH/SFTP, ports réservés et vhost Nginx, certificat HTTPS, puis base et utilisateur DB.
Le certificat est demandé avant le clone et le build. Un échec DNS/Certbot conserve le vhost HTTP et arrête le script ; corriger les DNS et relancer.
Le vhost d'attente conserve les protections, les interfaces sélectionnées et les routes proxy.
La racine applicative répond 503 avant le déploiement ; une route proxy peut répondre 502
tant que son backend n'est pas lancé. Le site est activé après un build réussi.
Le lien /etc/nginx/sites-enabled/seo.conf est contrôlé dans la configuration chargée par nginx -T.
Ne pas activer manuellement ce modèle avant l'installation : les certificats HTTPS doivent exister
et, en mode port automatique, @APP_PORT@ doit être remplacé par le port attribué dans
/var/lib/vps-projects/seo/app-port. Le fichier exporté sert à la lecture ; install.sh reste autonome.
Les vhosts mail/webmail sont créés séparément par vps-mail-domain si la messagerie est activée.
Source Git : https://github.com/404notfood/404seo.git, branche main. Clone uniquement dans un dossier vide.
Le script ne fait aucun pull/reset. Préparer l'accès privé et known_hosts sous le compte projet ;
mettre à jour les sources manuellement avant toute relance.

```bash
chmod +x install.sh
sudo ./install.sh --preflight
sudo ./install.sh --provision
# Transférer les sources par SFTP si nécessaire, puis déployer :
sudo ./install.sh
```

--preflight contrôle le socle sans installation/écriture persistante. --provision prépare
l'hébergement jusqu'à la base et son utilisateur, puis termine avec succès pour toute source
(Git, archive ou déjà présentes). Aucun clone, extraction, dépendance, build, worker ou PM2
n'est lancé dans ce mode. Une application déjà en ligne reste servie pendant cette préparation.
Sans option, le même provisionnement précède les sources, .env.production, la configuration DB/Redis,
l'installation Laravel/Next/PHP et le build ; les workers et PM2 démarrent à la fin.
Redis est préparé après .env.production : le mode existant lit ses paramètres dans ce fichier.
À la création, deployment/.env.example est copié vers .env.production,
chmod 600. Les variables existantes sont préservées ; une incompatibilité DB/bind arrête
le script. Remplir manuellement les clés fournisseurs et les valeurs signalées, puis relancer.
Ne jamais importer les secrets dans le formulaire/JSON ni les mettre dans argv des hooks.
Accès SFTP : utiliser seo et le port SSH configuré sur le VPS dans votre client.
Ce mode utilise uniquement la clé publique sélectionnée.
Dossier à ouvrir : /home/seo/app. Accès shell cloisonné + SFTP, sans sudo.

Variables contrôlées : DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, CMS_CREDENTIAL_KEY, BACKUP_ENCRYPTION_KEY, BACKUP_DIR.
URL dérivée du domaine principal : BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL.

Node/npm sont invoqués par chemin exact et PATH explicite sous seo.
Le compte projet charge aussi cette version de Node et ~/.local/bin dans son shell SSH.
PM2_HOME pointe vers ~/.pm2, comme le service du projet. Reconnecter les sessions déjà ouvertes,
ou charger l'environnement dans la session courante :
```bash
. "$HOME/.vps-project-env"
command -v node npm
node --version && npm --version
pm2 list
```
Pour un compte créé avec une ancienne version du générateur, transférer
repair-project-shell.sh du paquet serveur et exécuter depuis le compte administrateur :
```bash
sudo bash ./repair-project-shell.sh seo
```
npm ci inclut dev et optional ; le lockfile v2/v3 est contrôlé avant installation.
Toutes les variantes natives Lightning CSS/Next/Tailwind déclarées restent dans le lockfile.
Lightning CSS est chargé et transforme du CSS sous le compte applicatif après npm ci.
Une entrée manquante doit être corrigée dans les sources, puis relue et redéployée :
le script ne remplace pas npm ci par une installation non figée et ne désactive aucun test.

Secrets générés sur le VPS : BETTER_AUTH_SECRET, BACKUP_ENCRYPTION_KEY, CMS_CREDENTIAL_KEY.
Les variables NEXT_PUBLIC_* sont chargées **avant npm install/postinstall et le build** ;
elles sont publiques et intégrées aux assets. Une modification nécessite un rebuild.

## Build, données et processus

Seed : Désactivé.


Next.js est contrôlé dans site/package.json ; le script build est requis à la racine.
Configurer output: 'standalone' et le tracing du monorepo si nécessaire.
Serveur : site/.next/standalone/site/server.js. Copie automatique de public/, .next/static/ et
.next/server/ depuis site vers ce dossier, puis démarrage direct par Node.
Port : 3030, persisté dans le registre ; collisions et écoute locale contrôlées.




PostgreSQL/MariaDB : postgresql. Ressources limitées à la base seo.
Mot de passe créé et conservé sur le VPS ; aucune adoption d'une ressource inconnue.
La base et son compte sont créés avant le clone ou l'extraction, sans fichier env requis.
Les variables DB_* sont vérifiées et renseignées ensuite dans .env.production ; un secret
incompatible est refusé avant toute écriture et n'est jamais remplacé.

Récapitulatif des accès : affiché sur la console SSH à la fin du provisionnement
et du déploiement, puis conservé en clair dans un fichier privé root (mode 600).
Les mots de passe ne passent pas dans le journal d'installation. Pour le relire :
```bash
sudo cat /var/lib/vps-projects/seo/credentials.txt
sudo cat /var/lib/vps-projects/seo/db-password
```
Le récapitulatif contient les accès DB et les accès HTTP/Redis préparés.
Le mot de passe Linux saisi avec passwd ne peut pas être récupéré ; utiliser
sudo passwd seo pour le redéfinir. Les chaînes hexadécimales générées sont
les mots de passe eux-mêmes, pas des empreintes chiffrées.
Connexion DATABASE_URL construite en plus des DB_*.
Si pgAdmin est installé, la connexion PostgreSQL est enregistrée automatiquement dès
la création de la base, même avec --provision. Elle apparaît dans le groupe « Projets VPS »
du premier administrateur pgAdmin interne actif. Actualiser l'arbre après connexion.
Le mot de passe est fourni par un fichier .pgpass privé (mode 600), propre à ce compte.
Une connexion manuelle compatible est conservée ; les autres connexions ne sont pas remplacées.
Sans pgAdmin installé, la création de la base continue avec un avertissement.
Prisma : client généré depuis site avec le CLI local avant build.
Migrations : migrate deploy depuis ce même dossier, après sauvegarde chiffrée ; jamais reset/db push.
Contrôles avant build : typecheck, test, lint.
Hooks : beforeBuild → node deployment/preflight.mjs --config-only (cwd .); afterStart → node deployment/preflight.mjs (cwd .).

Supervision : PM2 fork / une instance / arrêt gracieux 120s,
service seo-pm2 avec chemin Node explicite et PM2_HOME privé. Ecosystem :
deployment/ecosystem.config.cjs.
Processus attendus : 404seo-site, 404seo-api, 404seo-worker, 404seo-scheduler, 404seo-cms-worker.
Un ecosystem existant est chargé et validé sous le compte projet ; ses binds/ports/scripts
doivent correspondre au formulaire. dump.pm2 contient des secrets : mode 600, ne jamais le publier..
Processus déclarés : 404seo-api (apps/api/src/index.ts, cwd ., port 4000); 404seo-worker (workers/crawl-worker.ts, cwd ., port 0); 404seo-scheduler (workers/schedule-worker.ts, cwd ., port 0); 404seo-cms-worker (workers/cms-worker.ts, cwd ., port 0).
Les scripts des processus supplémentaires sont relatifs au dépôt, même si cwd diffère.
TypeScript requiert tsx installé localement à la racine.

Redis : instance dédiée seo-redis, port 16379–17379 automatique,
AOF everysec, noeviction, limite 512 Mio, secret propre et données shared/redis.

## Nginx, HTTPS et navigateurs

Nginx natif, aucun template de panel : proxy du serveur Next.js.
- exact /health/ready → 127.0.0.1:4000
- prefix-priority /api/auth/ → 127.0.0.1:3030
- prefix /api/ → 127.0.0.1:4000
- regex ^/api/audits/[^/]+/progress$ → 127.0.0.1:4000 ; SSE sans buffering/cache/gzip, délai 3600s
Une route prefix-priority (^~) ne doit pas masquer une route SSE regex.
Les routes d'authentification spécifiques précèdent les autres routes API.
Nginx -t avant activation, aucun port applicatif ouvert dans le firewall.
Certbot webroot ; chaque A/AAAA doit pointer vers une interface du VPS. CDN/NAT nécessite une adaptation. Renouvellement via certbot.timer.




Navigateurs : Playwright activé (Chromium), Puppeteer activé (Chrome/PDF).
Caches sous ~/.cache du compte applicatif ; chemins dans .env.production.
Installation et smoke checks sous ce compte, sandbox activé, aucun --no-sandbox.
Si le test échoue, inspecter bibliothèques (ldd), caches/permissions et user namespaces/AppArmor
avant d'assouplir la configuration. Ne jamais valider les navigateurs uniquement sous root.
Pour la génération PDF et les audits réels, tester aussi via l'application après déploiement.

## Sauvegardes, logs et surveillance

Sauvegarde PostgreSQL + .env.production : AES-256-GCM, avant migrations et chaque jour
à 02:15 (timer seo-backup). Commande du projet : node deployment/backup.mjs create.
BACKUP_DIR privé, hors du dépôt. Format SEO404B1 (magic, IV12, chiffré, tag16), manifeste
version1 avec createdAt et fichiers database.dump.enc / configuration.env.enc (bytes/sha256).
Seules les archives complètes dont les hashes sont confirmés peuvent être copiées/purgées.
Rétention locale 14 jours ; la plus récente est conservée.
**Copie extérieure non configurée** : renseigner une destination rsync. Les sauvegardes locales seules ne couvrent pas la perte du VPS.
Conserver BACKUP_ENCRYPTION_KEY dans un coffre extérieur indépendant. La sauvegarde du
fichier env est elle-même chiffrée : elle ne suffit pas à récupérer la clé perdue.
Tester régulièrement le déchiffrement et une restauration sur une base jetable isolée,
jamais sur la production. Le projet SEO fournit deployment/backup.mjs restore-drill
avec une cible vide seo_restore_*. Voir son README avant de lancer une restauration.
La sauvegarde ne couvre pas les uploads/données externes à PostgreSQL/env ni un instantané
exact des files Redis. Ajouter leur sauvegarde selon le code et les chemins du projet.
Rotation quotidienne logrotate : 14 rotations, compression, journal de déploiement
et logs applicatifs. Nginx/journald gardent leur politique du bootstrap.
Readiness : http://127.0.0.1:4000/health/ready, après démarrage puis toutes les cinq minutes.
La surveillance contrôle aussi les noms PM2 et leur état online.
Contrôle complémentaire : node deployment/monitor.mjs --quiet.
Les échecs sont visibles dans journald/systemctl ; aucune notification extérieure n'est
configurée. Brancher la supervision serveur sur ces erreurs et tester les alertes.

## Vérification sur le VPS (lecture et smoke checks, sans installation)

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo systemctl status seo-security-audit.timer --no-pager
sudo systemctl status seo-pm2 --no-pager
sudo systemctl status seo-redis --no-pager
sudo systemctl status seo-backup.timer --no-pager
sudo systemctl status seo-monitor.timer --no-pager
sudo ss -lntp
sudo logrotate --debug /etc/logrotate.d/vps-project-seo
curl -I https://seo.404notfood.fr
curl --fail --show-error http://127.0.0.1:4000/health/ready
sudo systemctl is-active --quiet seo-pm2 && sudo -u seo -H env PM2_HOME=/home/seo/.pm2 /opt/nvm/node-24/node /home/seo/.local/lib/node_modules/pm2/bin/pm2 list
sudo -u seo -H /bin/bash -c 'cd "/home/seo/app/site"; cli=node_modules/prisma/build/index.js; test -f "$cli" || cli=/home/seo/app/node_modules/prisma/build/index.js; exec /opt/nvm/node-24/node --env-file=/home/seo/app/.env.production "$cli" migrate status'
sudo -u seo -H env PATH=/home/seo/.local/bin:/opt/nvm/node-24:/usr/bin:/bin PM2_HOME=/home/seo/.pm2 /opt/nvm/node-24/node --env-file=/home/seo/app/.env.production /etc/vps-projects/seo/operations.mjs monitor
sudo systemctl list-timers --all --no-pager
sudo journalctl -u seo-monitor.service -n 50 --no-pager
```

Vérification des navigateurs sous le compte applicatif (aucun téléchargement) :

```bash
sysctl kernel.unprivileged_userns_clone kernel.apparmor_restrict_unprivileged_userns 2>/dev/null
sudo -u seo -H /bin/bash <<'APP_CHECK'
cd /home/seo/app
export PATH=/opt/nvm/node-24:/usr/bin:/bin
node --env-file=/home/seo/app/.env.production --input-type=module <<'BROWSER_CHECK'
const { chromium } = await import('playwright');
const crawl = await chromium.launch({ headless: true, chromiumSandbox: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--disable-dev-shm-usage'] });
await crawl.close(); console.log('Playwright sandbox OK');
const { default: puppeteer } = await import('puppeteer');
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ['--disable-dev-shm-usage'] });
try { const page = await browser.newPage(); await page.setContent('<h1>PDF</h1>'); const bytes = Buffer.from(await page.pdf()); if(bytes.subarray(0,5).toString() !== '%PDF-') throw new Error('PDF invalide'); console.log('Puppeteer PDF OK'); } finally { await browser.close(); }
BROWSER_CHECK
APP_CHECK
```

Lire les erreurs de lancement/ldd et vérifier le propriétaire des caches si un test échoue.
Ne pas contourner le sandbox par --no-sandbox.

Adapter le chemin CLI Prisma si ses dépendances ne sont pas hoistées. Ne pas afficher
pm2 jlist, dump.pm2, env ou les fichiers de mots de passe dans des sorties partagées.
Vérifier auth/session, autres API, progression SSE en direct, audit avec rendu JavaScript,
PDF et workers/scheduler. Les smoke checks du script ne prouvent pas ces parcours métier.
Pour le SaaS SEO actuel, utiliser seo.404notfood.fr : des contrôles du code imposent cette
origine ; le preset ne remplace pas ces exigences ni les clés Stripe/Resend/Google/IA.

## Réexécution et limites

L'hébergement et la base sont préparés avant les sources et le build. --provision permet
de valider cette préparation séparément ; une relance sans option poursuit le déploiement.
Un échec de build conserve les phases validées. Sur un nouveau projet, la racine répond
503 tant que le projet n'est pas déployé ; les routes proxy attendent leurs backends (502 possible).
Une relance conserve le vhost d'un déploiement existant pendant ces préparatifs.
Un échec ultérieur restaure les configurations au dernier état validé ; les sauvegardes sont séparées par phase.
Le journal contient « Étape » et « Étape terminée », puis la dernière étape du rollback ;
/var/lib/vps-projects/seo/last-stage est conservé après échec. Vhost attendu :
/etc/nginx/sites-enabled/seo.conf (nom du projet, pas nom du domaine).

Les configurations inconnues/modifiées sont refusées par registre/hash root. .env.production
et ses secrets existants sont préservés ; sauvegarde privée avant ajout. L'identité lie
stack/runtime/layout/DB/env/supervision : changement structurel = migration manuelle.
Une erreur restaure les configurations gérées et tente de restaurer les services ; elle
n'annule pas comptes, installation PM2/libs, sources/builds, certificats ou migrations.
La rétention ne supprime que des archives valides identifiées dans BACKUP_DIR ; aucun reset DB.
Builds dans app : prévoir une fenêtre de maintenance pour les mises à jour.
Accès SSH/SFTP : configuration limitée à ce compte dans sshd_config.d, validation de la politique effective avant rechargement. Tester une connexion SFTP avec ce compte ; les règles administrateur restent conservées.
Tester le déploiement et sa relance sur Debian 13 avant la production. Le générateur ne
contacte jamais le VPS ; les contrôles locaux ne certifient ni les paquets Linux ni le sandbox.

## Sécurité et maintenance

Clés SSH obligatoires. Les mots de passe SSH sont refusés. Les clés autorisées sont
administrées par root dans /etc/vps-projects/seo/authorized_keys.
Le shell de connexion passe par un lanceur root en mode Bash privilégié (ignore
BASH_ENV), puis bubblewrap : autres homes masqués, système en lecture seule,
processus et /tmp séparés. User namespaces indispensables ; aucun repli libre.
Le réseau local et le noyau restent partagés. Ce confinement de session ne transforme
pas les applications PHP/Node en VM : une application compromise conserve ses droits
Linux. Les permissions de fichiers, SQL et les instances Redis dédiées restent essentiels.
Le shell masque le socket PM2 du service : administrer les processus depuis le compte
administrateur avec sudo -u seo, pas en réutilisant le daemon hôte depuis le shell.
Les commandes nécessitant des namespaces imbriqués peuvent être refusées dans ce shell.

Un audit Composer/npm/pnpm/Yarn des dépendances de production précède les migrations
et l'activation. Les vulnérabilités npm/pnpm/Yarn élevées/critiques bloquent, Composer
bloque ses avis de sécurité. Une panne du service d'audit bloque également.
Un timer quotidien relance l'audit ; consulter :
    sudo systemctl status seo-security-audit.timer
    sudo journalctl -u seo-security-audit.service
Audit manuel : sudo -u seo /etc/vps-projects/seo/dependency-audit.sh
Les rapports n'envoient pas d'alerte externe. Corriger les versions dans le dépôt,
tester, puis redéployer ; aucun audit fix ou mise à jour automatique des applications.
WordPress/PrestaShop et leurs extensions doivent aussi être maintenus depuis leurs
outils officiels ; un audit npm/Composer ne couvre pas tous les CMS ni le code métier.
Les mises à jour Debian-Security ne couvrent pas tous les dépôts tiers ou les runtimes
installés hors APT. Mettre régulièrement à jour le socle et contrôler les redémarrages.

## Instructions pour Codex

Comparer ce manifest aux sources actuelles : package.json/lockfile, Next config, ecosystem,
Prisma/schema/migrations, scripts deployment/, workers et configuration PHP/Laravel.
Respecter les chemins/env/ports et les besoins du code actuel. Tester Bash/ShellCheck,
Nginx et le déploiement sur Debian 13. Le manifest est une intention, jamais une preuve
d'installation. Garder secrets et commandes applicatives hors de root ; aucun panel requis.
