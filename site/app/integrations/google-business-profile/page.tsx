import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, XCircle, Lock, RotateCcw, ShieldCheck, ArrowRight } from "lucide-react"
import {
  BrandConfig,
  CompanyConfig,
  GoogleScopeCatalog,
  AccessLevel,
  type GoogleScopeDescriptor,
} from "@/lib/config"

const brand = BrandConfig.getInstance()
const company = CompanyConfig.getInstance()
const scopes = GoogleScopeCatalog.getInstance()

const accessLabel: Record<AccessLevel, string> = {
  [AccessLevel.ReadOnly]: "Lecture seule",
  [AccessLevel.ReadWrite]: "Lecture et écriture",
  [AccessLevel.Identity]: "Identité",
}

const accessBadgeColor: Record<AccessLevel, { bg: string; text: string }> = {
  [AccessLevel.ReadOnly]: { bg: "#ecfdf5", text: "#059669" },
  [AccessLevel.ReadWrite]: { bg: "#fef3c7", text: "#b45309" },
  [AccessLevel.Identity]: { bg: "#eff6ff", text: "#2563eb" },
}

export const metadata: Metadata = {
  title: `Intégration Google Business Profile — ${brand.productName}`,
  description: `Comment ${brand.productName} se connecte à Google Business Profile : scopes, données accédées, sécurité, conformité Limited Use.`,
  alternates: { canonical: "/integrations/google-business-profile" },
  openGraph: {
    title: `Intégration Google Business Profile — ${brand.productName}`,
    description: `Documentation publique de l'intégration GBP de ${brand.productName} : scopes, conformité, sécurité.`,
    type: "article",
  },
}

function ScopeCard({ scope }: { scope: GoogleScopeDescriptor }) {
  const badge = accessBadgeColor[scope.accessLevel]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <h3 className="text-lg font-bold text-slate-900">{scope.name}</h3>
        <span
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={{ background: badge.bg, color: badge.text }}
        >
          {accessLabel[scope.accessLevel]}
        </span>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed mb-4">{scope.purpose}</p>

      <div className="rounded-lg bg-slate-50 px-4 py-3 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Scope OAuth
        </p>
        <code className="text-xs text-slate-700 break-all">{scope.scope}</code>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
            Ce que nous lisons
          </p>
          <ul className="space-y-1.5">
            {scope.dataAccessed.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-2">
            Ce que nous ne touchons pas
          </p>
          <ul className="space-y-1.5">
            {scope.dataNotAccessed.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm text-slate-600">
                <XCircle className="h-4 w-4 text-rose-500 mt-0.5 flex-shrink-0" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function GoogleBusinessProfileIntegrationPage() {
  const gbpScope = scopes.getGbpScope()
  const otherScopes = scopes.scopes.filter((s) => s !== gbpScope)

  return (
    <article>
      <header className="mb-12">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: "#2563eb" }}
        >
          Intégration officielle
        </p>
        <h1 className="text-4xl font-black text-slate-900 mb-4">
          Google Business Profile dans {brand.productName}
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed max-w-3xl">
          Cette page documente publiquement comment {brand.productName} se connecte à votre compte
          Google Business Profile : quels scopes sont demandés, quelles données sont lues ou écrites,
          comment vous gardez la main, et comment nous respectons les exigences{" "}
          <strong>Limited Use</strong> de Google.
        </p>
      </header>

      {/* ── Pourquoi connecter ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Pourquoi connecter votre compte Google Business Profile ?
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              title: "Gérer plusieurs fiches au même endroit",
              desc: "Pour les agences SEO et les pros multi-sites : une vue centralisée sur toutes vos fiches GBP autorisées.",
            },
            {
              title: "Répondre aux avis sans changer d'onglet",
              desc: "Recevez les nouveaux avis et répondez-y directement depuis l'interface de 404 SEO.",
            },
            {
              title: "Publier des posts GBP",
              desc: "Programmez et publiez des posts (offres, événements, actualités) sur vos fiches GBP.",
            },
            {
              title: "Suivre l'impact local sur le SEO",
              desc: "Croisez les statistiques GBP (vues, recherches, appels) avec vos audits techniques.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 p-5 bg-slate-50"
            >
              <h3 className="font-bold text-slate-900 mb-2">{item.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Scope GBP ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Scope Google Business Profile</h2>
        <p className="text-slate-500 mb-6">
          C&apos;est le scope au cœur de votre demande. Détail complet de ce qu&apos;il autorise et
          de ce que nous en faisons.
        </p>
        <ScopeCard scope={gbpScope} />
      </section>

      {/* ── Autres scopes ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Autres scopes Google demandés</h2>
        <p className="text-slate-500 mb-6">
          {brand.productName} se connecte à d&apos;autres APIs Google strictement liées à
          l&apos;analyse SEO. Aucun scope superflu n&apos;est demandé.
        </p>
        <div className="space-y-4">
          {otherScopes.map((s) => (
            <ScopeCard key={s.scope} scope={s} />
          ))}
        </div>
      </section>

      {/* ── Limited Use ── */}
      <section className="mb-12 rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start gap-3 mb-3">
          <ShieldCheck className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <h2 className="text-2xl font-bold text-slate-900">
            Conformité Google API Services User Data Policy
          </h2>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed mb-3">
          <strong>{brand.productName}</strong>&apos;s use and transfer to any other app of
          information received from Google APIs will adhere to{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-blue-700 hover:underline font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the <strong>Limited Use</strong> requirements.
        </p>
        <p className="text-sm text-slate-700 leading-relaxed mb-2">
          Concrètement :
        </p>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              Les données obtenues via les APIs Google sont utilisées <strong>uniquement</strong>{" "}
              pour fournir les fonctionnalités SEO de la plateforme.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>Aucun transfert à des tiers, sauf obligation légale.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>Aucun usage publicitaire, aucune vente, aucune location.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              Aucune lecture humaine des données utilisateur, sauf consentement explicite, obligation
              légale ou besoin de support technique.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>
              Les données ne sont pas utilisées pour entraîner des modèles d&apos;apprentissage
              automatique généralisés.
            </span>
          </li>
        </ul>
      </section>

      {/* ── Sécurité ── */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-6">
          <Lock className="h-6 w-6 text-slate-700" />
          <h2 className="text-2xl font-bold text-slate-900">Sécurité des tokens et des données</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              title: "Tokens chiffrés au repos",
              desc: "Les tokens OAuth Google sont chiffrés en base de données. Personne dans l'équipe ne peut les lire en clair.",
            },
            {
              title: "Communication HTTPS/TLS exclusive",
              desc: "Toutes les communications avec les APIs Google et avec votre navigateur passent par TLS.",
            },
            {
              title: "Isolation multi-tenant",
              desc: "Chaque utilisateur (et son organisation) est strictement isolé. Vos fiches GBP ne sont jamais accessibles à un autre tenant.",
            },
            {
              title: "Refresh token automatique",
              desc: "Nous renouvelons les access tokens automatiquement, sans vous redemander votre consentement, sauf si vous l'avez révoqué.",
            },
            {
              title: "Audit logs internes",
              desc: "Toutes les actions effectuées sur vos fiches GBP via 404 SEO sont tracées (qui, quand, quoi) et accessibles dans votre espace.",
            },
            {
              title: "Suppression à la déconnexion",
              desc: "Dès que vous déconnectez votre compte Google depuis 404 SEO, les tokens sont révoqués côté Google et supprimés côté serveur.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 p-4 bg-white">
              <h3 className="font-semibold text-slate-900 mb-1.5">{item.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Révocation ── */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <RotateCcw className="h-6 w-6 text-slate-700" />
          <h2 className="text-2xl font-bold text-slate-900">Comment révoquer l&apos;accès</h2>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-5 bg-white">
            <h3 className="font-bold text-slate-900 mb-2">
              Option 1 — Depuis {brand.productName}
            </h3>
            <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
              <li>Connectez-vous à votre espace</li>
              <li>
                Allez dans <strong>Paramètres → Intégrations → Google</strong>
              </li>
              <li>
                Cliquez sur <strong>Déconnecter mon compte Google</strong>
              </li>
            </ol>
            <p className="text-sm text-slate-500 mt-3">
              Effet : le refresh token est révoqué côté Google, l&apos;access token est invalidé,
              et tous les tokens stockés sont supprimés de notre base.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-5 bg-white">
            <h3 className="font-bold text-slate-900 mb-2">Option 2 — Depuis Google directement</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Vous pouvez révoquer l&apos;accès à tout moment depuis votre{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                page « Applications tierces ayant accès à votre compte »
              </a>
              . Cherchez {brand.productName} dans la liste et cliquez sur « Supprimer l&apos;accès ».
            </p>
          </div>
        </div>
      </section>

      {/* ── Engagements ── */}
      <section className="mb-12 rounded-2xl bg-slate-900 p-8 text-white">
        <h2 className="text-2xl font-bold mb-6">Nos engagements</h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          {[
            "Aucune action GBP n'est effectuée sans déclenchement explicite de votre part",
            "Vous restez seul propriétaire de vos fiches Google Business Profile",
            "Aucun partage des données GBP avec des tiers, jamais",
            "Aucun usage publicitaire des données Google",
            "Aucun stockage prolongé : les données sont rafraîchies depuis l'API à chaque consultation",
            "404 SEO n'est pas affilié à Google et n'est pas un service Google officiel",
          ].map((commitment) => (
            <div key={commitment} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>{commitment}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Liens connexes ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Pour aller plus loin</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Link
            href="/legal/privacy"
            className="rounded-xl border border-slate-200 p-4 bg-white hover:border-blue-300 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900 mb-1">Politique de confidentialité</p>
            <p className="text-xs text-slate-500">RGPD, durées de conservation, droits</p>
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-2">
              Lire <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
          <Link
            href="/legal/terms"
            className="rounded-xl border border-slate-200 p-4 bg-white hover:border-blue-300 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900 mb-1">CGU</p>
            <p className="text-xs text-slate-500">Conditions générales d&apos;utilisation</p>
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-2">
              Lire <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
          <Link
            href="/legal/mentions-legales"
            className="rounded-xl border border-slate-200 p-4 bg-white hover:border-blue-300 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900 mb-1">Mentions légales</p>
            <p className="text-xs text-slate-500">Éditeur, hébergeur, juridiction</p>
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 mt-2">
              Lire <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── Contact ── */}
      <section className="mb-12 rounded-xl border border-slate-200 p-6 bg-slate-50">
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Une question sur l&apos;intégration ?
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Pour toute question sur l&apos;usage des données Google ou un audit de conformité,
          contactez l&apos;équipe à{" "}
          <a
            href={`mailto:${company.privacyEmail}`}
            className="text-blue-600 hover:underline font-medium"
          >
            {company.privacyEmail}
          </a>
          .
        </p>
      </section>
    </article>
  )
}
