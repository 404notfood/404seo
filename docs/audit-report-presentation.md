# Présentation des rapports d’audit

Le rapport détaillé et le PDF regroupent les résultats par catégorie et nom de contrôle. Un problème présent sur 100 pages apparaît une fois, avec sa couverture et ses preuves par page. Le regroupement est calculé à la lecture : aucun changement de schéma ni nouveau crawl n’est nécessaire pour afficher un ancien audit.

## Compteurs et preuves

- Les compteurs principaux indiquent des types de problèmes, distincts du nombre de pages concernées et du nombre de constats.
- La couverture utilise les pages réellement vérifiées pour chaque contrôle. Deux enregistrements de la même URL ne comptent pas deux fois ; les paramètres d’URL sont conservés.
- Un groupe mêlant échecs, avertissements et réussites reste visible comme problème. Sa priorité vient de son résultat le plus sévère. Il ne figure pas aussi parmi les contrôles entièrement conformes.
- Les preuves complémentaires d’une page sont conservées. Seules leurs répétitions identiques sont retirées. Le site les affiche par lots de dix.
- Les anciens contrôles `image_optimization` qui mentionnent explicitement les ALT dans leur message ou leur référence rejoignent `images_alt`. Les vrais constats de poids ou format d’image restent distincts.
- Un résultat sans page source est présenté en « constats », sans inventer une couverture en pages.

Le calcul des scores existants n’est pas modifié par ce regroupement. Les recommandations produites par le scorer sont également dédupliquées par famille de correction.

## PDF

La première page présente la synthèse et les premières priorités. Chaque problème est ensuite décrit une seule fois avec sa couverture, une action et deux exemples distincts au maximum. L’annexe résume les contrôles entièrement conformes. Les détails complets restent disponibles sur le site ; le PDF précise cette limite. Les pieds de page sont numérotés par Chromium.

Les champs sont échappés, les couleurs de marque restent limitées aux codes hexadécimaux et les logos conservent le transport protégé contre le SSRF. Aucun script ou autre accès réseau n’est autorisé pendant le rendu PDF.

## Vérification

`node --import tsx --test tests/audit-findings.test.ts` vérifie le regroupement, les doublons d’URL, les statuts mixtes, les anciens contrôles ALT, les recommandations et l’échappement du HTML. Compléter avec le contrôle TypeScript, le lint des composants et une vérification visuelle PDF / navigateur.

L’aperçu Batikko produit pendant la refonte est une recomposition des constats extraits du PDF fourni, sans nouveau crawl. Le document original ne conserve pas toutes les URL sources ni toutes les métadonnées des contrôles ; cet aperçu ne remplace donc pas un export depuis les données d’audit stockées sur le VPS.
