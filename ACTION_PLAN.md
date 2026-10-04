# Plan d’action SEO et performances Google

Les pages **Optimisation** (`/optimization`) et **Suggestions** (`/suggestions`) utilisent désormais un plan d’action propre au projet. Suggestions présente les trois premières actions actives ; le plan complet conserve aussi les actions écartées et vérifiées.

La sélection du projet se conserve après rechargement et entre onglets, avec un rendu initial compatible avec l’hydratation React. Sur téléphone, la navigation du dashboard s’ouvre dans un menu modal, avec gestion du focus et fermeture par Échap.

## Priorités et preuves

- Uniquement le dernier audit terminé et non supprimé : les anciens audits ne multiplient plus les problèmes actuels.
- Une occurrence par contrôle et par URL ; un échec prime sur un avertissement.
- Classement : `(3 × échecs + avertissements) × gravité ÷ effort × exposition GSC`. Gravité : haute 3, moyenne 2, basse 1 ; effort : faible 1, moyen 2, élevé 3. Exposition : `1 + min(1,5 ; log10(1 + impressions) / 4)`.
- Les impressions concernent uniquement les URLs affectées qui correspondent exactement aux pages GSC, fragments exclus. Les paramètres d’URL sont conservés. Sans correspondance, classement fondé sur l’audit et données de trafic absentes.
- Chaque action affiche l’explication, les mesures, les valeurs attendues et jusqu’à cinq pages de preuve. Les exemples GSC les plus exposés arrivent en premier.
- Il s’agit d’un indice de priorité, pas d’une prévision de trafic ou d’un ROI financier. Les PDF utilisent également le bon sens du ratio gravité/effort.

## Search Console

Connecter **Analytics + Search Console** dans les paramètres ou depuis le plan, choisir un compte et une propriété autorisée, puis cliquer sur **Importer**. L’import conserve 28 jours de données finalisées, terminés trois jours avant la date courante dans le calendrier Pacifique de Google.

Les propriétés doivent couvrir le projet. Un compte Google appartenant à un autre tenant est refusé avant tout appel externe. Les pages d’une propriété Domaine sont limitées à l’origine et au chemin du projet. Les tokens OAuth ne sont jamais envoyés au navigateur par ces endpoints.

L’import demande séparément les métriques par page et par requête/page, avec au maximum 25 000 lignes pour chacun des deux appels. Google fournit les principales lignes et ne garantit pas l’exhaustivité, même sous cette limite : [référence Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query). La période, la date d’import et l’atteinte de chaque limite sont affichées dans le module concerné. Après 35 jours, un import ne pondère plus les priorités.

L’import est manuel, limité à trois demandes par heure et par clé du limiteur API. Un verrou de trois minutes sur le projet bloque les opérations Search Console concurrentes entre processus. L’écriture du snapshot, des deux jeux de métriques et leur rétention est transactionnelle. Un échec d’un appel conserve les derniers résultats sans import partiel. Douze snapshots sont conservés par projet. Déconnecter le compte Google supprime ses snapshots, leurs métriques et les mesures liées au compte ; les caches des nouveaux modules sont invalidés dans le navigateur.

## Requêtes, opportunités et chevauchements

La page **Requêtes Google** (`/keywords`) exploite le dernier import du projet. Elle propose recherche textuelle, filtres **Opportunités de CTR** et **Chevauchements entre URLs**, et pagination. Les anciens snapshots restent utilisables pour les priorités ; un nouvel import est nécessaire pour disposer de leurs requêtes.

Les variantes de casse et d’espacement sont regroupées, en conservant les accents. Les clics et impressions des URLs sont additionnés, le CTR recalculé et la position moyenne pondérée par les impressions. Ces sommes ne représentent ni des recherches uniques ni le volume d’un marché : plusieurs pages peuvent apparaître lors de la même recherche. Les requêtes anonymisées et les lignes que Google n’envoie pas restent absentes.

Une opportunité nécessite au moins 100 impressions, une position moyenne entre 4 et 20, et un CTR inférieur à 75 % de la médiane des requêtes du même import dans la tranche 4–10 ou 11–20. La référence nécessite dix requêtes éligibles, chacune avec au moins 100 impressions ; chaque requête, y compris celle évaluée, compte une fois. Sans cet échantillon, aucun signal de CTR n’est affiché. Le classement utilise l’écart à la médiane multiplié par les impressions ; cet indice n’est pas une prévision de clics. Examiner l’intention, la marque et les extraits de résultats avant une modification.

Un chevauchement nécessite au moins 100 impressions cumulées et deux URLs ayant chacune au moins 20 impressions, 20 % des impressions de leurs pages, une position de 1 à 20 et une position moyenne distante de cinq places au plus de l’URL la plus exposée. Il signale un cas à examiner, sans affirmer une cannibalisation. Chaque requête expose jusqu’à cinq URLs de preuve.

Le vocabulaire extrait des audits reste accessible à la demande, avec des libellés de fréquence et de présence dans les balises. Ses graphiques sont chargés seulement à l’ouverture du panneau ; les occurrences ne sont pas présentées comme des positions Google.

## Suivi et vérification

Statuts enregistrés en PostgreSQL : **À faire**, **En cours**, **Correction effectuée**, **Vérifiée par audit**, **Écartée**. Notes jusqu’à 2 000 caractères. Les membres et administrateurs du projet peuvent modifier ; les invités ont accès en lecture.

Marquer une correction effectuée enregistre l’audit de référence, toutes les URLs touchées et la date. Modifier sa note ne change pas cette référence. Relancer ensuite un audit et cliquer sur **Vérifier les corrections**.

Le nouvel audit doit avoir démarré après la déclaration de correction, contrôler chaque URL de référence avec le même contrôle en état PASS, et ne présenter aucun échec ni avertissement de ce contrôle. Une page omise ou un contrôle absent ne suffit pas. La vérification enregistre l’audit de preuve. Un échec réapparu dans un audit ultérieur est signalé comme régression ; une nouvelle vérification rouvre l’action.

La vérification est déclenchée par le bouton, sans modifier les statuts lors d’une simple lecture. Elle confirme les contrôles observés dans le périmètre du crawl, sans prouver un effet causal sur les performances Google.

## Comparaison après correction

Une action déclarée **Correction effectuée** ou **Vérifiée par audit** propose **Mesurer l’évolution**, sur 7 ou 28 jours. La période avant se termine la veille de la correction ; la période après commence le lendemain. Le jour déclaré est exclu, dans le calendrier Pacifique utilisé par Google. Le bouton attend une période après complète et le décalage de trois jours, puis l’API demande uniquement des données finalisées. Ce délai ne garantit pas que toutes les pages auront des données.

La mesure relit les droits du compte et de la propriété choisis lors du dernier import. Deux requêtes API, regroupées par page, comparent les périodes sur les URLs enregistrées lors de la déclaration. Seules les URLs observées dans les deux périodes entrent dans les totaux ; les pages absentes sont comptées séparément et ne deviennent pas des zéros. Une référence à zéro n’engendre pas de pourcentage de croissance infini. Sans URL comparable, les performances restent absentes.

Le résultat conserve en PostgreSQL la propriété, la date de déclaration, la longueur et les dates des périodes, la date de mesure, la couverture, la limite Google et les clics, impressions, CTR et positions avant/après avec leurs écarts. Une position plus basse correspond à une amélioration. L’évolution ne démontre pas que la correction a causé le changement : saisonnalité, changements Google et composition des impressions interviennent aussi.

Une nouvelle mesure remplace celle de la même déclaration et de la même longueur de période. Une nouvelle déclaration ne récupère pas une ancienne mesure. Si la référence change pendant les appels Google, l’enregistrement est rejeté. En cas d’échec, la dernière mesure reste conservée. Le verrou de projet est partagé avec les imports ; les mesures ont également une limite de trois demandes par heure. Les invités restent en lecture seule.

## Migration et validation

Le troisième lot ajoute les **conversions GA4**, les revenus d’achat par page d’entrée et leur comparaison avant/après sur les pages de référence. Voir [ANALYTICS.md](ANALYTICS.md) pour la connexion, les règles de correspondance, les devises, les fuseaux et les limites d’attribution. Le classement de priorité reste fondé sur l’audit et l’exposition GSC ; les métriques commerciales sont affichées sans multiplicateur arbitraire.

Migrations additives : `site/prisma/migrations/20261002000000_action_plan_search_console/migration.sql`, `site/prisma/migrations/20261002010000_search_insights_measurements/migration.sql` et `site/prisma/migrations/20261002020000_analytics_business_impact/migration.sql`. La seconde ajoute les requêtes/pages et les mesures ; la troisième ajoute GA4. Les relations utilisent des clés étrangères composites par tenant. Les clés de lignes requête/page utilisent SHA-256 pour éviter d’indexer des textes longs. Le déploiement HestiaCP existant applique `prisma migrate deploy`. Générer le client Prisma avant le démarrage. Les migrations ont été appliquées uniquement à une base de test isolée pendant le développement.

```powershell
npm run db:generate
npm run typecheck
npm run lint --workspace=site
$env:TEST_DATABASE_URL = 'postgresql://seo_audit_test@127.0.0.1:55432/seo_security_audit'
npm test
npm run build
```

Les tests d’intégration refusent une URL de base autre que `127.0.0.1/seo_security_audit`. Ils couvrent la séparation des tenants et les contraintes SQL, l’import concurrent, la conservation après échec, la rétention, les rôles, la persistance, la vérification après recrawl et les régressions. Le module de requêtes ajoute les filtres et les imports atomiques ; les mesures ajoutent les données absentes, les périodes complètes, la persistance, le changement concurrent de référence et les comptes Google étrangers. Les appels Google sont simulés ; la connexion à un compte réel reste à valider avec les identifiants OAuth du déploiement.

Validation effectuée : 48 tests réussis, TypeScript sur les neuf workspaces, ESLint sans erreur, build de production et diff Prisma vide après les 23 migrations. Chromium confirme les imports GSC/GA4 simulés, les filtres de requêtes/CTR/chevauchements, les notes et statuts, les mesures Google et conversions après rechargement, l’attente d’une période complète, les preuves, la vérification en attente, Suggestions, l’absence d’erreurs React, l’absence de débordement sur écran de 390 pixels et la navigation mobile. La livraison précédente a aussi généré un PDF réel avec les libellés de priorité corrigés. Les services de test et le domaine virtuel utilisés pour ces contrôles sont locaux ; le site n’a pas été publié.

Le quatrième lot ajoute [le maillage interne](INTERNAL_LINKING.md), accessible depuis le plan : entrants et profondeur observés, suggestions avec ancre littérale et passage source, revue des ancres et export CSV. La migration `20261002030000_internal_linking` conserve les preuves des prochains crawls. Un audit ancien doit être relancé pour alimenter les suggestions contextualisées.

## Suites prévues

Le cinquième lot ajoute [l’inventaire sitemap et GSC](URL_INVENTORY.md) au maillage : pages auditées sans entrant, URLs absentes du crawl et destinations déjà liées mais non auditées, avec preuves et dates. Il reste utilisable avant le premier audit, sans diagnostic inventé. La migration additive 20261002040000_url_inventory conserve les snapshots et leur verrou par projet.

Cette livraison complète le parcours décision → correction → preuve → évolution Google et GA4. Restent à développer : valorisation des leads avec des montants explicitement renseignés, investigation avancée de la cannibalisation par intention, connecteurs CMS avec aperçu et retour arrière, attribution aux collaborateurs, données concurrentielles fournies par un prestataire, et visibilité IA sur plusieurs moteurs. L’agent IA de démonstration existant n’est pas remplacé par cette livraison. Les données GSC concernent les propriétés autorisées ; elles ne remplacent pas une base de mots-clés ou de backlinks concurrentiels.
