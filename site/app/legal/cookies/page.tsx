import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Politique des cookies — 404 SEO",
  description: "Politique des cookies de la plateforme 404 SEO.",
}

export default function CookiePolicyPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Politique des cookies</h1>
      <p className="text-sm text-slate-400 mb-10">Dernière mise à jour : 7 mars 2026</p>

      {/* 1. Qu'est-ce qu'un cookie ? */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          1. Qu&apos;est-ce qu&apos;un cookie ?
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Un cookie est un petit fichier texte déposé sur votre terminal (ordinateur, tablette,
          smartphone) lors de la visite d&apos;un site web. Il permet au site de mémoriser certaines
          informations relatives à votre visite, afin de faciliter vos visites ultérieures et de
          rendre le site plus fonctionnel.
        </p>
      </section>

      {/* 2. Cookies utilisés */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          2. Cookies utilisés par 404 SEO
        </h2>
        <p className="text-slate-600 leading-relaxed mb-6">
          404 SEO utilise <strong>uniquement des cookies strictement nécessaires</strong> au
          fonctionnement du service. Nous n&apos;utilisons aucun cookie publicitaire, de suivi
          comportemental ni d&apos;analyse tierce.
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Nom du cookie</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Finalité</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Durée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-3 text-slate-600">
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    better-auth.session_token
                  </code>
                </td>
                <td className="px-4 py-3 text-slate-600">Essentiel</td>
                <td className="px-4 py-3 text-slate-600">
                  Maintenir votre session de connexion et vous authentifier de manière sécurisée.
                </td>
                <td className="px-4 py-3 text-slate-600">7 jours</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-slate-600">
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    better-auth.session_cache
                  </code>
                </td>
                <td className="px-4 py-3 text-slate-600">Essentiel</td>
                <td className="px-4 py-3 text-slate-600">
                  Cache de vérification de session pour réduire les requêtes au serveur.
                </td>
                <td className="px-4 py-3 text-slate-600">5 minutes</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-slate-500 text-sm mt-4 mb-4">
          <strong>Note :</strong> en environnement HTTPS, les cookies sont automatiquement préfixés
          par <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">__Secure-</code> pour
          une sécurité renforcée.
        </p>
      </section>

      {/* 3. Cookies strictement nécessaires */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          3. Cookies strictement nécessaires
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Les cookies listés ci-dessus sont <strong>strictement nécessaires</strong> au
          fonctionnement du service. Ils permettent :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>De vous identifier après connexion et de maintenir votre session active</li>
          <li>De sécuriser l&apos;accès à votre espace utilisateur</li>
          <li>D&apos;optimiser les performances en évitant des vérifications répétées</li>
        </ul>
        <p className="text-slate-600 leading-relaxed mb-4">
          Conformément à la réglementation CNIL, les cookies strictement nécessaires au
          fonctionnement du service <strong>ne requièrent pas votre consentement préalable</strong>.
          Ils sont exemptés de l&apos;obligation de recueil du consentement (article 82 de la loi
          Informatique et Libertés).
        </p>
      </section>

      {/* 4. Cookies tiers */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          4. Cookies tiers
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          404 SEO n&apos;utilise <strong>aucun cookie tiers</strong> (pas de Google Analytics, pas
          de Facebook Pixel, pas de cookies publicitaires).
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Lors du processus de paiement, vous pouvez être redirigé vers Stripe qui peut utiliser ses
          propres cookies dans le cadre de la sécurisation du paiement. Ces cookies sont régis par la{" "}
          <a
            href="https://stripe.com/fr/cookie-settings"
            className="text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            politique de cookies de Stripe
          </a>
          .
        </p>
      </section>

      {/* 5. Gestion des cookies */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">
          5. Comment gérer les cookies
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Vous pouvez configurer votre navigateur pour refuser les cookies. Veuillez noter que la
          désactivation des cookies de session <strong>empêchera votre connexion</strong> au service.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Voici comment gérer les cookies dans les principaux navigateurs :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            <strong>Google Chrome :</strong> Paramètres → Confidentialité et sécurité → Cookies et
            autres données des sites
          </li>
          <li>
            <strong>Mozilla Firefox :</strong> Paramètres → Vie privée et sécurité → Cookies et
            données de sites
          </li>
          <li>
            <strong>Safari :</strong> Préférences → Confidentialité → Gérer les données de sites
            web
          </li>
          <li>
            <strong>Microsoft Edge :</strong> Paramètres → Cookies et autorisations de sites →
            Gérer et supprimer les cookies
          </li>
        </ul>
      </section>

      {/* 6. En savoir plus */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">6. En savoir plus</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour plus d&apos;informations sur les cookies et vos droits, consultez :
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
          <li>
            Le site de la{" "}
            <a
              href="https://www.cnil.fr/fr/cookies-et-autres-traceurs"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              CNIL — Cookies et traceurs
            </a>
          </li>
          <li>
            Notre{" "}
            <Link href="/legal/privacy" className="text-blue-600 hover:underline">
              politique de confidentialité
            </Link>
          </li>
        </ul>
      </section>

      {/* 7. Contact */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mt-10 mb-4">7. Contact</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Pour toute question relative aux cookies, contactez-nous à{" "}
          <a href="mailto:laurentbwa@gmail.com" className="text-blue-600 hover:underline">
            laurentbwa@gmail.com
          </a>
          .
        </p>
      </section>
    </article>
  )
}
