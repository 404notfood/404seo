# Inventaire des URLs — cinquième lot

Dans /internal-linking, ouvrir « l’inventaire sitemap et GSC ». Il rapproche les URLs des sitemaps importés et du dernier snapshot de pages Search Console avec le dernier audit terminé du projet. Le module fonctionne aussi avant le premier audit : il affiche alors les sources sans diagnostic de maillage.

Importer les sitemaps sans URL lit robots.txt, puis essaie /sitemap.xml si aucune déclaration utilisable n’est trouvée. Une URL explicite permet de choisir un fichier ou un index XML. Les index et fichiers gzip sont suivis dans les bornes indiquées ci-dessous. Les fichiers doivent rester sur le même domaine, protocole et port que le projet ; les URLs de pages doivent aussi respecter son préfixe de chemin. Les sitemaps hébergés sur un autre domaine ne sont pas pris en charge par ce lot.

Les résultats proposent six filtres, une recherche par URL/titre, une pagination de 25 URLs et un CSV des seules lignes affichées. Chaque ligne affiche son état, ses entrants observés, ses fichiers de provenance et ses métriques GSC lorsqu’elles existent. Les dates d’audit/import et la période GSC restent visibles. Aucun crawl de ces URLs ni aucune modification du CMS ne sont lancés automatiquement.

## Interpréter les états

| État | Ce que les données permettent de dire |
| --- | --- |
| Audit à lancer | URL inventoriée, aucun audit terminé disponible. Entrants inconnus. |
| Absente du crawl, aucun entrant observé | URL absente de l’audit complet, sans lien vers elle dans les sources analysées. Son accessibilité et son indexabilité restent inconnues. |
| Liée mais non auditée | URL absente de l’audit complet, mais au moins une page auditée pointe vers elle. Vérifier budget, profondeur, règles robots et accessibilité. |
| Auditée sans entrant observé | Page HTTP 200, indexable selon l’audit, sans redirection ni canonique différente, et sans entrant dans le périmètre traité. |
| Lien observé ou URL de départ | Au moins un entrant est observé, ou l’URL est le point de départ de l’audit. |
| Exclue des candidates | HTTP, indexabilité, redirection ou canonique incompatibles avec une candidate ; la raison figure dans la ligne. |
| Auditée, hors périmètre du graphe | L’URL appartient à l’audit complet, mais le graphe limité ne permet pas d’évaluer suffisamment ses entrants. Entrants inconnus. |

« À investiguer » regroupe les pages auditées sans entrant et les URLs absentes du crawl sans entrant observé. Leur absence de lien n’est jamais présentée comme une preuve exhaustive de page orpheline. La recherche de présence interroge toutes les pages de l’audit, même lorsque le graphe atteint son budget.

Les fragments sont retirés ; paramètres, slash final, protocole et port restent distincts. Une paire source/destination compte une fois ; les liens vers soi-même sont ignorés. Navigation et nofollow restent des liens observés, sans estimation d’autorité. Le classement privilégie l’état, puis les impressions GSC disponibles. Une source GSC importée depuis plus de 35 jours ne pondère plus cet ordre ; les deux types de sources anciennes sont signalés. Une métrique manquante reste inconnue, tandis qu’un zéro réellement importé reste zéro.

Un sitemap déclare des URLs à proposer aux moteurs, sans garantir leur crawl ou leur indexation. Voir la [documentation Google sur les sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) et le [protocole sitemap](https://www.sitemaps.org/protocol.html). Une présence dans un import Search Console historique ne confirme pas l’indexation actuelle.

## Bornes et sécurité

- Import XML : 20 fichiers, 100 fichiers planifiés, 10 000 URLs distinctes, profondeur maximale de deux index descendants ; 20 secondes par import et au plus cinq secondes par requête.
- Taille : 64 Kio pour robots.txt, 1 Mio par XML après décompression, 4 Mio de XML cumulés et 4 Mio pour le snapshot stocké. La décompression gzip utilise une limite de sortie.
- XML : analyse stricte avec espaces de noms, DTD/entités personnalisées interdites, UTF-8 uniquement, profondeur XML de 32 et 50 000 éléments au maximum. Les déclarations relatives, URLs privées, identifiants de connexion et URLs hors périmètre sont ignorés. Seules les URLs et preuves de provenance sont stockées ; aucun XML/HTML n’est rendu.
- Réseau : client public partagé, DNS contrôlé et adresse épinglée à la socket. Chaque redirection est validée, reste sur la même origine et est limitée à deux sauts. Les cibles privées ne sont jamais téléchargées.
- Comparaison : graphe existant limité à 1 000 pages / 8 Mio ; inventaire combiné de 10 000 URLs / 4 Mio ; jusqu’à 10 000 pages GSC lues par lots de 250 et 100 000 références observées. Les plafonds, omissions et erreurs sont signalés.
- Une erreur totale d’import conserve le snapshot précédent. Un succès partiel conserve les URLs utilisables avec ses avertissements. Les cinq derniers snapshots restent disponibles en base ; l’interface utilise le dernier.
- Verrou PostgreSQL par projet, reprise après trois minutes et revalidation du propriétaire, tenant, suppression logique et verrou avant écriture en transaction. Un import obsolète ne peut ni écrire ni libérer le verrou d’un autre import.
- GET /api/projects/:projectId/url-inventory : propriétaire et tenant contrôlés, filtres stricts, 30 requêtes/minute.
- POST /api/projects/:projectId/url-inventory/sitemaps/sync : mêmes contrôles, rôle MEMBER minimum, trois imports/heure. Corps : objet vide ou champ facultatif sitemapUrl. CSRF et authentification suivent les protections API existantes.
- Le CSV quote chaque cellule et neutralise les débuts de formules. Les preuves sont rendues comme texte React ; les liens ouverts dans un onglet utilisent noopener noreferrer.

Ces budgets décrivent la couverture du produit, et peuvent être plus stricts que le protocole sitemap. Un inventaire plafonné privilégie les URLs sitemap avant les lignes GSC ; il ne prétend pas couvrir toutes les URLs du site. Les grands sitemaps dépassant 1 Mio sont refusés : fournir des fichiers plus petits ou adapter les budgets après mesure des ressources du VPS.

## Migration et recette

La migration additive 20261002040000_url_inventory ajoute le verrou du projet et les snapshots avec tenantId obligatoire et clé étrangère composite vers le projet. Elle a été appliquée uniquement à la base PostgreSQL isolée 127.0.0.1:55432/seo_security_audit. Le déploiement Hestia applique les migrations après sauvegarde via le script existant ; aucune infrastructure supplémentaire n’est requise.

Recette : importer un sitemap/index, ouvrir les preuves, comparer une URL liée non auditée et une page auditée sans entrant, essayer les filtres/pagination/CSV, puis relancer un audit et actualiser le module. Confirmer les dates et avertissements avant toute correction. Après déconnexion du compte Google, ses snapshots GSC disparaissent ; les snapshots sitemap indépendants sont conservés.

Validation : 48 tests automatisés, dont dix nouveaux tests couvrant XML, gzip, SSRF, plafonds, délais, provenance, états inconnus, données anciennes, CSV, droits, isolation tenant/propriétaire, imports concurrents, verrou remplacé, rétention et suppression logique. Les 23 migrations s’appliquent sur PostgreSQL de test avec diff Prisma vide. TypeScript sur neuf workspaces, lint frontend et build de production validés. Le navigateur vérifie l’import avec réponses externes simulées et la vraie API/base isolée, les preuves, filtres, pagination, CSV, persistance et affichage à 390 pixels sans erreur React. Le site n’a pas été publié.
