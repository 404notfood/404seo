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

## Validation

```sh
node --import tsx --test tests/react-audit.test.ts tests/network.test.ts tests/security.test.ts
```

Pour inclure le test Chromium, définir `RUN_CRAWLER_BROWSER_TESTS=1` et, si
nécessaire, `PLAYWRIGHT_EXECUTABLE_PATH` vers un Chromium installé. Le test
utilise des réponses simulées dans le navigateur et vérifie le rendu différé,
les métadonnées, les omissions réelles et les cibles mobiles.
