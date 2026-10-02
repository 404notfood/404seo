# Maillage interne — quatrième lot

L’écran `/internal-linking`, accessible dans « Contenu & Liens » et depuis le plan d’action, analyse le dernier audit terminé du projet sélectionné. Il fournit des suggestions de liens avec ancre et passage source, une liste des pages avec leurs entrants/sortants et profondeur, ainsi qu’une revue des ancres vides, génériques ou nofollow. Les listes proposent des filtres et une pagination de 25 résultats. Le CSV exporte les suggestions de la page affichée.

## Données collectées

Les nouveaux crawls stockent `AuditPage.linkingData`, un objet JSON versionné contenant uniquement des URLs et du texte extrait avec Cheerio. Il conserve au maximum 500 occurrences de liens internes par page et 30 paragraphes de 600 caractères. Les textes d’ancres sont bornés à 200 caractères. Les paragraphes conservent aussi leurs segments sans liens, séparés aux frontières des ancres existantes : une proposition ne doit pas chevaucher un lien déjà présent, même partiellement.

Les scripts, styles, objets embarqués, modèles, contenus marqués `hidden`/`aria-hidden`, navigation, en-tête, pied de page et blocs `aside` sont exclus des paragraphes. Les ancres dans la navigation restent utilisables pour le graphe et sa revue. Leur emplacement est identifié séparément. Les liens des images utilisent l’attribut `alt` lorsqu’aucun texte n’est disponible ; une ancre vide peut utiliser son attribut `title`. Aucun HTML de contexte n’est stocké ni interprété par l’interface.

Les URLs relatives respectent la première balise `<base href>`. Les fragments sont retirés ; paramètres, protocole, port et slash final restent distincts. Les URLs avec identifiants ou protocole autre que HTTP(S) sont ignorées. La canonique relative est également résolue selon la base du document.

Les directives génériques et `googlebot` sont combinées, y compris plusieurs balises meta, `none` et les en-têtes `X-Robots-Tag`. La portée des agents dans les en-têtes est préservée. Une page `noindex` est exclue des suggestions ; une source appliquant `nofollow` à tous ses liens ne fournit pas de propositions. La directive `none` regroupe les deux restrictions, conformément à la [documentation Google des directives robots](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

Les anciens audits conservent leur graphe à partir des URLs déjà stockées. L’interface signale les pages sans preuves contextuelles et propose de relancer un audit. Aucune ancre ni aucun paragraphe n’est reconstitué artificiellement.

## Graphe observé

Chaque paire source/destination compte une fois, même si la page comporte plusieurs liens ou fragments vers cette destination. Les liens vers soi-même ne comptent pas comme entrants. Une destination reçoit donc le nombre de pages sources distinctes présentes dans l’audit. Le graphe inclut navigation et nofollow ; il ne mesure pas l’autorité transmise.

La profondeur correspond au plus court chemin depuis l’URL de départ de l’audit, en suivant les liens entre pages présentes. « Non atteinte » signifie que ce graphe ne contient pas de chemin depuis cette URL. Une redirection du point de départ peut également empêcher cette mesure. Les URLs liées mais non auditées sont comptabilisées séparément ; leur code HTTP et leur indexabilité restent inconnus.

« Sans entrant observé » exclut le point de départ. Ce signal ne prouve pas qu’une page est orpheline sur tout le site : le crawl peut être incomplet, et les pages totalement isolées ne sont pas nécessairement découvertes par un crawl de liens. La livraison ne rapproche pas encore le graphe avec un inventaire exhaustif de sitemap ou de Search Console.

## Propositions et preuves

Une source et une destination doivent répondre HTTP 200, avoir une indexabilité connue et positive, ne pas provenir d’une redirection et posséder une canonique absente ou identique à leur URL. Les deux restent dans l’origine et le préfixe de chemin du projet. Les langues explicitement différentes sont exclues. Le titre et les premiers H1 de la destination alimentent un index de termes ; les mots fréquents français/anglais et les termes omniprésents ne suffisent pas à établir une proposition.

Une ancre doit contenir au moins deux termes distincts de la destination, dans un passage non lié de la source et à moins de cinq mots de distance. Elle est copiée littéralement avec ses accents et sa casse, et limitée à 100 caractères. Le passage de contexte est affiché avec cette ancre surlignée. Tout lien déjà observé vers la destination écarte la proposition, même s’il appartient à la navigation. Une source dont les liens sont tronqués ne fournit pas de suggestions.

L’ordre privilégie les destinations ayant moins d’entrants observés, puis le nombre de termes communs. Ce rapprochement lexical est une heuristique explicable : il ne comprend pas l’intention de recherche, ne garantit pas la pertinence éditoriale et ne prédit aucun gain de classement. L’utilisateur examine le contexte et ajoute le lien dans son CMS. Après un nouvel audit terminé, une paire désormais présente disparaît des propositions et apparaît dans les comptes du graphe ; aucun statut de correction n’est inventé ou modifié automatiquement.

Google recommande des ancres descriptives et pertinentes, avec un contexte utile, sans fixer un nombre idéal de liens par page. Ces principes motivent les preuves affichées ; les seuils du moteur sont des choix du produit. Voir [les recommandations de Google sur les liens](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).

## Bornes et sécurité

- Au plus 1 000 pages et 8 Mio de données de pages cumulées, lues par lots de 25 ; 100 000 arêtes pour le graphe.
- Au plus 60 destinations candidates par source, 20 000 comparaisons de paragraphes, 3 propositions par source et 500 propositions au total.
- Au plus 500 exemples d’ancres à examiner. Les résumés et avertissements indiquent les couvertures partielles ; les chiffres décrivent le périmètre analysé.
- `GET /api/projects/:projectId/internal-links` valide les filtres, contrôle le propriétaire du projet et le tenant, écarte les projets/audits supprimés et applique une limite de 30 requêtes par minute. Un propriétaire GUEST peut lire ce module ; le lancement d’audit conserve ses contrôles de rôle et de quota existants.
- Cette route ne fait aucune requête réseau vers les URLs du graphe. Le crawl conserve les protections SSRF, validation DNS et épinglage existants.
- Les preuves sont rendues comme texte React. Le CSV protège ses cellules contre les formules de tableur. Les liens externes ouverts par l’utilisateur utilisent `noopener noreferrer`.

Les limites de nombre de pages et de contenu peuvent omettre de bonnes suggestions. Le filtrage HTML n’interprète pas toutes les règles de visibilité CSS. Les contrôles déclarent une indexabilité observée ; ils ne prouvent pas une indexation effective dans Google.

## Migration et validation

La migration additive `20261002030000_internal_linking` ajoute une colonne JSON nullable aux pages déjà isolées par tenant et par audit. Elle ne modifie pas les audits historiques. Le déploiement Hestia existant applique `prisma migrate deploy` après sauvegarde et génération du client Prisma. Pendant le développement, elle a été appliquée uniquement à PostgreSQL de test sur `127.0.0.1:55432/seo_security_audit`.

Validation : 38 tests automatisés, TypeScript sur neuf workspaces, lint frontend et build de production. Les huit tests du lot couvrent l’extraction, les frontières des ancres, la balise base, les directives robots, les paramètres d’URL, les doublons, les profondeurs, les exclusions, les données anciennes/tronquées, l’isolation tenant/propriétaire, la pagination, le budget de données et la prise en compte d’un lien après recrawl. Les 22 migrations s’appliquent sur la base isolée et son diff Prisma est vide. Le contrôle navigateur du build de production vérifie les trois vues, les preuves, les filtres, l’export CSV et le format mobile. Un pipeline réel avec Redis isolé, BullMQ et Chromium confirme la sauvegarde de six paragraphes et de leurs segments sans lien depuis example.com, ainsi que la reprise du rapport sans duplication ni double consommation. Le site n’a pas été publié.
