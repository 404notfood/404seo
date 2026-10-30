# Audits des sites avec rendu JavaScript

Le crawler attend la stabilisation du contenu et des métadonnées, avec un budget
de huit secondes après la navigation. Les scripts, feuilles de style et requêtes
de données en cours prolongent cette attente dans la limite du budget. Une page
sans H1 reste signalée ; une navigation en échec ne génère plus artificiellement
des erreurs de contenu absent.

Les images avec `alt=""` sont reconnues comme explicitement décoratives. Le
contrôle ALT est effectué une seule fois dans l'analyse on-page. Le lazy loading
est évalué sur les images observées hors de l'écran initial, sans pénaliser
systématiquement les logos et images visibles dès l'ouverture.

Les contrôles tactiles sont mesurés à 375 × 812 pixels, même pour un audit
desktop. Ils recherchent des cibles visibles de moins de 24 × 24 pixels sans
espacement suffisant, avec une exception pour les liens dans une phrase. Les
éléments masqués et les conteneurs sans texte direct sont exclus du comptage
des petites polices. Ces mesures automatiques ne constituent pas un audit
d'accessibilité exhaustif.

Les métadonnées supplémentaires (Twitter, hreflang, en-têtes de sécurité,
lazy loading et erreurs de crawl) sont conservées dans `AuditPage.crawlMetadata`.
Les liens réels et les mots-clés sont restitués au worker d'analyse.

## Activation

Depuis la racine du dépôt, avec `DATABASE_URL` défini pour la base concernée :

```sh
npx prisma migrate deploy --schema site/prisma/schema.prisma
npx prisma generate --schema site/prisma/schema.prisma
```

Redémarrer ensuite le worker de crawl/analyse et lancer un nouvel audit. Les
rapports existants conservent leurs anciens résultats ; ils ne sont pas
réécrits automatiquement.

## Documents non HTML et redirections — 30 octobre 2026

Le MIME de la réponse HTTP est désormais conservé dans `crawlMetadata.contentType`.
Les documents XML, texte, JSON, SVG ou PDF ne passent plus les contrôles réservés
au HTML : titre, H1, langue, viewport, partage et maillage éditorial. Le statut
HTTP et HTTPS restent contrôlés ; un sitemap en erreur n'est donc pas considéré
comme sain. Le viewer XML généré par Chromium n'est pas analysé comme une page.
Les réponses `text/html` et `application/xhtml+xml` gardent les contrôles HTML,
ainsi que les anciens enregistrements sans MIME connu.

Les canoniques sont comparées à la destination de redirection réellement
observée. Les ports par défaut et fragments sont normalisés ; deux chemins avec
et sans barre restent distincts en l'absence de redirection prouvée. Les
paramètres ne sont pas supprimés.

Le client réseau suit les redirections en validant et en épinglant chaque saut.
Il ne livre plus de réponse 3xx à Chromium : Playwright n'intercepte pas les sauts
suivants d'une telle réponse. Le crawler navigue ensuite explicitement vers la
destination validée pour que l'URL, l'origine et les ressources relatives soient
cohérentes. Ces navigations partagent le même budget de temps et sont bornées.
Les mots-outils français « votre » et « notre » sont aussi exclus de l'extraction
de mots-clés, comme les autres possessifs.

Ce complément utilise le JSON existant : aucune nouvelle migration n'est ajoutée.
La migration `20261009090000_audit_crawl_metadata` reste nécessaire sur une ancienne
installation. Pour constater les corrections Twitter/JSON-LD/lazy déjà présentes
dans les sources locales, transférer la version complète des sources, appliquer
les migrations, générer Prisma et redémarrer le processus PM2 `404seo-worker`
(nom vérifié dans `deployment/ecosystem.config.cjs`). Un nouvel
audit est requis ; réexporter un ancien PDF conserve ses anciens résultats.

Un `noindex` reste signalé : le logiciel ne peut pas déduire que cette exclusion
est voulue par l'éditeur. Un texte inférieur à 300 mots reste une heuristique de
l'outil, et non une obligation Google. Ces points ne doivent pas justifier des
faits inventés ou un remplissage des pages légales.

## Validation

```sh
node --import tsx --test tests/react-audit.test.ts tests/network.test.ts tests/security.test.ts
```

Pour inclure le test Chromium, définir `RUN_CRAWLER_BROWSER_TESTS=1` et, si
nécessaire, `PLAYWRIGHT_EXECUTABLE_PATH` vers un Chromium installé. Le test
utilise des réponses simulées dans le navigateur et vérifie le rendu différé,
les métadonnées, les omissions réelles et les cibles mobiles.
