import type { Metadata } from "next"
import Link from "next/link"
import { Building2, Calendar, MapPin, Mail } from "lucide-react"
import { BrandConfig, CompanyConfig } from "@/lib/config"

const brand = BrandConfig.getInstance()
const company = CompanyConfig.getInstance()

export const metadata: Metadata = {
  title: `À propos — ${brand.productName}`,
  description: `Qui édite ${brand.productName}, depuis quand, et pourquoi. Présentation de l'éditeur et de la mission de la plateforme SaaS.`,
  alternates: { canonical: "/about" },
}

interface AboutFact {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly label: string
  readonly value: string
}

const FACTS: ReadonlyArray<AboutFact> = [
  { icon: Building2, label: "Éditeur", value: company.tradingName },
  { icon: Calendar, label: "Lancé en", value: String(company.establishedYear) },
  { icon: MapPin, label: "Basé en", value: company.headquartersAddress.country },
  { icon: Mail, label: "Contact", value: company.contactEmail },
]

export default function AboutPage() {
  return (
    <article>
      <header className="mb-12">
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: "#2563eb" }}
        >
          À propos
        </p>
        <h1 className="text-4xl font-black text-slate-900 mb-4">
          La plateforme {brand.productName}
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">{brand.productTagline}.</p>
      </header>

      {/* ── Faits clés ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {FACTS.map((f) => (
          <div
            key={f.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <f.icon className="h-5 w-5 text-blue-600 mb-2" />
            <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
              {f.label}
            </p>
            <p className="text-sm font-semibold text-slate-900 break-all">{f.value}</p>
          </div>
        ))}
      </section>

      {/* ── Mission ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Notre mission</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Le SEO est un domaine où l&apos;information est partout, mais l&apos;action prioritaire est
          rare. La plupart des outils existants noient leurs utilisateurs sous des dizaines de
          rapports difficiles à interpréter, sans jamais leur dire <em>quoi faire d&apos;abord</em>.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          {brand.productName} a été conçu pour répondre à une question simple : <em>« Si je n&apos;ai
          que 30 minutes à passer sur mon site cette semaine, qu&apos;est-ce qui aura le plus
          d&apos;impact ? »</em>
        </p>
        <p className="text-slate-600 leading-relaxed">
          Nous croisons un crawl technique profond, les données de Google Search Console et
          Analytics, et un moteur d&apos;analyse alimenté par IA pour générer un plan
          d&apos;action priorisé, pas un rapport.
        </p>
      </section>

      {/* ── Approche ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Notre approche</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              title: "Données factuelles uniquement",
              desc: "Nous n'inventons pas de stats marketing. Notre moteur analyse uniquement ce que les APIs Google et notre crawler observent réellement.",
            },
            {
              title: "RGPD et Limited Use par défaut",
              desc: "Vos données et celles de vos clients sont chiffrées, isolées et jamais réutilisées à d'autres fins que la fourniture du service.",
            },
            {
              title: "Multi-tenant strict",
              desc: "Chaque organisation est isolée techniquement et logiquement. Aucune fuite possible entre tenants.",
            },
            {
              title: "Aucun cookie publicitaire",
              desc: "404 SEO n'utilise aucun tracker tiers, aucune analytics externe, aucun pixel marketing.",
            },
          ].map((b) => (
            <div key={b.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-bold text-slate-900 mb-2">{b.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Équipe ── */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">L&apos;équipe</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-900 mb-1">
            {company.publicationDirector}
          </p>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">
            Fondateur & Directeur de la publication
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Développeur et passionné de SEO technique, je conçois et opère {brand.productName}{" "}
            depuis {company.headquartersAddress.country}. La plateforme est exploitée en{" "}
            {company.legalForm.toLowerCase()} (
            <Link href="/legal/mentions-legales" className="text-blue-600 hover:underline">
              voir mentions légales
            </Link>
            ).
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mb-12 rounded-2xl bg-slate-900 p-8 text-white text-center">
        <h2 className="text-2xl font-bold mb-3">Une question ?</h2>
        <p className="text-slate-300 mb-6">
          Nous répondons à toutes les demandes pro sous 48 h ouvrées.
        </p>
        <a
          href={`mailto:${company.contactEmail}`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          <Mail className="h-4 w-4" />
          {company.contactEmail}
        </a>
      </section>
    </article>
  )
}
