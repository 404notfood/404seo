# Conversions et valeur commerciale du trafic naturel

Le module GA4 du **Plan d’action SEO** (`/optimization`) importe les performances des pages d’entrée du projet. Chaque action affiche l’exposition de ses pages et, après déclaration de correction, permet une comparaison sur 7 ou 28 jours. Suggestions utilise les mêmes données pour ses trois actions prioritaires.

## Connexion et import

1. Connecter **Google pour GA4**, avec les droits Analytics, ou utiliser un compte déjà connecté.
2. Saisir l’identifiant numérique de la propriété, disponible dans GA4 → Administration → Détails de la propriété.
3. Cliquer sur **Vérifier GA4**, choisir un flux web couvrant le domaine du projet, puis **Importer GA4**.

Le serveur recontrôle les droits à chaque import et mesure. Le compte doit appartenir au tenant, le projet à l’utilisateur, et l’URI du flux doit couvrir l’origine et le chemin du projet. La vérification du flux utilise Google Analytics Admin API ; les rapports utilisent Google Analytics Data API. Activer ces deux APIs dans le projet Google Cloud utilisé par OAuth. Le scope `analytics.readonly` est déjà inclus dans la connexion Analytics + Search Console ; aucun nouveau secret n’est nécessaire.

L’import couvre 28 jours et s’arrête trois jours avant la date courante du fuseau de la propriété. La limite est de 10 000 lignes, triées par sessions dans le rapport demandé. Le module affiche ensuite les pages reçues par événements clés, puis sessions, avec pagination. Un import manuel n’est pas une synchronisation quotidienne automatique.

## Sens des données

Le rapport filtre le canal de session **Organic Search**, le flux choisi et le nom d’hôte du projet. Les dimensions sont `hostName` et `landingPage` ; les métriques sont `sessions`, `keyEvents` et `purchaseRevenue`. La page d’entrée représente le chemin du premier affichage de la session. Les événements clés correspondent aux événements configurés comme tels dans GA4 ; ils peuvent être fractionnaires et ne représentent pas des clients uniques. Le revenu d’achat tient compte des remboursements et peut être négatif. Ces définitions proviennent du [schéma de Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).

Les données sont regroupées par chemin **hors paramètres et fragment d’URL**. Plusieurs URLs d’audit différant seulement par leurs paramètres correspondent à un seul chemin GA4 et ne multiplient pas les métriques. Le protocole des liens est celui du projet ; le rapport par hôte ne distingue pas les visites HTTP des visites HTTPS sur un même flux. Les sessions multi-domaines peuvent aussi limiter la lecture des conversions si un achat est enregistré sur un autre hôte.

Le canal naturel peut inclure plusieurs moteurs et suit les règles d’attribution de session GA4. Il n’est pas directement comparable aux clics Search Console. Les événements clés et le suivi e-commerce doivent être correctement configurés dans le site et GA4. Consentement, blocage de la mesure et défauts de marquage peuvent limiter les données. Un zéro mesuré ne prouve pas qu’aucun achat réel n’a eu lieu.

La devise est celle de la propriété et est explicitement demandée au rapport. Elle est conservée avec le fuseau et la source ; les devises de propriétés différentes ne sont jamais additionnées. Le revenu ne représente ni un bénéfice, ni une valeur théorique par lead, ni un ROI. Plusieurs actions peuvent couvrir les mêmes chemins : leurs totaux ne doivent pas être additionnés comme des contributions indépendantes.

## Qualité et données absentes

Le module conserve et affiche les indicateurs de limite de lignes, seuils de confidentialité, échantillonnage, regroupement dans « other », troncature et restrictions sur les revenus. Un revenu masqué est `null`, et non zéro. Une réponse incohérente ou une métrique invalide fait échouer l’import ; les résultats précédents restent disponibles. Les indicateurs viennent des [métadonnées de réponse GA4](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData).

Les lignes sans chemin exploitable ou hors périmètre sont exclues et signalées dans les rapports réels. Sans page exploitable, les totaux restent indisponibles. La présence de données ne garantit pas leur exhaustivité. Un import de plus de 35 jours est signalé ; il reste consultable et ne modifie pas automatiquement le classement du plan d’action.

## Après une correction

Marquer l’action **Correction effectuée**, puis utiliser **Mesurer les conversions GA4** lorsque la période est complète. Le jour de déclaration est exclu ; les fenêtres avant et après ont la même longueur et utilisent le fuseau de la propriété, y compris les changements d’heure. Le bouton attend aussi trois jours de délai. Ce délai laisse le traitement des données avancer sans garantir leur caractère définitif.

La comparaison porte seulement sur les chemins de référence observés dans **les deux périodes**. Les chemins absents restent inconnus et leur nombre est affiché. Une base de sessions à zéro n’entraîne pas une croissance infinie. Si les revenus sont masqués dans une période, leur écart reste indisponible.

La mesure conserve en PostgreSQL les performances, les écarts, la couverture, la qualité, la propriété, le flux, le fuseau, la devise, les dates des fenêtres et la date de correction. Relancer la même mesure remplace celle de la même déclaration et longueur de période. Une nouvelle déclaration n’affiche pas l’ancien résultat. Une référence modifiée pendant le calcul invalide l’écriture.

Un changement de devise, de fuseau ou de flux vérifié exige un nouvel import avant de comparer. La configuration historique de GA4 n’est pas reconstituée : un changement de fuseau ne s’applique pas rétroactivement aux données, selon la [définition des propriétés GA4](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties). La saisonnalité, les campagnes et les changements de mesure peuvent intervenir. Une évolution observée ne démontre pas que la correction l’a causée.

## Sécurité, migration et validation

Les endpoints sont rattachés au projet et contrôlent son propriétaire avant les appels externes. Les invités consultent ; les membres et administrateurs importent et mesurent. Les identifiants de propriété et de flux sont numériques, les pages de résultats bornées. Les tokens OAuth restent côté serveur. Les routes héritent du limiteur global ; la vérification de propriété est limitée à vingt demandes par heure, les imports et mesures à trois chacun.

Un verrou PostgreSQL de trois minutes bloque les opérations GA4 concurrentes sur le même projet. L’import et sa rétention sont transactionnels ; douze snapshots sont conservés. Le verrou de correction sérialise la validation et l’enregistrement d’une mesure. Les trois nouvelles tables imposent `tenantId` et des clés étrangères composites. Déconnecter le compte Google supprime ses snapshots, leurs pages et les mesures liées au compte ; les caches concernés sont invalidés.

Migration additive : `site/prisma/migrations/20261002020000_analytics_business_impact/migration.sql`. Générer le client avec `npm run db:generate`, puis appliquer `prisma migrate deploy` depuis `site` lors du déploiement HestiaCP. Pendant le développement, seule la base de test isolée a reçu cette migration ; la base métier est inchangée.

Les 30 tests automatisés couvrent les fonctionnalités précédentes et ajoutent : lecture des rapports GA4, métriques invalides, revenus négatifs ou masqués, devises et fuseaux incohérents, paramètres d’URL regroupés, périodes complètes, données absentes, permissions, contraintes SQL, import concurrent, conservation après échec, changement de correction pendant le calcul, rétention et déconnexion du compte. Les réponses Google sont simulées ; l’accès à une propriété réelle reste à valider avec les identifiants OAuth du déploiement.

La comparaison du schéma Prisma avec la base isolée est vide après les 21 migrations. TypeScript passe sur les neuf workspaces, ESLint et le build de production passent également. Chromium vérifie le choix de propriété/flux, l’import GA4 simulé, les pages d’entrée, les conversions avant/après conservées après rechargement, le choix de période enregistré, l’attente des périodes complètes et les fonctionnalités GSC précédentes. Le parcours est vérifié sur ordinateur et téléphone sans erreur React ; les comparaisons GA4 utilisent des blocs lisibles sur téléphone. Les services de test restent locaux et le site n’est pas publié.
