# Corrections SEO par IA et connexion CMS

## État et objectif

Pilotes livrés : une page « Connexions CMS » par projet client, un connecteur WordPress/WooCommerce et un module PrestaShop. Les boutons « Améliorer mon SEO » et « Corriger les fautes des champs SEO » génèrent des propositions, puis une validation explicite déclenche leur publication et leur relecture. Shopify, Magento et SFTP restent des extensions futures, indiquées comme telles dans l’interface.

Les audits, le plan d’action, les preuves et les contrôles après recrawl existent déjà. Le chat Agent IA reste une démonstration indépendante. Le nouveau droit featureCmsCorrections est distinct de featureAI ; les droits existants n’activent pas automatiquement la publication.

## Pilote WordPress livré

- Page /cms-connections accessible depuis la navigation et le plan SEO ; choix du projet, installation de l’extension ZIP, mot de passe d’application et vérification avant sauvegarde.
- Connexion HTTPS correspondant au domaine et au périmètre du projet ; DNS public épinglé au socket, TLS vérifié, aucune redirection authentifiée suivie. Identifiants AES-256-GCM avec contexte tenant/projet/connexion/adresse CMS ; aucune clé CMS dans les réponses ou les prompts IA.
- Pages, articles et produits WooCommerce publiés : lecture par pages de 25 et préparation d’une proposition sur une ressource à la fois. Pas de traitement global du catalogue dans ce pilote.
- IA serveur OpenAI Responses avec sortie structurée, refus et réponses incomplètes rejetés. La clé du fournisseur est configurée par l’exploitant ; la saisie d’une clé IA propre au client n’est pas encore livrée.
- Aperçu avant/après, publication des valeurs enregistrées uniquement, sauvegarde des valeurs précédentes, relecture et annulation conditionnée à la version courante.
- WordPress conserve des valeurs spécifiques au connecteur : elles remplacent le rendu du titre SEO et de la description via les filtres documentés de Yoast ou Rank Math, ou les hooks natifs. Elles ne remplacent pas le titre visible, le corps du contenu ni les réglages originaux de ces extensions.
- Une ancienne valeur null signifie « reprendre les réglages habituels du CMS ». L’annulation supprime alors la valeur du connecteur. Les valeurs publiées sont visibles dans un encart de l’éditeur WordPress, avec une option de retour aux réglages habituels. La désactivation du connecteur suspend ses remplacements ; sa réactivation les remet en service tant qu’ils existent.
- Vérification de version sous transaction InnoDB avec verrouillage des lignes WordPress et des métadonnées. Une opération distante incertaine bloque les publications suivantes. Sa réconciliation confirme l’opération déjà réalisée ou enregistre une annulation durable qui interdit une requête retardée. Chaque nouvelle validation reçoit un identifiant de tentative distinct.
- Historique des 50 dernières propositions par projet ; les sauvegardes restent en base. Déconnecter efface les identifiants et conserve les corrections dans WordPress. Les annulations liées à l’ancienne connexion ne sont plus disponibles depuis la plateforme après déconnexion.
- « Actualiser les accès WordPress » vérifie et remplace les identifiants du même site sans perdre ses sauvegardes, y compris lorsqu’une opération attend une confirmation. Cela permet la réconciliation après révocation d’un ancien mot de passe d’application.
- « Publié dans le CMS » ne valide pas le rendu public : purger le cache du site si nécessaire, puis relancer un audit depuis le plan d’action.

Version cible du pilote : WordPress 7.1.x. La [version 7.1](https://wordpress.org/documentation/wordpress-version/version-7-1/) est publiée ; la [7.1.1](https://wordpress.org/documentation/wordpress-version/version-7-1-1/) apporte des corrections de sécurité et de maintenance. Utiliser une version corrigée de cette branche pour la boutique de test. Le champ « Requires at least: 5.6 » de l’extension indique le minimum historique pour les mots de passe d’application ; il ne désigne ni la version actuelle ni une compatibilité testée avec toutes les versions intermédiaires.

Conditions techniques : PHP 7.4+ pour le code de l’extension, HTTPS correctement configuré, REST /wp-json accessible sur l’adresse connectée, tables posts/postmeta InnoDB. Le CMS et les autres extensions peuvent imposer une version PHP plus récente. Les hooks fournis ciblent le rendu WordPress natif, Yoast et Rank Math ; les autres moteurs SEO, installations headless, multisite et thèmes personnalisés nécessitent une validation spécifique. Aucune compatibilité sur une boutique WordPress 7.1 réelle n’a encore été testée ; aucun marquage « Tested up to: 7.1 » n’est déclaré.

Le [guide développeur WordPress 7.1](https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/) signale notamment la généralisation de l’éditeur dans une iframe, même avec des métaboxes historiques. Le connecteur fournit son encart en PHP sans JavaScript traversant les documents de l’éditeur. L’affichage de cet encart et son retour aux réglages habituels devront être vérifiés dans l’éditeur de blocs 7.1, ainsi que dans l’éditeur de produits WooCommerce utilisé par la boutique.

Authentification : [mots de passe d’application WordPress](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/). Rendu SEO : [titre Yoast](https://developer.yoast.com/features/seo-tags/titles/api/), [description Yoast](https://developer.yoast.com/features/seo-tags/descriptions/api/), [filtres Rank Math](https://rankmath.com/kb/filters-hooks-api-developer/) et [titre natif WordPress](https://developer.wordpress.org/reference/hooks/pre_get_document_title/).

### Activation dans Laragon ou HestiaCP

1. Appliquer les migrations avec la procédure habituelle et régénérer Prisma. Les nouvelles migrations ont uniquement été appliquées sur la base locale de test isolée.
2. Configurer CMS_CREDENTIAL_KEY (64 caractères hexadécimaux, générés avec openssl rand -hex 32), OPENAI_API_KEY et OPENAI_SEO_MODEL côté serveur. Sauvegarder la clé de chiffrement séparément et ne pas la remplacer sans procédure de migration des connexions.
3. Dans Administration → Plans, activer l’IA et « Corrections CMS » pour les plans choisis, puis fixer cmsMonthlyQuota. Les valeurs par défaut sont false et 0 ; aucun tarif ou volume commercial n’a été imposé.
4. Le quota compte les tentatives de génération lancées pendant le mois UTC, y compris les échecs ou interruptions, avec réservation en transaction et verrou par tenant. Publications et annulations ne consomment pas une nouvelle proposition. Les appels sont bornés en entrée, sortie et durée ; ce quota n’est pas un budget monétaire du fournisseur.
5. npm run build empaquette l’extension WordPress dans site/public/downloads/seo404-connector.zip et le module PrestaShop dans site/public/downloads/seo404-prestashop.zip. En développement, npm run build:wordpress-connector et npm run build:prestashop-connector régénèrent ces fichiers. Installer le ZIP adapté dans une copie de la boutique et y valider le rendu avant toute mise en production.
6. Le pilote utilise des requêtes synchrones bornées ; les traitements de catalogue, règles sans validation individuelle et jobs BullMQ de correction ne sont pas encore implémentés.

## Pilote PrestaShop livré

Cibles : PrestaShop 8.x et 9.x, PHP 7.4+ pour le module (les exigences du CMS restent applicables), HTTPS et tables product/product_shop/product_lang ainsi que les tables du connecteur en InnoDB. La compatibilité avec une installation complète PrestaShop réelle reste à valider ; les tests MySQL utilisent le véritable moteur SQL avec des doubles limités pour les classes du CMS.

1. Choisir PrestaShop dans « Connexions CMS » et télécharger son ZIP.
2. Installer le module dans le gestionnaire de modules du back-office. En multiboutique, sélectionner une seule boutique dans le contexte du back-office ; la configuration du module propose ses langues actives.
3. Générer la clé du module pour cette boutique et la langue choisie. Copier immédiatement la clé affichée une fois et l’adresse HTTPS du module dans la plateforme. Le module conserve seulement l’empreinte SHA-256 de la clé ; la plateforme la chiffre avec le contexte tenant/projet/connexion/adresse/périmètre. Cette clé est distincte d’une clé du webservice standard et ne donne aucun accès aux clients, commandes, prix ou fichiers.
4. Le module vérifie la boutique courante et la langue, puis expose les produits actifs et visibles par pages de 25. Le périmètre boutique:langue est vérifié à chaque lecture et publication, et enregistré dans la connexion.
5. Préparer, comparer puis approuver une proposition. Les valeurs sont écrites directement dans meta_title et meta_description d’une seule ligne product_lang sous transaction avec verrouillage des lignes natives. Les autres langues, boutiques, descriptions HTML, noms, prix et URL ne sont pas remplacés. Les hooks des extensions externes de mise à jour produit ne sont pas déclenchés ; leur comportement et leurs caches nécessitent une validation propre à la boutique.
6. La sauvegarde conserve les champs natifs entiers : jusqu’à 255 caractères pour le titre et 512 pour la description. Les nouvelles propositions restent limitées à 100/320 ; l’annulation peut restaurer les valeurs initiales plus longues. Les champs contenant du HTML, des contrôles ou les caractères interdits par PrestaShop sont exclus de ce pilote.
7. Une réconciliation annule durablement une tentative non exécutée. Les marqueurs sont conservés dans une table du module, y compris après désinstallation. La désinstallation révoque la clé ; les champs natifs publiés restent en place. Ne pas supprimer manuellement les tables du connecteur tant que des requêtes ou sauvegardes peuvent en dépendre.
8. Une nouvelle clé pour le même périmètre permet « Actualiser les accès PrestaShop » sans perdre les sauvegardes. Un changement de boutique ou langue crée une nouvelle connexion et désactive l’ancienne ; une opération incertaine doit être résolue avant ce changement. Une seule boutique/langue est autorisée à la fois par cette première version du module.

Les catégories, pages CMS, autres langues simultanées et traitements globaux du catalogue restent à ajouter. Une route produit personnalisée utilisant meta_title est refusée afin qu’une correction SEO ne change pas l’URL du produit. Purger le cache de la boutique si nécessaire, puis recrawler pour vérifier les balises publiques.

Sources : [champs produits multilingues](https://devdocs.prestashop-project.org/9/webservice/resources/products/), [contrôleurs de module](https://devdocs.prestashop-project.org/9/modules/concepts/controllers/front-controllers/), [accès à la base](https://devdocs.prestashop-project.org/9/development/components/database/db/) et [paramètres des liens produits](https://github.com/PrestaShop/PrestaShop/blob/9.0.0/classes/Link.php). Le webservice documente les mises à jour partielles ; ce pilote utilise son propre module afin de réaliser le contrôle de révision et l’écriture atomiquement.

## Parcours cible pour les prochaines extensions

1. Connecter une boutique, choisir le périmètre : boutique, langue et pages.
2. Cliquer sur « Améliorer mon SEO » : rapprocher le dernier audit du contenu courant du CMS et identifier les champs réellement modifiables.
3. Générer des propositions avec l’IA : afficher l’ancien texte, le nouveau, la raison et les pages concernées. Signaler les problèmes qui nécessitent une intervention technique.
4. Sélectionner les propositions à appliquer. Montrer le nombre de changements et les crédits concernés avant validation.
5. Sauvegarder les valeurs précédentes, appliquer via le connecteur et relire les champs du CMS. Afficher les succès, conflits et échecs séparément.
6. Permettre d’annuler les changements compatibles, puis relancer un audit. « Appliqué dans le CMS » et « vérifié par audit » restent deux états distincts.

« Corriger les fautes » traite un périmètre de textes sélectionnés. Il doit conserver les noms propres, références produits, informations commerciales et mise en forme ; une reformulation SEO est une opération différente. Le contenu du catalogue sert de référence pour éviter d’inventer des caractéristiques, prix, offres ou certifications.

## Premier périmètre

Commencer par les titres SEO et méta-descriptions des produits, avec boutique et langue explicites. Ajouter ensuite catégories et pages éditoriales selon les capacités du connecteur. Les textes alternatifs d’images et descriptions nécessitent leurs propres règles de correspondance et de conservation du HTML.

Les changements d’URL, redirections, canoniques, robots, scripts, fichiers serveur et thèmes sont hors du premier périmètre. Ils ne sont pas tous corrigeables par un champ CMS, et doivent disposer d’un parcours et d’une validation propres. Un bouton ne garantit ni suppression de tous les problèmes ni amélioration du classement Google.

## Connecteurs

| Plateforme | Connexion et champs documentés | Points à traiter dans le connecteur |
| --- | --- | --- |
| PrestaShop | Pilote module dédié livré pour les produits, une boutique/langue choisie ; champs natifs meta_title et meta_description. | Valider sur PrestaShop complet, puis étendre catégories/pages CMS, langues/boutiques simultanées et compatibilité des extensions de cache. |
| Shopify | Application autorisée par le marchand et API Admin GraphQL. ProductUpdateInput expose seo ; productUpdate demande write_products. | Associer la boutique technique au domaine du projet, limiter les scopes, fixer une version API et gérer les erreurs/throttling. Les champs produits et champs SEO restent distincts. |
| Magento / Adobe Commerce | API REST et intégration avec droits ; le catalogue expose des attributs SEO. | Identifier édition/version, méthode d’authentification, portée store view et extensions. Adobe Commerce SaaS et Magento Open Source/PaaS n’utilisent pas tous les mêmes endpoints. |
| Site sur mesure | Connecteur à définir pour le format et l’hébergement. | SFTP authentifié avec clé hôte vérifiée, racine de fichiers autorisée, aperçu des modifications et sauvegarde. Le FTP en clair et l’exécution de commandes arbitraires ne font pas partie du premier connecteur. |

Sources officielles : [ressource produits PrestaShop](https://devdocs.prestashop-project.org/9/webservice/resources/products/), [droits du webservice](https://devdocs.prestashop-project.org/9/webservice/tutorials/creating-access/), [mises à jour partielles PrestaShop 8](https://devdocs.prestashop-project.org/8/webservice/getting-started/), [champs Shopify](https://shopify.dev/docs/api/admin-graphql/latest/input-objects/ProductUpdateInput), [mutation produit Shopify](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productUpdate), [REST Adobe Commerce](https://developer.adobe.com/commerce/webapi/rest/) et [module catalogue](https://developer.adobe.com/commerce/webapi/rest/modules/catalog/). Cette matrice établit une faisabilité ; elle n’est pas une déclaration de compatibilité testée.

## Abonnements et coûts

Proposition à chiffrer avant commercialisation :

- Starter : audits et recommandations ; les droits IA actuels restent régis par la configuration réelle du plan.
- Pro : propositions IA et application de changements approuvés, avec limite mensuelle de pages et budget IA.
- Agency : plusieurs boutiques, traitements par lots et règles d’automatisation autorisées par le client.

Ajouter des droits indépendants pour génération IA, écriture CMS et traitement automatique. Réutiliser les rôles et contrôles de propriétaire/tenant ; recontrôler les droits lors de l’exécution, même si le job a été créé avant un changement de plan.

Les crédits de génération, tokens consommés, ressources modifiées et audits lancés doivent être comptés séparément. Réserver le budget en transaction avant la mise en queue pour empêcher des lancements concurrents hors quota. Les limites et coûts ne sont pas fixés dans ce document.

Deux modèles sont possibles : IA payée par la plateforme et comprise dans les crédits, ou clé API fournie par le client. Le second ne supprime pas le coût des appels chez son fournisseur. Les secrets sont chiffrés au repos, masqués dans l’interface et absents des logs et prompts.

## Architecture dans la stack actuelle

Next.js affiche connexion, aperçu, historique et annulation. Fastify vérifie le propriétaire, les permissions, quotas et champs autorisés. Prisma/PostgreSQL conservent les connexions, propositions et sauvegardes avec tenantId obligatoire et clés étrangères composites. Les futures opérations par lots utiliseront BullMQ/Redis sous PM2 en mode fork, avec reprise et arrêt gracieux.

Le fournisseur IA reçoit des textes bornés et les contraintes de génération ; il ne reçoit ni clé CMS ni accès direct aux fichiers. Les résultats structurés sont revalidés côté serveur : identifiant de ressource, champ autorisé, langue, taille et texte. Une sortie conforme au schéma ne prouve pas la justesse du contenu. Les instructions présentes dans les pages restent des données non fiables. Pour OpenAI, voir [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Le transport public dispose maintenant d’un mode authentifié HTTPS pour GET/POST, avec en-têtes autorisés, corps borné et refus de toute redirection. Les autres connecteurs devront conserver ces garanties et associer leurs endpoints techniques à une boutique vérifiée.

Chaque proposition conserve le contenu lu, son empreinte/révision, l’auteur, la boutique/langue et les données avant/après. Relire avant écriture et bloquer un contenu devenu différent. Un verrou local évite deux opérations de la plateforme sur la même ressource, mais ne verrouille pas un éditeur externe : utiliser une condition de version native ou un module CMS si une garantie atomique est nécessaire.

Après un délai réseau ou une réponse ambiguë, relire avant toute reprise pour éviter une double application. Un retour arrière restaure uniquement les champs que l’opération avait changés et refuse d’écraser un changement ultérieur. Il ne restaure pas arbitrairement toute une fiche produit.

## Livraison et validation

1. Valider les pilotes sur des copies de boutiques WordPress 7.1.x corrigée et PrestaShop 8/9 ; relever les versions PHP, WooCommerce et des extensions SEO/cache, ainsi que le thème et l’éditeur employés.
2. Livrer connexion et lecture des champs SEO, sans écriture.
3. Livrer génération IA réelle, quotas et aperçu ; tester aussi refus, réponses incomplètes et échec du fournisseur.
4. Livrer application approuvée, relecture et annulation sur un petit lot.
5. Valider sur la boutique de test : isolation tenant/propriétaire, langues/boutiques, changements concurrents, reprises, révocation de clé, absence de modification des autres champs et recrawl.
6. Ajouter le mode automatique uniquement pour les opérations expressément autorisées, puis étendre aux autres CMS.

WordPress/WooCommerce et PrestaShop disposent de pilotes. Aucun accès à une boutique réelle n’a été fourni ni utilisé. Les tests ajoutés couvrent chiffrement, transport, IA simulée, isolation, quotas concurrents, états de publication, reprise après délai, annulation et requête retardée pour les deux connecteurs. Le test PHP WordPress simule son stockage. Le test PrestaShop utilise MySQL 8.4.3/InnoDB réel et des doubles pour les classes du CMS ; il vérifie les verrous avec une seconde connexion SQL, la conservation des autres langues/boutiques et du HTML produit, la restauration des champs longs, le rollback, la révocation, les droits de configuration et les protections CSRF. Cela ne remplace pas une validation avec les CMS complets, leurs thèmes et leurs extensions.

Validation locale du 2 octobre 2026 : 57 tests réussis, sans test ignoré, avec TEST_DATABASE_URL pointant vers la base isolée seo_security_audit sur 127.0.0.1:55432, PHP_BINARY et PHP_EXTENSION_DIR configurés, et TEST_CMS_MYSQL_DSN=mysql:host=127.0.0.1;port=55433;dbname=seo_cms_test;charset=utf8mb4. TypeScript, lint et build des neuf workspaces réussis ; schéma Prisma et base de test sans différence après les 26 migrations. Archives ZIP comparées aux sources PHP. Parcours desktop/mobile des deux connecteurs testés sur le build Next de production avec Fastify, BetterAuth et PostgreSQL réels ; les réponses des CMS et l’IA sont simulées dans le navigateur. La récupération des ZIP est vérifiée, ainsi que le changement de client sans conservation du secret, la rotation des accès, l’absence d’écriture pendant la génération, la validation, la publication, l’annulation et la persistance après rechargement. Aucune erreur React ni débordement mobile détecté. Les serveurs de base de données utilisés pour ces tests sont isolés et arrêtés après validation.
