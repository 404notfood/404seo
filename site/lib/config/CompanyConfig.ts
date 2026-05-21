/**
 * Classe centralisée des informations juridiques de la société éditrice.
 *
 * Source unique de vérité pour mentions légales, privacy, CGU, footer.
 * Remplir TODO_FILL avec les vraies valeurs avant la nouvelle demande GBP API.
 */
export class CompanyConfig {
  static readonly TODO_FILL = "[À compléter]" as const;

  private static _instance: CompanyConfig | null = null;

  private constructor(
    public readonly legalName: string,
    public readonly tradingName: string,
    public readonly legalForm: string,
    public readonly siret: string,
    public readonly vatNumber: string,
    public readonly headquartersAddress: Address,
    public readonly publicationDirector: string,
    public readonly contactEmail: string,
    public readonly privacyEmail: string,
    public readonly host: HostingProvider,
    public readonly mediator: string,
    public readonly establishedYear: number,
  ) {}

  static getInstance(): CompanyConfig {
    if (!CompanyConfig._instance) {
      CompanyConfig._instance = new CompanyConfig(
        CompanyConfig.TODO_FILL,
        "404 SEO",
        "Entrepreneur individuel — micro-entreprise",
        CompanyConfig.TODO_FILL,
        "TVA non applicable, art. 293 B du CGI",
        new Address(
          CompanyConfig.TODO_FILL,
          CompanyConfig.TODO_FILL,
          CompanyConfig.TODO_FILL,
          "France",
        ),
        "Laurent",
        "contact@404notfood.fr",
        "privacy@404notfood.fr",
        new HostingProvider(
          CompanyConfig.TODO_FILL,
          CompanyConfig.TODO_FILL,
          CompanyConfig.TODO_FILL,
          CompanyConfig.TODO_FILL,
          CompanyConfig.TODO_FILL,
        ),
        "Service réservé aux professionnels",
        2026,
      );
    }
    return CompanyConfig._instance;
  }

  isComplete(): boolean {
    return !this.hasPlaceholders();
  }

  hasPlaceholders(): boolean {
    const flatValues = [
      this.legalName,
      this.siret,
      this.headquartersAddress.street,
      this.headquartersAddress.postalCode,
      this.headquartersAddress.city,
      this.host.name,
      this.host.address,
      this.host.phone,
      this.host.website,
      this.host.legalName,
    ];
    return flatValues.some((v) => v === CompanyConfig.TODO_FILL);
  }
}

export class Address {
  constructor(
    public readonly street: string,
    public readonly postalCode: string,
    public readonly city: string,
    public readonly country: string,
  ) {}

  toString(): string {
    return `${this.street}, ${this.postalCode} ${this.city}, ${this.country}`;
  }
}

export class HostingProvider {
  constructor(
    public readonly name: string,
    public readonly legalName: string,
    public readonly address: string,
    public readonly phone: string,
    public readonly website: string,
  ) {}
}
