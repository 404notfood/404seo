import Image from "next/image"
import Link from "next/link"
import {
  BarChart3,
  Globe,
  Zap,
  Shield,
  TrendingUp,
  Search,
  CheckCircle,
  ArrowRight,
  Star,
  MapPin,
  Link2,
  Bot,
} from "lucide-react"

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Search,
    title: "Audit technique complet",
    desc: "Crawl profond de vos pages : balises, vitesse, structure, Core Web Vitals. Chaque problème est détecté, classé et expliqué.",
    color: "#2563eb",
    bg: "#eff6ff",
  },
  {
    icon: TrendingUp,
    title: "Suivi de positions",
    desc: "Suivez l'évolution de vos mots-clés sur Google jour après jour. Visualisez vos gains et pertes en temps réel.",
    color: "#059669",
    bg: "#ecfdf5",
  },
  {
    icon: Bot,
    title: "Recommandations IA",
    desc: "Notre moteur IA analyse vos audits et génère des actions prioritaires personnalisées pour chaque page de votre site.",
    color: "#06b6d4",
    bg: "#ecfeff",
  },
  {
    icon: MapPin,
    title: "SEO Local & GBP",
    desc: "Gérez votre fiche Google Business Profile, répondez aux avis et publiez des posts directement depuis la plateforme.",
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  {
    icon: Link2,
    title: "Profil de backlinks",
    desc: "Analysez l'autorité de domaine, découvrez vos liens entrants et identifiez les opportunités de netlinking.",
    color: "#ea580c",
    bg: "#fff7ed",
  },
  {
    icon: Globe,
    title: "Analyse concurrents",
    desc: "Comparez votre site face à vos concurrents : scores SEO, mots-clés communs, lacunes de contenu à exploiter.",
    color: "#0f172a",
    bg: "#f8fafc",
  },
]

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Starter",
    price: "Gratuit",
    period: "",
    desc: "Pour tester la plateforme",
    features: ["5 audits / mois", "100 pages / audit", "3 projets", "Backlinks inclus"],
    cta: "Commencer gratuitement",
    highlight: false,
  },
  {
    name: "Pro",
    price: "99",
    period: "€ / mois",
    desc: "Pour les indépendants et freelances",
    features: [
      "100 audits / mois",
      "10 000 pages / audit",
      "20 projets",
      "Suivi de positions",
      "Recommandations IA",
      "Analyse concurrents",
    ],
    cta: "Choisir Pro",
    highlight: true,
  },
  {
    name: "Agency",
    price: "249",
    period: "€ / mois",
    desc: "Pour les agences et équipes",
    features: [
      "Audits illimités",
      "100 000 pages / audit",
      "Projets illimités",
      "SEO Local & GBP",
      "Accès API REST",
      "PDF marque blanche",
    ],
    cta: "Choisir Agency",
    highlight: false,
  },
]

// ── Stats ─────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "+2 000", label: "Sites audités" },
  { value: "98%", label: "Satisfaction client" },
  { value: "4,9 / 5", label: "Note moyenne" },
  { value: "< 30s", label: "Premier résultat" },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "Inter, sans-serif" }}>

      {/* ── Navbar ── */}
      <header
        className="sticky top-0 z-50 border-b border-slate-100"
        style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)" }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Image src="/logo.png" alt="404 SEO" width={120} height={36} className="h-9 w-auto" priority />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Fonctionnalités</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">Tarifs</a>
            <a href="#faq" className="hover:text-slate-900 transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors px-4 py-2"
            >
              Connexion
            </Link>
            <Link
              href="/register"
              className="text-sm font-semibold text-white px-5 py-2 rounded-xl transition-all btn-glow"
              style={{ background: "#2563eb" }}
            >
              Essai gratuit
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
          minHeight: "600px",
        }}
      >
        {/* Grille décorative */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(37,99,235,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Glow bleu */}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }}
        />
        {/* Glow cyan */}
        <div
          className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }}
        />

        <div className="relative max-w-6xl mx-auto px-6 py-24 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-8 text-sm font-medium animate-pulse-cyan"
            style={{ background: "rgba(6,182,212,0.1)", borderColor: "rgba(6,182,212,0.3)", color: "#22d3ee" }}
          >
            <Zap className="h-3.5 w-3.5" />
            Plateforme SEO tout-en-un
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight tracking-tight">
            Dominez Google
            <span
              className="block"
              style={{ background: "linear-gradient(90deg, #2563eb, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              avec l`&apos;`IA
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            Auditez, analysez et optimisez votre site avec une précision chirurgicale.
            Recommandations IA, suivi temps réel, rapports PDF marque blanche.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all btn-glow shadow-lg"
              style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
            >
              Commencer gratuitement
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Voir les fonctionnalités
            </a>
          </div>

          {/* Social proof mini */}
          <div className="mt-12 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <div className="flex -space-x-2">
              {["#2563eb", "#06b6d4", "#7c3aed", "#059669"].map((c, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-slate-700 flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: c }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span>Noté 4,9/5 par +200 utilisateurs</span>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black text-slate-900 mb-1">{s.value}</p>
                <p className="text-sm text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#2563eb" }}>
              Fonctionnalités
            </p>
            <h2 className="text-4xl font-black text-slate-900 mb-4">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              Une plateforme complète pour auditer, surveiller et optimiser votre présence sur les moteurs de recherche.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: f.bg }}
                >
                  <f.icon className="h-5 w-5" style={{ color: f.color }} />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#2563eb" }}>
              En 3 étapes
            </p>
            <h2 className="text-4xl font-black text-slate-900 mb-4">Comment ça marche ?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                n: "01",
                title: "Créez votre projet",
                desc: "Ajoutez votre domaine en 30 secondes. Pas de plugin, pas d'accès FTP requis.",
                icon: Globe,
              },
              {
                n: "02",
                title: "Lancez un audit",
                desc: "Notre crawler analyse votre site en profondeur et génère un rapport détaillé en moins d'une minute.",
                icon: BarChart3,
              },
              {
                n: "03",
                title: "Corrigez & montez",
                desc: "Suivez les recommandations priorisées par l'IA et mesurez l'impact de chaque correction.",
                icon: TrendingUp,
              },
            ].map((step) => (
              <div key={step.n} className="text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: "linear-gradient(135deg, #eff6ff, #dbeafe)" }}
                >
                  <step.icon className="h-7 w-7" style={{ color: "#2563eb" }} />
                </div>
                <p className="text-xs font-bold tracking-widest mb-2" style={{ color: "#2563eb" }}>
                  ÉTAPE {step.n}
                </p>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{step.title}</h3>
                <p className="text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#2563eb" }}>
              Tarifs
            </p>
            <h2 className="text-4xl font-black text-slate-900 mb-4">Simple et transparent</h2>
            <p className="text-lg text-slate-500">
              Commencez gratuitement, évoluez quand vous êtes prêt.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="relative rounded-2xl p-6 flex flex-col"
                style={{
                  background: plan.highlight
                    ? "linear-gradient(135deg, #0f172a, #1e3a5f)"
                    : "white",
                  border: plan.highlight
                    ? "1px solid #2563eb"
                    : "1px solid #e2e8f0",
                  boxShadow: plan.highlight
                    ? "0 20px 60px rgba(37,99,235,0.25)"
                    : "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span
                      className="text-xs font-bold text-white px-4 py-1 rounded-full"
                      style={{ background: "linear-gradient(90deg, #2563eb, #06b6d4)" }}
                    >
                      Populaire
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3
                    className="text-lg font-bold mb-1"
                    style={{ color: plan.highlight ? "white" : "#0f172a" }}
                  >
                    {plan.name}
                  </h3>
                  <p className="text-sm mb-4" style={{ color: plan.highlight ? "#94a3b8" : "#64748b" }}>
                    {plan.desc}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-4xl font-black"
                      style={{ color: plan.highlight ? "white" : "#0f172a" }}
                    >
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-sm" style={{ color: plan.highlight ? "#94a3b8" : "#64748b" }}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle
                        className="h-4 w-4 flex-shrink-0"
                        style={{ color: plan.highlight ? "#06b6d4" : "#059669" }}
                      />
                      <span style={{ color: plan.highlight ? "#cbd5e1" : "#475569" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className="w-full py-3 rounded-xl text-sm font-bold text-center transition-all"
                  style={
                    plan.highlight
                      ? {
                          background: "linear-gradient(135deg, #2563eb, #06b6d4)",
                          color: "white",
                        }
                      : {
                          background: "#f1f5f9",
                          color: "#0f172a",
                          border: "1px solid #e2e8f0",
                        }
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#2563eb" }}>
              FAQ
            </p>
            <h2 className="text-4xl font-black text-slate-900">Questions fréquentes</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "Ai-je besoin d'accès à mon serveur ou CMS ?",
                a: "Non. 404 SEO crawle votre site comme Googlebot, depuis l'extérieur. Aucune installation de plugin ni accès FTP requis.",
              },
              {
                q: "Combien de temps dure un audit ?",
                a: "Un audit de 100 pages prend généralement moins de 30 secondes. Pour des sites plus larges, comptez quelques minutes.",
              },
              {
                q: "Puis-je annuler mon abonnement à tout moment ?",
                a: "Oui, sans engagement. Vous pouvez annuler depuis votre espace client à tout moment, sans frais.",
              },
              {
                q: "Les rapports PDF sont-ils personnalisables ?",
                a: "Sur les plans Pro et Agency, vous pouvez activer la marque blanche pour apposer votre logo et vos couleurs sur les PDF.",
              },
              {
                q: "L'API est-elle disponible ?",
                a: "L'accès à l'API REST est inclus dans le plan Agency. Elle permet d'intégrer les audits dans vos propres outils.",
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer font-semibold text-slate-900 hover:bg-slate-50 transition-colors">
                  {item.q}
                  <span className="ml-4 text-slate-400 text-lg group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-6 pb-5 text-slate-500 text-sm leading-relaxed border-t border-slate-100">
                  <div className="pt-4">{item.a}</div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section className="py-24" style={{ background: "linear-gradient(135deg, #0f172a, #1e3a5f)" }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="mb-6 flex justify-center">
            <Image src="/logo.png" alt="404 SEO" width={100} height={30} className="h-10 w-auto brightness-0 invert" />
          </div>
          <h2 className="text-4xl font-black text-white mb-4">
            Prêt à propulser votre SEO ?
          </h2>
          <p className="text-lg text-slate-300 mb-10">
            Rejoignez des centaines de professionnels qui font confiance à 404 SEO.
            Commencez gratuitement, sans carte bancaire.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-2xl text-base font-bold text-white transition-all btn-glow"
            style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
          >
            Créer mon compte gratuit
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <Image src="/logo.png" alt="404 SEO" width={100} height={30} className="h-8 w-auto" />
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} 404 SEO · Tous droits réservés ·{" "}
            <a href="mailto:laurentbwa@gmail.com" className="hover:text-slate-600 transition-colors">
              Contact
            </a>
          </p>
          <div className="flex items-center gap-5 text-sm text-slate-400">
            <Link href="/login" className="hover:text-slate-600 transition-colors">Connexion</Link>
            <Link href="/register" className="hover:text-slate-600 transition-colors">Inscription</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
