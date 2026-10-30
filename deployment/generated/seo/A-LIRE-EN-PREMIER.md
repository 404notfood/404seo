# Fichiers prêts à transférer — 404 SEO

Configuration du 25 octobre 2026 pour le VPS **Debian 13 préparé avec le bootstrap du générateur**, conformément à votre confirmation. Ce bundle ne cible pas HestiaCP.

## Installation

1. Décompresser `seo-deploiement.zip` sur votre PC.
2. Transférer les fichiers dans un dossier du compte administrateur du VPS, par exemple `/root/seo-deploiement/` si vous utilisez root. Ne pas les placer dans le dossier public d'un site.
3. Depuis la session SSH administrateur, ouvrir ce dossier puis exécuter :

```bash
sudo bash ./install.sh --preflight
sudo bash ./install.sh
```

Lancer la deuxième commande uniquement si la première réussit. Le script récupère automatiquement `https://github.com/404notfood/404seo.git`, branche `main`, dans `/home/seo/app`. Aucun transfert manuel des sources n'est nécessaire.

Ne pas copier manuellement `nginx.conf.template` dans Nginx : `install.sh` crée et valide les configurations, prépare le certificat puis active le site. Le script doit être lancé depuis un compte administrateur ; les commandes applicatives tournent sous le compte `seo`.

## Paramètres renseignés

| Paramètre | Valeur |
| --- | --- |
| Domaine | `seo.404notfood.fr` |
| Certificat | Let's Encrypt, `contact@404notfood.fr` |
| Compte et dossier | `seo`, `/home/seo/app` |
| Sources | GitHub `404notfood/404seo`, `main` |
| Node et paquets | Node 24, npm |
| Frontend | `site/`, Next.js standalone, `127.0.0.1:3030` |
| API | Fastify, `127.0.0.1:4000` |
| Base | PostgreSQL, base et rôle dédiés `seo` |
| Prisma | Génération du client et migrations de production depuis `site/`, après sauvegarde |
| Redis | Instance dédiée locale, mot de passe généré sur le VPS, AOF, 512 Mio, `noeviction` |
| PM2 | 5 processus du dépôt, mode fork, une instance, délai d'arrêt de 120 secondes |
| Navigateurs | Chromium Playwright et Chrome Puppeteer, sandbox activé |
| SSH/SFTP | Clé publique fournie, shell cloisonné, sans sudo |
| Sauvegardes | `/home/seo/backups/postgresql`, chiffrées, quotidiennes, rétention de 14 jours |
| Surveillance | Readiness et contrôle du projet toutes les cinq minutes |

Le résumé du formulaire affiche « Migrations désactivées » pour **Laravel** uniquement. Les migrations **Prisma sont activées** dans ce bundle.

Le DNS A et les éventuels AAAA de `seo.404notfood.fr` doivent pointer directement vers le VPS. Les ports 3030 et 4000 doivent être disponibles localement. L'installateur exige le socle du générateur, notamment Node 24 dans `/opt/nvm/node-24`, PostgreSQL, Redis, Nginx et Certbot.

## Secrets et services externes

Le script initialise `.env.production` depuis `deployment/.env.example`. Les identifiants PostgreSQL/Redis et les secrets BetterAuth, CMS et de sauvegarde sont générés **sur le VPS**. Aucun secret privé n'est inclus ici.

Les clés de vos comptes Stripe, Resend, Google, IA et DataForSEO doivent être renseignées dans `/home/seo/app/.env.production` pour activer les fonctions correspondantes. Le bundle ne peut pas créer ces comptes ni deviner leurs identifiants. Les valeurs d'exemple des intégrations restent à remplacer avant leur activation et la commercialisation.

Conserver une copie privée de la clé de chiffrement des sauvegardes hors du VPS. La destination de sauvegarde distante reste à configurer ; les archives locales seules ne couvrent pas la perte du serveur.

## Vérification après installation

```bash
sudo nginx -t
sudo systemctl status seo-pm2 seo-redis --no-pager
curl --fail --show-error http://127.0.0.1:4000/health/ready
curl -I https://seo.404notfood.fr
```

Tester ensuite connexion, création d'un projet, audit réel, progression et rapport PDF. La clé privée correspondant à la clé publique renseignée doit rester sur votre PC pour la connexion SSH/SFTP.

## Contenu du bundle et contrôles réalisés

- `install.sh` : installateur autonome du générateur.
- `nginx.conf.template` : configuration Nginx à consulter ; installation gérée par le script.
- `manifest.json` : description des réglages et des services.
- `README.md` : documentation complète produite par le générateur.
- `seo-config.json` : configuration réimportable avec le bouton « Importer » du formulaire.
- `SHA256SUMS` : empreintes des fichiers livrés.

Contrôles locaux réussis : validation statique du générateur, syntaxe Bash (`bash -n`), lecture des deux JSON, cohérence des chemins/ports/processus et syntaxe des quatre blocs JavaScript intégrés. Aucun installateur ni commande de déploiement n'a été exécuté sur le VPS. Aucun test Nginx ou de démarrage Linux n'a été effectué depuis ce PC.

Correction du 25 octobre 2026 : ce bundle a été régénéré depuis les sources actuelles du générateur local `D:/Logiciel/laragon/www/generateurvps`. `PermitUserEnvironment no` est absent du bloc `Match User`, où OpenSSH Debian 13 l'interdit. Le script exige toujours que sa valeur effective soit `no`, avant modification et avant rechargement de SSH. La politique globale et celle de root restent comparées avant/après. Les autres directives du bloc ont été comparées à la liste officielle Debian des directives autorisées dans `Match`.

Le paquet public corrigé est `D:/Logiciel/laragon/www/generateurvps/dist/generateur.zip`. Le republier pour que le site en ligne utilise aussi les sources actuelles. `seo-config.json` conserve les réglages du formulaire, mais une régénération depuis un site non actualisé peut réintroduire ce défaut.

Pour reprendre l'installation déjà commencée : remplacer `/tmp/seo/install.sh` par celui de ce bundle, puis, depuis `/tmp/seo`, lancer `sudo bash ./install.sh`. Les ressources déjà créées restent gérées par l'installateur. Utiliser le script de projet situé dans `dist/seo/`, pas le fichier `dist/install.sh` qui installe le socle du serveur.

Les 58 tests ciblés du générateur (génération, SFTP et restauration du shell après échec) passent, dont le contrôle des directives autorisées dans Match et le refus d'un PermitUserEnvironment global actif. Les fichiers de ce dossier sont des artefacts locaux : ils n'ont pas été commités ni poussés sur GitHub. La syntaxe réelle de la configuration SSH doit encore être validée sur le VPS ; le script lance `sshd -t` avant tout rechargement.
