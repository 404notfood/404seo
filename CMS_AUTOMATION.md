# Corrections CMS et automatisation d’agence

État du 2 octobre 2026 : les connecteurs WordPress/WooCommerce et PrestaShop, les propositions individuelles et les lots sont implémentés. Shopify et la recette sur des boutiques complètes sont en attente, conformément à la demande du propriétaire. Aucun site client ni VPS n’a été modifié.

## Parcours disponible

1. Dans **Connexions CMS**, sélectionner le projet client, installer le ZIP fourni et connecter son domaine HTTPS.
2. Choisir les contenus et demander les propositions SEO ou orthographiques. Un lot est enregistré en base puis traité par BullMQ. La génération ne publie rien.
3. Lire l’avant/après et les raisons. Les propositions restent des brouillons, même lorsque le traitement est automatique.
4. Cocher les propositions approuvées, puis confirmer leur publication. Le worker traite le lot et affiche sa progression et ses échecs. Une notification apparaît dans l’interface ouverte lorsque le lot se termine ; l’historique reste consultable.
5. Relire les valeurs publiées, puis relancer l’audit pour contrôler le rendu public. Une publication CMS confirmée n’est pas une preuve d’amélioration du classement.
6. Annuler une correction compatible depuis sa sauvegarde. Une modification ultérieure du contenu bloque l’annulation, afin de conserver le travail d’un éditeur externe.

Le bouton **Arrêter le lot** annule immédiatement un lot encore en attente. Un lot commencé s’arrête après l’opération en cours. Une publication incertaine arrête les écritures suivantes et nécessite **Vérifier l’opération** : elle n’est jamais répétée aveuglément.

## Champs et périmètres

| Connecteur | Contenus | Champs SEO | Corrections de texte |
| --- | --- | --- | --- |
| WordPress, extension 1.1.0 | Pages, articles et produits WooCommerce publiés et modifiables | Surcharges protégées de titre SEO et méta-description ; intégration native, Yoast et Rank Math | Texte compatible de post_content et attributs alt existants des images intégrées dans ce contenu |
| PrestaShop, module 1.1.0 | Produits, catégories et pages CMS actifs | meta_title/meta_description ; pour les pages CMS, head_seo_title/meta_description | description_short/description des produits, description des catégories, content des pages CMS ; alt des images intégrées dans ces champs |

PrestaShop travaille dans **une boutique et une langue explicitement configurées à la fois**. Une rotation de clé sur ce même périmètre conserve les sauvegardes. Changer de boutique ou langue remplace la connexion active ; résoudre d’abord les opérations incertaines. Les catégories racines et les règles personnalisées d’URL qui utilisent meta_title sont exclues. Le titre visible meta_title d’une page CMS n’est pas remplacé.

**Corriger les fautes** concerne les champs SEO existants. **Corriger l’extrait** et **Corriger les textes alt** concernent au maximum les huit premiers segments compatibles de leur type par contenu. Un segment de texte fait au maximum 400 caractères, un alt 200. Ce pilote ne corrige pas tout le texte d’une longue page et n’invente pas les descriptions d’images dont l’alt est absent. Il ne modifie pas les légendes des images du catalogue PrestaShop ni les métadonnées des pièces jointes WordPress.

Les balises, attributs non sélectionnés, commentaires Gutenberg, scripts, styles, blocs de code, liens et shortcodes restent intacts. Seules les portions de texte approuvées sont échappées et remplacées dans le champ HTML natif. Les espaces autour du texte, chiffres et URLs ne doivent pas changer. La restauration des segments sélectionnés conserve leur texte rendu ; l’encodage initial de certaines entités HTML peut être normalisé. Les grands champs HTML de plus de 200 Ko et les segments incompatibles sont exclus.

La compatibilité des thèmes, constructeurs de pages, blocs dynamiques et extensions de cache reste à vérifier sur les boutiques complètes. Les hooks d’édition natifs ne sont pas déclenchés par les écritures SQL ciblées. Les caches des objets sont invalidés, mais une purge du cache public peut être nécessaire. Les URLs, prix, références, scripts, thèmes, fichiers serveur et règles robots ne font pas partie de ces corrections.

## Autorisation, coûts et reprise

Les plans disposent de droits IA et CMS indépendants, de **cmsMonthlyQuota**, **aiMonthlyQuota** et **aiMonthlyBudgetCents**. Ils se configurent dans l’administration. Les nouveaux budgets IA sont nuls par défaut : renseigner les valeurs commerciales avant activation.

Les lots réservent toutes leurs propositions CMS sous verrou PostgreSQL du tenant. Chaque proposition lancée ou réservée compte dans le quota CMS, même si elle échoue ou si son lot est arrêté. La publication et la restauration n’en consomment pas. Les droits du membre, du propriétaire, du tenant et de l’abonnement sont recontrôlés avant exécution.

Le budget IA est partagé entre **agent SEO, propositions CMS et échantillons de visibilité IA**. Une réservation conservatrice précède chaque appel ; les tokens renvoyés par le fournisseur servent à calculer le coût avec les tarifs configurés en USD par million de tokens. Il s’agit d’un coût calculé à partir de l’usage API, pas d’une facture du fournisseur. Un timeout peut avoir été facturé : sa réservation reste engagée et signalée comme incertaine. Les prix doivent être mis à jour lorsque le modèle ou les tarifs changent. La fonctionnalité historique de suggestion de réponse aux avis locaux utilise encore Anthropic séparément : ne pas l’inclure dans ce budget commercial sans adapter sa comptabilité.

Variables nécessaires : CMS_CREDENTIAL_KEY, OPENAI_API_KEY, OPENAI_SEO_MODEL, OPENAI_SEO_INPUT_USD_PER_MILLION et OPENAI_SEO_OUTPUT_USD_PER_MILLION. Le fournisseur ne reçoit aucun identifiant CMS. La plateforme utilise sa clé serveur ; le branchement d’une clé IA personnelle par client reste une extension à développer.

Les secrets CMS sont chiffrés en AES-GCM et liés au tenant, projet, connecteur et périmètre. Le transport vérifie le domaine du projet, le DNS public et la destination effective, refuse les redirections et borne les échanges. Les sorties IA structurées sont revalidées en texte simple. Seuls les snapshots textuels nécessaires sont stockés, jamais les descriptions HTML brutes.

Le lot PostgreSQL constitue la source durable de progression. Redis ne contient que son identifiant. Le worker CMS recherche périodiquement les lots en attente et les traitements dont le bail a expiré. Les reprises ne relancent pas une génération déjà engagée et transforment une écriture interrompue en opération incertaine. Les connecteurs réalisent le contrôle de révision, les écritures et leur marqueur dans une transaction InnoDB. Une réconciliation annule durablement une tentative non exécutée, y compris une requête réseau retardée.

Ne pas supprimer les tables d’opérations des modules lors d’une désinstallation ou restauration : elles contiennent les marqueurs et annulations nécessaires. Sauvegarder la clé CMS avec la base dans une archive chiffrée, et conserver la clé de sauvegarde séparément hors du VPS.

## Modules de conseil et données SEO

L’agent SEO utilise le dernier audit terminé du projet choisi, ses scores et jusqu’à douze contrôles en échec. Il affiche la date de cet audit. Il n’exécute aucune publication ; le changement de projet réinitialise sa conversation.

Les mesures de position conservent le nombre de résultats organiques effectivement observés. Un captcha, une page vide ou une erreur réseau laisse un échec explicite et conserve l’historique. Les anciennes mesures sans preuve de couverture sont exclues des statistiques et des variations. Le scraping Google reste expérimental, dépend de ses réponses et ne garantit pas cent résultats.

Les backlinks automatiques proviennent désormais de DataForSEO, avec un échantillon maximal de cent liens et un total fournisseur distinct. Un compte configuré et les frais du fournisseur sont nécessaires. Une erreur n’efface pas les données existantes ; aucun score d’autorité comparable à Ahrefs n’est inventé. Les comparaisons concurrentes restent fondées sur les audits disponibles, sans index mondial propriétaire.

La visibilité IA mesure les mentions d’un domaine dans des réponses API du modèle configuré, sans recherche web et sans inclure le domaine cible dans la question. Une question compte comme un appel IA. Les échecs ne sont plus enregistrés comme une absence de mention. Les anciens enregistrements Claude ne sont pas utilisés dans les statistiques actuelles. Ce module ne mesure ni le classement ChatGPT ni les AI Overviews de Google.

## Déploiement et validation

Les trois migrations nouvelles sont **20261002120000_cms_batches_ai_budget**, **20261002123000_rank_measurement_status** et **20261002130000_cms_text_patches**. Elles sont appliquées uniquement à la base de test isolée, qui contient **29 migrations** au total. La base métier doit être sauvegardée avant prisma migrate deploy.

PM2 ajoute **404seo-cms-worker** en mode fork ; la plateforme comporte cinq services. L’endpoint /health/ready contrôle PostgreSQL, Redis et les heartbeats des trois workers. Voir [les procédures HestiaCP, sauvegarde et restauration](deployment/README.md).

Validation locale : **66 tests réussis, aucun ignoré**, avec PostgreSQL, MySQL/InnoDB et Redis isolés. La suite couvre notamment réservations concurrentes, isolation propriétaire/tenant, retrait de droits, jobs Redis en échec, absence de publication pendant la génération, réponses perdues, conservation et restauration du texte/alt, verrous SQL, scopes boutique/langue et sauvegarde/restauration PostgreSQL authentifiée. Les réponses des fournisseurs IA et CMS sont simulées ; WordPress utilise un double SQL, PrestaShop un vrai stockage MySQL et des doubles de ses classes.

Les parcours navigateur WordPress et PrestaShop ont réussi sur ordinateur et mobile : connexion, ZIP, rotation d’accès, proposition sans écriture, publication individuelle et par lot, restauration du texte/alt, persistance et changement de projet sans conversation conservée. Ils utilisent le build Next.js de production, Fastify, BetterAuth et PostgreSQL réels ; les CMS et le fournisseur IA restent simulés. Aucune erreur React ni débordement horizontal mobile détecté. Le worker CMS a également démarré contre PostgreSQL/Redis isolés et renouvelé son heartbeat. La recette sur un VPS, les comptes des fournisseurs et les CMS complets restent à effectuer lorsque ces accès sont disponibles.

Sources officielles : [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [catégories PrestaShop](https://devdocs.prestashop-project.org/9/webservice/resources/categories/), [pages CMS PrestaShop](https://devdocs.prestashop-project.org/9/webservice/resources/content_management_system/), [définition native CMS](https://github.com/PrestaShop/PrestaShop/blob/9.0.0/classes/CMS.php) et [backlinks DataForSEO](https://docs.dataforseo.com/v3/backlinks-backlinks-live/).
