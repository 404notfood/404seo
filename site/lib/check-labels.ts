// lib/check-labels.ts — Labels et conseils partagés pour les checks SEO

export const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL: "Technique",
  ON_PAGE: "On-Page",
  PERFORMANCE: "Performance",
  UX_MOBILE: "UX Mobile",
}

export const CHECK_LABELS: Record<string, string> = {
  title: "Balise Title",
  meta_description: "Meta Description",
  response_time: "Temps de réponse",
  page_size: "Poids de page",
  h1: "Balise H1",
  images_alt: "Attributs ALT des images",
  canonical: "URL Canonique",
  robots_txt: "Fichier robots.txt",
  sitemap: "Sitemap XML",
  https: "Protocole HTTPS",
  http_status: "Code HTTP",
  indexability: "Indexabilité",
  viewport: "Meta Viewport",
  lang_attribute: "Attribut lang",
  open_graph: "Balises Open Graph",
  heading_hierarchy: "Hiérarchie des titres",
  word_count: "Volume de contenu",
  schema_org: "Données structurées",
  internal_links: "Liens internes",
  external_links: "Liens externes",
  broken_links: "Liens cassés",
  image_optimization: "Optimisation des images",
  https_resources: "Ressources HTTPS",
  mobile_friendly: "Compatibilité mobile",
}

export const CHECK_ADVICE: Record<string, string> = {
  title: "Raccourcissez votre titre à 50-60 caractères pour un affichage optimal dans les SERPs.",
  meta_description: "Rédigez une meta description de 150-160 caractères avec votre mot-clé principal.",
  response_time: "Optimisez le TTFB : activez un cache serveur, utilisez un CDN, optimisez les requêtes DB.",
  page_size: "Réduisez le poids : compressez les images (WebP), minifiez CSS/JS, activez gzip.",
  h1: "Utilisez un seul H1 par page, contenant votre mot-clé principal.",
  images_alt: "Ajoutez un attribut ALT descriptif à chaque image pour l'accessibilité et le SEO.",
  canonical: "Définissez une URL canonique pour éviter le contenu dupliqué.",
  robots_txt: "Vérifiez que votre robots.txt autorise l'accès aux pages importantes et soumettez-le via la Search Console.",
  sitemap: "Créez un sitemap XML à jour et soumettez-le via la Search Console.",
  https: "Migrez vers HTTPS pour sécuriser les données et améliorer le classement.",
  http_status: "Corrigez les erreurs HTTP (4xx, 5xx) pour garantir l'accessibilité de vos pages.",
  indexability: "Vérifiez que vos pages importantes sont indexables (pas de noindex accidentel).",
  viewport: "Ajoutez la meta viewport pour un affichage responsive correct.",
  lang_attribute: "Spécifiez l'attribut lang sur la balise <html> (ex: lang=\"fr\") pour le SEO international.",
  open_graph: "Ajoutez og:title, og:description et og:image pour un meilleur aperçu sur les réseaux sociaux.",
  heading_hierarchy: "Respectez la hiérarchie H1 > H2 > H3 sans sauter de niveaux pour une structure claire.",
  word_count: "Enrichissez votre contenu avec au moins 300 mots. Les pages thin content sont pénalisées par Google.",
  schema_org: "Implémentez le balisage Schema.org pour enrichir vos résultats de recherche (rich snippets).",
  internal_links: "Ajoutez des liens internes pertinents pour améliorer le maillage et la navigation.",
  external_links: "Liez vers des sources de qualité pour renforcer la crédibilité de votre contenu.",
  broken_links: "Corrigez ou supprimez les liens cassés qui nuisent à l'expérience utilisateur.",
  image_optimization: "Compressez vos images et utilisez le format WebP pour réduire le temps de chargement.",
  https_resources: "Chargez toutes les ressources (images, scripts, CSS) en HTTPS.",
  mobile_friendly: "Assurez-vous que votre site est entièrement responsive et mobile-friendly.",
}

export function getCheckLabel(checkName: string): string {
  return CHECK_LABELS[checkName] || checkName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
