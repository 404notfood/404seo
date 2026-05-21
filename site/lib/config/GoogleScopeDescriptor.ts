/**
 * Descripteurs des scopes OAuth Google demandés par 404 SEO.
 *
 * Utilisé par :
 *  - la politique de confidentialité (section Google API Services)
 *  - la page publique /integrations/google-business-profile
 *  - le formulaire de réapplication GBP API (justification métier)
 */
export class GoogleScopeDescriptor {
  constructor(
    public readonly name: string,
    public readonly scope: string,
    public readonly accessLevel: AccessLevel,
    public readonly purpose: string,
    public readonly dataAccessed: ReadonlyArray<string>,
    public readonly dataNotAccessed: ReadonlyArray<string>,
  ) {}

  isWriteAccess(): boolean {
    return this.accessLevel === AccessLevel.ReadWrite;
  }

  isReadOnly(): boolean {
    return this.accessLevel === AccessLevel.ReadOnly;
  }
}

export enum AccessLevel {
  ReadOnly = "readonly",
  ReadWrite = "manage",
  Identity = "identity",
}

/**
 * Catalogue des scopes Google utilisés par 404 SEO.
 * Source unique pour l'affichage public et la documentation interne.
 */
export class GoogleScopeCatalog {
  private static _instance: GoogleScopeCatalog | null = null;

  private constructor(public readonly scopes: ReadonlyArray<GoogleScopeDescriptor>) {}

  static getInstance(): GoogleScopeCatalog {
    if (!GoogleScopeCatalog._instance) {
      GoogleScopeCatalog._instance = new GoogleScopeCatalog([
        new GoogleScopeDescriptor(
          "Identité Google",
          "https://www.googleapis.com/auth/userinfo.email",
          AccessLevel.Identity,
          "Identifier le compte Google connecté pour relier la session SaaS au bon utilisateur Google.",
          ["Adresse e-mail du compte Google connecté"],
          [
            "Aucune information de profil étendu",
            "Aucun contenu Gmail",
            "Aucun accès Drive ou Calendar",
          ],
        ),
        new GoogleScopeDescriptor(
          "Google Search Console",
          "https://www.googleapis.com/auth/webmasters.readonly",
          AccessLevel.ReadOnly,
          "Importer les données de performance organique (impressions, clics, requêtes, positions) pour les croiser avec les audits SEO.",
          [
            "Liste des propriétés Search Console autorisées",
            "Statistiques de recherche en lecture seule",
            "Sitemaps déclarés",
          ],
          [
            "Aucune modification de propriété",
            "Aucun envoi de sitemap",
            "Aucune action de réindexation",
          ],
        ),
        new GoogleScopeDescriptor(
          "Google Analytics 4",
          "https://www.googleapis.com/auth/analytics.readonly",
          AccessLevel.ReadOnly,
          "Lire les données de trafic GA4 pour enrichir les audits SEO avec des métriques d'engagement.",
          [
            "Liste des propriétés GA4 autorisées",
            "Rapports d'audience, acquisition, engagement",
          ],
          [
            "Aucune modification de configuration GA4",
            "Aucun accès aux Audiences ou Conversions personnalisées",
          ],
        ),
        new GoogleScopeDescriptor(
          "Google Business Profile",
          "https://www.googleapis.com/auth/business.manage",
          AccessLevel.ReadWrite,
          "Permettre aux professionnels (restaurateurs, artisans, agences SEO) de gérer leurs fiches d'établissement directement depuis 404 SEO : mise à jour des informations, réponses aux avis, publication de posts, suivi des statistiques locales.",
          [
            "Liste des comptes et locations GBP autorisés par l'utilisateur",
            "Informations de fiche (nom, adresse, téléphone, horaires, catégories)",
            "Avis clients et possibilité de réponse",
            "Posts GBP",
            "Statistiques (vues, recherches, appels)",
          ],
          [
            "Aucune création de fiche sans action explicite de l'utilisateur",
            "Aucune suppression de fiche",
            "Aucun partage des données avec des tiers",
            "Aucun usage publicitaire",
          ],
        ),
      ]);
    }
    return GoogleScopeCatalog._instance;
  }

  getByScope(scope: string): GoogleScopeDescriptor | undefined {
    return this.scopes.find((s) => s.scope === scope);
  }

  getGbpScope(): GoogleScopeDescriptor {
    const gbp = this.scopes.find((s) => s.scope.includes("business.manage"));
    if (!gbp) {
      throw new Error("Le scope GBP doit être présent dans le catalogue");
    }
    return gbp;
  }
}
