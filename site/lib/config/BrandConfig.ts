/**
 * Classe centralisée pour le branding et les paramètres commerciaux.
 *
 * Source unique de vérité pour : nom du SaaS, URL publique, prix, rating affiché.
 */
export class BrandConfig {
  private static _instance: BrandConfig | null = null;

  private constructor(
    public readonly productName: string,
    public readonly productTagline: string,
    public readonly siteUrl: string,
    public readonly logoPath: string,
    public readonly ogImagePath: string,
    public readonly plans: ReadonlyArray<PricingPlan>,
    public readonly stats: PublicStats,
  ) {}

  static getInstance(): BrandConfig {
    if (!BrandConfig._instance) {
      BrandConfig._instance = new BrandConfig(
        "404 SEO",
        "Plateforme d'audit SEO technique avec IA",
        "https://seo.404notfood.fr",
        "/logo.png",
        "/og-image.png",
        [
          new PricingPlan(
            "Starter",
            0,
            "EUR",
            "Pour tester la plateforme",
            ["5 audits / mois", "100 pages / audit", "3 projets", "Backlinks inclus"],
            "Commencer gratuitement",
            false,
          ),
          new PricingPlan(
            "Pro",
            29,
            "EUR",
            "Pour les indépendants et freelances",
            [
              "100 audits / mois",
              "10 000 pages / audit",
              "20 projets",
              "Suivi de positions",
              "Recommandations IA",
              "Analyse concurrents",
            ],
            "Choisir Pro",
            true,
          ),
          new PricingPlan(
            "Agency",
            99,
            "EUR",
            "Pour les agences et équipes",
            [
              "Audits illimités",
              "100 000 pages / audit",
              "Projets illimités",
              "SEO Local & GBP",
              "Accès API REST",
              "PDF marque blanche",
            ],
            "Choisir Agency",
            false,
          ),
        ],
        // Stats publiques : null = ne pas afficher.
        // Préférable à du faux qui violerait les règles Google (Schema.org).
        new PublicStats(null, null, null, "< 30s"),
      );
    }
    return BrandConfig._instance;
  }
}

export class PricingPlan {
  constructor(
    public readonly name: string,
    public readonly priceEur: number,
    public readonly currency: string,
    public readonly description: string,
    public readonly features: ReadonlyArray<string>,
    public readonly cta: string,
    public readonly highlight: boolean,
  ) {}

  isFree(): boolean {
    return this.priceEur === 0;
  }

  formatPrice(): string {
    return this.isFree() ? "Gratuit" : String(this.priceEur);
  }

  formatPeriod(): string {
    return this.isFree() ? "" : "€ / mois";
  }
}

/**
 * Stats publiques affichées sur la landing.
 * `null` = ne pas afficher (préférable à du faux qui violerait les règles Google).
 */
export class PublicStats {
  constructor(
    public readonly auditedSitesCount: number | null,
    public readonly satisfactionPercent: number | null,
    public readonly averageRating: number | null,
    public readonly firstResultDelay: string | null,
  ) {}

  hasAnyValue(): boolean {
    return [
      this.auditedSitesCount,
      this.satisfactionPercent,
      this.averageRating,
      this.firstResultDelay,
    ].some((v) => v !== null);
  }
}
