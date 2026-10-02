# Plan d’action SEO — première livraison

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

La première version importe au maximum 25 000 lignes par requête. Google fournit les principales lignes et ne garantit pas l’exhaustivité, même sous cette limite : [référence Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query). La période, la date d’import et l’atteinte de la limite sont affichées. Après 35 jours, un import ne pondère plus les priorités.

L’import est manuel, limité à trois requêtes par heure et par clé du limiteur API. Un verrou de trois minutes sur le projet bloque les imports concurrents entre processus. L’écriture du snapshot, des métriques et leur rétention est transactionnelle. Un échec conserve les derniers résultats. Douze snapshots sont conservés par projet. Déconnecter le compte Google supprime ses snapshots et leurs métriques.

## Suivi et vérification

Statuts enregistrés en PostgreSQL : **À faire**, **En cours**, **Correction effectuée**, **Vérifiée par audit**, **Écartée**. Notes jusqu’à 2 000 caractères. Les membres et administrateurs du projet peuvent modifier ; les invités ont accès en lecture.

Marquer une correction effectuée enregistre l’audit de référence, toutes les URLs touchées et la date. Modifier sa note ne change pas cette référence. Relancer ensuite un audit et cliquer sur **Vérifier les corrections**.

Le nouvel audit doit avoir démarré après la déclaration de correction, contrôler chaque URL de référence avec le même contrôle en état PASS, et ne présenter aucun échec ni avertissement de ce contrôle. Une page omise ou un contrôle absent ne suffit pas. La vérification enregistre l’audit de preuve. Un échec réapparu dans un audit ultérieur est signalé comme régression ; une nouvelle vérification rouvre l’action.

La vérification est déclenchée par le bouton, sans modifier les statuts lors d’une simple lecture. Elle confirme les contrôles observés dans le périmètre du crawl, sans prouver un effet causal sur les performances Google.

## Migration et validation

Migration additive : `site/prisma/migrations/20261002000000_action_plan_search_console/migration.sql`. Le déploiement HestiaCP existant applique `prisma migrate deploy`. Générer le client Prisma avant le démarrage. Les migrations ont été appliquées uniquement à une base de test isolée pendant le développement.

```powershell
npm run db:generate
npm run typecheck
npm run lint --workspace=site
$env:TEST_DATABASE_URL = 'postgresql://seo_audit_test@127.0.0.1:55432/seo_security_audit'
npm test
npm run build
```

Les tests d’intégration refusent une URL de base autre que `127.0.0.1/seo_security_audit`. Ils couvrent la séparation des tenants et les contraintes SQL, l’import concurrent, la conservation après échec, la rétention, les rôles, la persistance, la vérification après recrawl et les régressions. Les appels Google sont simulés ; la connexion à un compte réel reste à valider avec les identifiants OAuth du déploiement.

Validation effectuée : 16 tests réussis, TypeScript sur les neuf workspaces, ESLint sans erreur, build de production et diff Prisma vide après les 19 migrations. Chromium confirme l’import GSC simulé, les notes et statuts après rechargement, les preuves, la vérification en attente, Suggestions, l’absence d’erreurs React, l’absence de débordement sur écran de 390 pixels et l’ouverture/fermeture du menu mobile. Un PDF réel a également été généré avec les libellés de priorité corrigés. Les services de test et le domaine virtuel utilisés pour ce contrôle sont locaux ; le site n’a pas été publié.

## Suites prévues

Cette livraison pose le parcours décision → correction → preuve. Restent à développer : conversions GA4 et comparaison temporelle, analyse des requêtes et cannibalisation, maillage avancé, connecteurs CMS avec aperçu et retour arrière, attribution aux collaborateurs, données concurrentielles fournies par un prestataire, et visibilité IA sur plusieurs moteurs. L’agent IA de démonstration existant n’est pas remplacé par cette livraison.
