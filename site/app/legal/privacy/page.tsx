import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Politique de confidentialité — 404 SEO",
  description:
    "Politique de confidentialité et protection des données personnelles (RGPD) de la plateforme 404 SEO.",
}

export default function PrivacyPolicyPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Politique de confidentialité</h1>
      <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : 7 mars 2026</p>

      <p className="text-slate-600 leading-relaxed mb-6">
        La présente politique de confidentialité décrit la manière dont <strong>404 SEO</strong>{" "}
        collecte, utilise, stocke et protège vos données personnelles dans le cadre de
        l&apos;utilisation de notre plateforme SaaS d&apos;audit SEO, conformément au Règlement
        Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et à la loi
        Informatique et Libertés.
      </p>

      {/* 1. Responsable du traitement */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          1. Responsable du traitement
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le responsable du traitement des données est :
        </p>
        <ul className="list-none text-slate-600 space-y-2 mb-4">
          <li><strong>Service :</strong> 404 SEO</li>
          <li><strong>Responsable :</strong> Laurent</li>
          <li>
            <strong>Contact :</strong>{" "}
            <a href="mailto:laurentbwa@gmail.com" className="text-blue-600 hover:underline">
              laurentbwa@gmail.com
            </a>
          </li>
        </ul>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour toute question relative à la protection de vos données, vous pouvez nous contacter à
          l&apos;adresse ci-dessus.
        </p>
      </section>

      {/* 2. Données collectées */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          2. Données personnelles collectées
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Dans le cadre de l&apos;utilisation de notre service, nous collectons les données suivantes :
        </p>

        <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
          a) Données de compte
        </h3>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>Nom et prénom</li>
          <li>Adresse e-mail</li>
          <li>Mot de passe (stocké sous forme hashée, jamais en clair)</li>
          <li>Rôle au sein de l&apos;organisation (administrateur, membre)</li>
        </ul>

        <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
          b) Données d&apos;utilisation
        </h3>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>URLs des sites audités</li>
          <li>Résultats d&apos;audit et scores SEO</li>
          <li>Projets créés et configurations</li>
          <li>Adresse IP et user-agent (logs serveur)</li>
        </ul>

        <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
          c) Données de facturation
        </h3>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les paiements sont gérés exclusivement par{" "}
          <a href="https://stripe.com/fr/privacy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
            Stripe
          </a>.
          Nous ne stockons jamais vos numéros de carte bancaire. Nous conservons uniquement
          l&apos;identifiant client Stripe et le statut de votre abonnement.
        </p>

        <h3 className="text-lg font-medium text-slate-800 mt-6 mb-3">
          d) Données Google APIs
        </h3>
        <p className="text-slate-600 leading-relaxed mb-4">
          Si vous choisissez de connecter votre compte Google, nous accédons aux données suivantes
          via les APIs Google, avec votre consentement explicite :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>Google Analytics (GA4)</strong> — données de trafic en lecture seule
            (<code className="text-sm bg-slate-100 px-1.5 py-0.5 rounded">analytics.readonly</code>)
          </li>
          <li>
            <strong>Google Search Console</strong> — données de recherche en lecture seule
            (<code className="text-sm bg-slate-100 px-1.5 py-0.5 rounded">webmasters.readonly</code>)
          </li>
          <li>
            <strong>Google Business Profile</strong> — gestion des fiches établissements
            (<code className="text-sm bg-slate-100 px-1.5 py-0.5 rounded">business.manage</code>)
          </li>
          <li>
            <strong>Adresse e-mail Google</strong> — identification du compte connecté
            (<code className="text-sm bg-slate-100 px-1.5 py-0.5 rounded">userinfo.email</code>)
          </li>
        </ul>
      </section>

      {/* 3. Finalités */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          3. Finalités du traitement
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Vos données sont collectées et traitées pour les finalités suivantes :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>Création et gestion de votre compte utilisateur</li>
          <li>Fourniture du service d&apos;audit et d&apos;analyse SEO</li>
          <li>Gestion des abonnements et de la facturation</li>
          <li>Intégration des données Google (Analytics, Search Console, Business Profile)</li>
          <li>Amélioration continue du service et correction des bugs</li>
          <li>Communication relative à votre compte (notifications, alertes)</li>
          <li>Respect de nos obligations légales</li>
        </ul>
      </section>

      {/* 4. Base légale */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          4. Base légale du traitement
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Conformément à l&apos;article 6 du RGPD, nos traitements reposent sur :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>L&apos;exécution du contrat</strong> (article 6.1.b) — pour la fourniture du
            service SaaS, la gestion de votre compte et la facturation
          </li>
          <li>
            <strong>Votre consentement</strong> (article 6.1.a) — pour la connexion de votre
            compte Google et l&apos;accès à vos données via les APIs Google
          </li>
          <li>
            <strong>L&apos;intérêt légitime</strong> (article 6.1.f) — pour les logs de sécurité
            et l&apos;amélioration du service
          </li>
        </ul>
      </section>

      {/* 5. Google API Services */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          5. Utilisation des données Google API Services
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          L&apos;utilisation et le transfert d&apos;informations reçues des APIs Google par 404 SEO
          sont conformes à la{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , y compris les exigences d&apos;utilisation limitée (Limited Use requirements).
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">En particulier :</p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            Les données obtenues via les APIs Google sont utilisées <strong>uniquement</strong> pour
            fournir les fonctionnalités SEO de la plateforme (affichage des statistiques Analytics,
            données Search Console, gestion des fiches Google Business Profile)
          </li>
          <li>
            Nous ne transférons pas ces données à des tiers, sauf obligation légale
          </li>
          <li>
            Nous n&apos;utilisons pas ces données à des fins publicitaires
          </li>
          <li>
            Nous ne vendons pas et ne louons pas vos données Google
          </li>
          <li>
            Vous pouvez révoquer l&apos;accès à tout moment depuis les paramètres de votre compte
            ou depuis votre{" "}
            <a
              href="https://myaccount.google.com/permissions"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              compte Google
            </a>
          </li>
        </ul>
      </section>

      {/* 6. Partage des données */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          6. Partage des données
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Nous ne vendons jamais vos données personnelles. Vos données peuvent être partagées
          uniquement avec les sous-traitants suivants, strictement nécessaires au fonctionnement
          du service :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>Stripe</strong> — traitement des paiements (
            <a href="https://stripe.com/fr/privacy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              politique de confidentialité Stripe
            </a>)
          </li>
          <li>
            <strong>Google APIs</strong> — intégration Analytics, Search Console et Business Profile
          </li>
          <li>
            <strong>Hébergeur</strong> — stockage des données sur serveur sécurisé [À COMPLÉTER]
          </li>
        </ul>
      </section>

      {/* 7. Durée de conservation */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          7. Durée de conservation
        </h2>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>Données de compte</strong> — conservées tant que le compte est actif, puis 3 ans
            après la dernière connexion
          </li>
          <li>
            <strong>Données d&apos;audit</strong> — conservées 12 mois après leur génération
          </li>
          <li>
            <strong>Logs serveur</strong> — conservés 6 mois
          </li>
          <li>
            <strong>Tokens Google</strong> — révoqués et supprimés dès la déconnexion du compte
            Google depuis les paramètres
          </li>
          <li>
            <strong>Données de facturation</strong> — conservées conformément aux obligations
            comptables et fiscales (10 ans)
          </li>
        </ul>
      </section>

      {/* 8. Transferts hors UE */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          8. Transferts de données hors UE
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Certains de nos sous-traitants sont basés aux États-Unis. Ces transferts sont encadrés par
          des clauses contractuelles types (SCCs) conformément aux exigences du RGPD :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>Stripe Inc.</strong> — encadré par le Data Privacy Framework (DPF) et des SCCs
          </li>
          <li>
            <strong>Google LLC</strong> — encadré par le Data Privacy Framework (DPF) et des SCCs
          </li>
        </ul>
      </section>

      {/* 9. Droits des utilisateurs */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          9. Vos droits (RGPD)
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Conformément aux articles 13 à 21 du RGPD, vous disposez des droits suivants :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li><strong>Droit d&apos;accès</strong> — obtenir une copie de vos données personnelles</li>
          <li><strong>Droit de rectification</strong> — corriger des données inexactes</li>
          <li><strong>Droit à l&apos;effacement</strong> — demander la suppression de vos données</li>
          <li><strong>Droit à la portabilité</strong> — recevoir vos données dans un format structuré</li>
          <li><strong>Droit à la limitation</strong> — restreindre le traitement de vos données</li>
          <li><strong>Droit d&apos;opposition</strong> — vous opposer au traitement de vos données</li>
          <li><strong>Droit de retrait du consentement</strong> — retirer votre consentement à tout moment</li>
        </ul>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour exercer ces droits, contactez-nous à{" "}
          <a href="mailto:laurentbwa@gmail.com" className="text-blue-600 hover:underline">
            laurentbwa@gmail.com
          </a>
          . Nous répondrons dans un délai d&apos;un mois.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Vous disposez également du droit d&apos;introduire une réclamation auprès de la{" "}
          <a
            href="https://www.cnil.fr/fr/plaintes"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Commission Nationale de l&apos;Informatique et des Libertés (CNIL)
          </a>
          .
        </p>
      </section>

      {/* 10. Cookies */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">10. Cookies</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Notre site utilise uniquement des cookies essentiels au fonctionnement du service.
          Pour en savoir plus, consultez notre{" "}
          <Link href="/legal/cookies" className="text-blue-600 hover:underline">
            politique des cookies
          </Link>
          .
        </p>
      </section>

      {/* 11. Sécurité */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          11. Sécurité des données
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger
          vos données :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>Communication chiffrée via HTTPS/TLS</li>
          <li>Mots de passe hashés (jamais stockés en clair)</li>
          <li>Tokens d&apos;accès Google stockés de manière sécurisée en base de données</li>
          <li>Accès restreint aux données de production</li>
          <li>Validation anti-SSRF sur toutes les URLs crawlées</li>
        </ul>
      </section>

      {/* 12. Modifications */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          12. Modifications de cette politique
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Nous nous réservons le droit de modifier cette politique de confidentialité à tout moment.
          En cas de modification substantielle, nous vous en informerons par e-mail ou par une
          notification sur la plateforme. La date de dernière mise à jour est indiquée en haut de
          cette page.
        </p>
      </section>

      {/* 13. Contact */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">13. Contact</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour toute question relative à cette politique de confidentialité ou à vos données
          personnelles, contactez-nous :
        </p>
        <ul className="list-none text-slate-600 space-y-2 mb-4">
          <li>
            <strong>E-mail :</strong>{" "}
            <a href="mailto:laurentbwa@gmail.com" className="text-blue-600 hover:underline">
              laurentbwa@gmail.com
            </a>
          </li>
          <li>
            <strong>Adresse :</strong> [À COMPLÉTER]
          </li>
        </ul>
      </section>
    </article>
  )
}
