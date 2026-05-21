import type { Metadata } from "next"
import { CompanyConfig, BrandConfig } from "@/lib/config"

const brand = BrandConfig.getInstance()
const company = CompanyConfig.getInstance()

export const metadata: Metadata = {
  title: `Mentions légales — ${brand.productName}`,
  description: `Mentions légales de la plateforme ${brand.productName}, conformément à la loi LCEN.`,
}

export default function MentionsLegalesPage() {
  const addr = company.headquartersAddress
  return (
    <article>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Mentions légales</h1>
      <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : 7 mars 2026</p>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">1. Éditeur du site</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le site <strong>{brand.productName}</strong> (accessible à l&apos;adresse{" "}
          <a href={brand.siteUrl} className="text-blue-600 hover:underline">
            {brand.siteUrl}
          </a>
          ) est édité par :
        </p>
        <ul className="list-none text-slate-600 space-y-2 mb-4">
          <li><strong>Raison sociale :</strong> {company.legalName}</li>
          <li><strong>Nom commercial :</strong> {company.tradingName}</li>
          <li><strong>Forme juridique :</strong> {company.legalForm}</li>
          <li><strong>SIRET :</strong> {company.siret}</li>
          <li><strong>TVA intracommunautaire :</strong> {company.vatNumber}</li>
          <li>
            <strong>Adresse du siège :</strong> {addr.street}, {addr.postalCode} {addr.city}, {addr.country}
          </li>
          <li><strong>Directeur de la publication :</strong> {company.publicationDirector}</li>
          <li>
            <strong>Contact :</strong>{" "}
            <a href={`mailto:${company.contactEmail}`} className="text-blue-600 hover:underline">
              {company.contactEmail}
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">2. Hébergement</h2>
        <p className="text-slate-600 leading-relaxed mb-4">Le site est hébergé par :</p>
        <ul className="list-none text-slate-600 space-y-2 mb-4">
          <li><strong>Nom commercial :</strong> {company.host.name}</li>
          <li><strong>Raison sociale :</strong> {company.host.legalName}</li>
          <li><strong>Adresse :</strong> {company.host.address}</li>
          <li><strong>Téléphone :</strong> {company.host.phone}</li>
          <li>
            <strong>Site web :</strong>{" "}
            <a
              href={company.host.website}
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {company.host.website}
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">3. Propriété intellectuelle</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          L&apos;ensemble des contenus présents sur le site {brand.productName} (textes, graphismes, images, logos,
          icônes, logiciels, bases de données) est protégé par le droit d&apos;auteur et le droit de la
          propriété intellectuelle, conformément aux dispositions du Code de la propriété intellectuelle.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie
          des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite sauf
          autorisation écrite préalable de l&apos;éditeur.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">4. Limitation de responsabilité</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          L&apos;éditeur s&apos;efforce de fournir des informations exactes et à jour sur le site. Toutefois,
          il ne saurait être tenu responsable des erreurs, omissions ou résultats obtenus par
          l&apos;utilisation de ces informations.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les résultats d&apos;audit SEO fournis par la plateforme sont des recommandations indicatives
          et ne garantissent aucun résultat en termes de référencement ou de positionnement dans les
          moteurs de recherche.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le site peut contenir des liens vers d&apos;autres sites dont l&apos;éditeur ne maîtrise pas
          le contenu. L&apos;éditeur décline toute responsabilité quant au contenu de ces sites tiers.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">5. Données personnelles</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour plus d&apos;informations sur la collecte et le traitement de vos données personnelles,
          veuillez consulter notre{" "}
          <a href="/legal/privacy" className="text-blue-600 hover:underline">
            politique de confidentialité
          </a>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">6. Médiation de la consommation</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          {company.mediator}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">7. Droit applicable</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les présentes mentions légales sont régies par le droit français. En cas de litige, et après
          tentative de résolution amiable, compétence est attribuée aux tribunaux français compétents.
        </p>
      </section>
    </article>
  )
}
