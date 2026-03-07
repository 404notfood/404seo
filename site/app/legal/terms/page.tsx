import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — 404 SEO",
  description: "Conditions générales d'utilisation de la plateforme SaaS 404 SEO.",
}

export default function TermsPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Conditions générales d&apos;utilisation
      </h1>
      <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : 7 mars 2026</p>

      {/* 1. Objet */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">1. Objet</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les présentes conditions générales d&apos;utilisation (ci-après « CGU ») régissent
          l&apos;utilisation de la plateforme <strong>404 SEO</strong>, un service SaaS (Software as
          a Service) d&apos;audit et d&apos;optimisation SEO accessible à l&apos;adresse{" "}
          <a href="https://seo.404notfood.fr" className="text-blue-600 hover:underline">
            https://seo.404notfood.fr
          </a>
          .
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          En créant un compte et en utilisant le service, vous acceptez sans réserve les présentes
          CGU. Si vous n&apos;acceptez pas ces conditions, vous ne devez pas utiliser le service.
        </p>
      </section>

      {/* 2. Description du service */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          2. Description du service
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          404 SEO propose les fonctionnalités suivantes :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>Audit technique et SEO de sites web</li>
          <li>Suivi de positions dans les moteurs de recherche</li>
          <li>Analyse de la concurrence</li>
          <li>Recommandations IA pour l&apos;optimisation SEO</li>
          <li>Gestion du SEO local (Google Business Profile)</li>
          <li>Analyse de backlinks</li>
          <li>Audit de contenu</li>
          <li>Rapports PDF détaillés</li>
          <li>Intégration avec Google Analytics, Google Search Console et Google Business Profile</li>
        </ul>
      </section>

      {/* 3. Accès au service */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          3. Accès au service et inscription
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          L&apos;accès au service nécessite la création d&apos;un compte. Lors de l&apos;inscription,
          vous devez fournir des informations exactes, complètes et à jour (nom, adresse e-mail).
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Vous êtes responsable de la confidentialité de votre mot de passe et de toutes les
          activités réalisées sous votre compte. En cas d&apos;utilisation non autorisée de votre
          compte, vous devez nous en informer immédiatement à{" "}
          <a href="mailto:laurentbwa@gmail.com" className="text-blue-600 hover:underline">
            laurentbwa@gmail.com
          </a>
          .
        </p>
      </section>

      {/* 4. Plans et tarification */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          4. Plans et tarification
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le service est disponible selon les plans suivants :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>Starter</strong> (gratuit) — fonctionnalités de base avec des quotas limités
          </li>
          <li>
            <strong>Pro</strong> (29 €/mois) — fonctionnalités avancées et quotas étendus
          </li>
          <li>
            <strong>Agency</strong> (99 €/mois) — accès complet et quotas illimités
          </li>
        </ul>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les tarifs sont indiqués en euros TTC. L&apos;éditeur se réserve le droit de modifier les
          tarifs à tout moment, les modifications prenant effet au prochain renouvellement de
          l&apos;abonnement.
        </p>
      </section>

      {/* 5. Paiement et abonnement */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          5. Paiement et abonnement
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les paiements sont traités de manière sécurisée par{" "}
          <a
            href="https://stripe.com"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Stripe
          </a>
          . Nous ne stockons aucune information de carte bancaire.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les abonnements sont renouvelés automatiquement chaque mois. Vous pouvez annuler votre
          abonnement à tout moment depuis votre espace client. L&apos;annulation prend effet à la
          fin de la période de facturation en cours.
        </p>
      </section>

      {/* 6. Droit de rétractation */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          6. Droit de rétractation
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Conformément à l&apos;article L.221-28 du Code de la consommation, le droit de
          rétractation ne s&apos;applique pas aux contrats de fourniture de contenu numérique non
          fourni sur un support matériel dont l&apos;exécution a commencé avec l&apos;accord
          préalable exprès du consommateur.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          En accédant immédiatement au service après la souscription, vous renoncez expressément à
          votre droit de rétractation. Toutefois, vous pouvez annuler votre abonnement à tout
          moment pour les périodes futures.
        </p>
      </section>

      {/* 7. Obligations de l'utilisateur */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          7. Obligations de l&apos;utilisateur
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          En utilisant le service, vous vous engagez à :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>Utiliser le service conformément à sa destination et aux présentes CGU</li>
          <li>Ne pas utiliser le service à des fins illégales ou frauduleuses</li>
          <li>Ne pas tenter de contourner les limites de quotas de votre plan</li>
          <li>Ne pas effectuer de scraping abusif ou automatisé du service</li>
          <li>Ne pas auditer des sites sans y être autorisé</li>
          <li>Ne pas tenter d&apos;accéder aux comptes d&apos;autres utilisateurs</li>
          <li>Ne pas surcharger volontairement l&apos;infrastructure du service</li>
        </ul>
      </section>

      {/* 8. Propriété intellectuelle */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          8. Propriété intellectuelle
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le code source, les algorithmes, l&apos;interface utilisateur, les textes, graphismes et
          logos de 404 SEO sont la propriété exclusive de l&apos;éditeur et sont protégés par le
          droit de la propriété intellectuelle.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les rapports d&apos;audit générés par le service appartiennent à l&apos;utilisateur.
          Vous êtes libre de les partager, télécharger et utiliser comme bon vous semble.
        </p>
      </section>

      {/* 9. Limitation de responsabilité */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          9. Limitation de responsabilité
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le service est fourni « en l&apos;état ». L&apos;éditeur ne garantit pas :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            L&apos;obtention de résultats spécifiques en termes de référencement ou de
            positionnement
          </li>
          <li>La disponibilité ininterrompue du service (maintenance, mises à jour)</li>
          <li>L&apos;exactitude absolue des analyses et recommandations fournies</li>
        </ul>
        <p className="text-slate-600 leading-relaxed mb-4">
          En aucun cas, la responsabilité de l&apos;éditeur ne pourra être engagée au-delà du
          montant des sommes versées par l&apos;utilisateur au cours des 12 derniers mois.
        </p>
      </section>

      {/* 10. Données personnelles */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          10. Données personnelles
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Nous nous engageons à protéger vos données personnelles conformément au RGPD. Pour plus
          d&apos;informations, consultez notre{" "}
          <Link href="/legal/privacy" className="text-blue-600 hover:underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </section>

      {/* 11. Suspension et résiliation */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          11. Suspension et résiliation
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          L&apos;éditeur se réserve le droit de suspendre ou résilier l&apos;accès au service, sans
          préavis ni indemnité, en cas de violation des présentes CGU, notamment en cas
          d&apos;utilisation abusive ou frauduleuse.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          L&apos;utilisateur peut supprimer son compte à tout moment depuis les paramètres de son
          espace client. La suppression entraîne l&apos;effacement de toutes les données associées
          dans un délai de 30 jours.
        </p>
      </section>

      {/* 12. Services tiers */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          12. Services tiers
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le service s&apos;intègre avec des services tiers (Google APIs, Stripe). L&apos;utilisation
          de ces services est soumise à leurs propres conditions d&apos;utilisation et politiques de
          confidentialité. L&apos;éditeur ne saurait être tenu responsable du fonctionnement ou de
          la disponibilité de ces services tiers.
        </p>
      </section>

      {/* 13. Droit applicable */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          13. Droit applicable et juridiction
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les présentes CGU sont régies par le droit français. En cas de litige, les parties
          s&apos;engagent à rechercher une solution amiable. À défaut, le litige sera porté devant
          les tribunaux français compétents.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Conformément aux dispositions du Code de la consommation, vous pouvez recourir
          gratuitement au service de médiation de la consommation. Le médiateur à contacter est
          : [À COMPLÉTER].
        </p>
      </section>

      {/* 14. Contact */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">14. Contact</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour toute question relative aux présentes CGU, contactez-nous :
        </p>
        <ul className="list-none text-slate-600 space-y-2 mb-4">
          <li>
            <strong>E-mail :</strong>{" "}
            <a href="mailto:laurentbwa@gmail.com" className="text-blue-600 hover:underline">
              laurentbwa@gmail.com
            </a>
          </li>
        </ul>
      </section>
    </article>
  )
}
