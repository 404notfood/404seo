"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Radar,
  FolderOpen,
  Settings,
  CreditCard,
  LogOut,
  Zap,
  FileSearch,
  BarChart3,
  Globe,
  Sparkles,
  TrendingUp,
  Link2,
  FileText,
  ChevronRight,
  Search,
  Bug,
  Gauge,
  Eye,
  Bot,
  Target,
  Lightbulb,
  PenTool,
  GitCompare,
  CalendarDays,
  MapPin,
  Store,
  Star,
  MessageSquare,
  Map,
  ChevronsUpDown,
  Layers,
  ShieldAlert,
  Users,
  Building2,
  Sun,
  Moon,
} from "lucide-react"
import { signOut, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useRole } from "@/hooks/useMe"
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { useState, useCallback, useRef, useEffect } from "react"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"
import { useTheme } from "next-themes"

// ── Types ────────────────────────────────────────
interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  badge?: string
  badgeColor?: string
  disabled?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
  collapsible?: boolean
  defaultOpen?: boolean
}

// ── Navigation structure (inspirée Semrush) ──────
const sections: NavSection[] = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/projects", label: "Projets", icon: FolderOpen },
    ],
  },
  {
    title: "Audit & SEO technique",
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/audits", label: "Audits de site", icon: Radar },
      { href: "/audits/compare", label: "Comparer", icon: GitCompare },
      { href: "/scheduled", label: "Audits planifiés", icon: CalendarDays },
      { href: "/issues", label: "Problèmes & Erreurs", icon: Bug },
      { href: "/performance", label: "Vitesse & Performance", icon: Gauge },
      { href: "/on-page", label: "Analyse on-page", icon: FileSearch },
    ],
  },
  {
    title: "Recherche & Visibilité",
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/rank-tracking", label: "Suivi de position", icon: TrendingUp, badge: "Bientôt", badgeColor: "#7c3aed" },
      { href: "/keywords", label: "Recherche de mots-clés", icon: Search },
      { href: "/competitors", label: "Analyse concurrents", icon: Target, badge: "Bientôt", badgeColor: "#7c3aed" },
      { href: "/ai-visibility", label: "Visibilité IA", icon: Eye, badge: "Bientôt", badgeColor: "#7c3aed" },
    ],
  },
  {
    title: "Contenu & Liens",
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/content-audit", label: "Audit de contenu", icon: PenTool },
      { href: "/backlinks", label: "Backlinks", icon: Link2, badge: "Bientôt", badgeColor: "#7c3aed" },
      { href: "/reports", label: "Rapports PDF", icon: FileText },
      { href: "/stats", label: "Statistiques", icon: BarChart3 },
    ],
  },
  {
    title: "Intelligence IA",
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/ai-recommendations", label: "Recommandations IA", icon: Sparkles, badge: "IA", badgeColor: "#06b6d4" },
      { href: "/ai-agent", label: "Agent IA SEO", icon: Bot, badge: "IA", badgeColor: "#06b6d4" },
      { href: "/suggestions", label: "Suggestions d'action", icon: Lightbulb },
      { href: "/optimization", label: "Optimisation globale", icon: Globe },
    ],
  },
  {
    title: "SEO Local",
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/local", label: "Dashboard local", icon: MapPin },
      { href: "/local/gbp", label: "Fiches Google", icon: Store },
      { href: "/local/reviews", label: "Avis", icon: Star },
      { href: "/local/posts", label: "Posts Google", icon: MessageSquare },
      { href: "/local/rankings", label: "Rankings Maps", icon: Map },
    ],
  },
  {
    title: "Compte",
    items: [
      { href: "/settings", label: "Paramètres", icon: Settings },
      { href: "/settings/billing", label: "Abonnement", icon: CreditCard },
    ],
  },
]


// ── Plan labels ──────────────────────────────────
const PLAN_CONFIG: Record<string, { label: string; color: string; quota: number }> = {
  STARTER:    { label: "Starter",    color: "#64748b", quota: 100 },
  PRO:        { label: "Pro",        color: "#2563eb", quota: 10_000 },
  AGENCY:     { label: "Agency",     color: "#7c3aed", quota: 100_000 },
  ENTERPRISE: { label: "Enterprise", color: "#06b6d4", quota: 999_999 },
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  ADMIN:  { label: "Admin",  color: "#06b6d4" },
  MEMBER: { label: "Membre", color: "#2563eb" },
  GUEST:  { label: "Invité", color: "#64748b" },
}

// ── Collapsible section ──────────────────────────
function CollapsibleSection({
  section,
  pathname,
}: {
  section: NavSection
  pathname: string
}) {
  const hasActiveChild = section.items.some((item) => !item.disabled && isActive(item.href, pathname))
  const [open, setOpen] = useState(section.defaultOpen || hasActiveChild)

  const toggle = useCallback(() => setOpen((prev) => !prev), [])

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 pb-1.5 pt-0.5 group cursor-pointer"
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors group-hover:text-slate-300"
          style={{ color: "#ffffff" }}
        >
          {section.title}
        </span>
        <ChevronRight
          className="h-3 w-3 transition-transform duration-200"
          style={{
            color: "#475569",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: open ? `${section.items.length * 38 + 4}px` : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <NavItems items={section.items} pathname={pathname} />
      </div>
    </div>
  )
}

// ── Nav items ────────────────────────────────────
function isActive(href: string, pathname: string) {
  if (href === "/dashboard") return pathname === "/dashboard"
  if (href === "/settings" && !pathname.startsWith("/settings/")) return pathname === "/settings"
  if (href === "/local") return pathname === "/local"
  return pathname === href || pathname.startsWith(href + "/")
}

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href, pathname)

        return (
          <Link
            key={item.href + item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-150",
              active
                ? "text-white"
                : "hover:text-slate-200 hover:bg-white/[0.04]"
            )}
            style={active ? {
              background: "rgba(37,99,235,0.15)",
              boxShadow: "inset 3px 0 0 #2563eb",
            } : {
              color: "lab(95 -32.16 116.44)",
            }}
          >
            <Icon
              className="h-[18px] w-[18px] shrink-0 transition-colors"
              style={{ color: active ? "#06b6d4" : "#64748b" }}
            />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span
                className="text-[8px] font-bold uppercase px-1.5 py-[1px] rounded-full shrink-0 animate-pulse-cyan"
                style={{
                  background: `${item.badgeColor ?? "#2563eb"}20`,
                  color: item.badgeColor ?? "#2563eb",
                }}
              >
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ── Project Selector ─────────────────────────────
function ProjectSelector() {
  const { activeProjectId, setActiveProjectId, activeProject } = useActiveProject()
  const { data: projects } = useProjects()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const label = activeProject
    ? activeProject.name
    : "Tous les projets"

  const hostname = activeProject?.domain
    ? (() => { try { return new URL(activeProject.domain).hostname } catch { return activeProject.domain } })()
    : null

  return (
    <div ref={ref} className="relative mx-2.5 mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.06] cursor-pointer"
        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: activeProject ? "rgba(37,99,235,0.2)" : "rgba(255,255,255,0.06)" }}>
          <Layers className="h-3.5 w-3.5" style={{ color: activeProject ? "#60a5fa" : "#64748b" }} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-semibold text-white truncate leading-none">{label}</p>
          {hostname && <p className="text-[10px] mt-0.5 truncate" style={{ color: "#475569" }}>{hostname}</p>}
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" style={{ color: "#475569" }} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-xl py-1 z-50 shadow-lg"
          style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <button
            onClick={() => { setActiveProjectId(null); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-[12px] font-medium transition-colors hover:bg-white/[0.06]"
            style={{ color: !activeProjectId ? "#60a5fa" : "#94a3b8" }}
          >
            Tous les projets
          </button>
          {projects?.map((p) => (
            <button
              key={p.id}
              onClick={() => { setActiveProjectId(p.id); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-[12px] font-medium transition-colors hover:bg-white/[0.06]"
              style={{ color: activeProjectId === p.id ? "#60a5fa" : "#94a3b8" }}
            >
              <span className="block truncate">{p.name}</span>
              <span className="block text-[10px] truncate" style={{ color: "#475569" }}>{p.domain}</span>
            </button>
          ))}
          {!projects?.length && (
            <p className="px-3 py-2 text-[11px]" style={{ color: "#475569" }}>Aucun projet</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Theme Toggle ─────────────────────────────────
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-full flex items-center gap-2.5 px-2 py-2 mb-1 rounded-lg hover:bg-white/[0.06] transition-colors"
      title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 shrink-0" style={{ color: "#f59e0b" }} />
      ) : (
        <Moon className="h-4 w-4 shrink-0" style={{ color: "#94a3b8" }} />
      )}
      <span className="text-[12px] font-medium" style={{ color: "#64748b" }}>
        {isDark ? "Mode clair" : "Mode sombre"}
      </span>
    </button>
  )
}

// ── Component ────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { role, plan } = useRole()

  const { data: billing } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiClient.getBilling(),
    staleTime: 60_000,
  })

  const pagesUsed = billing?.subscription?.pagesUsed ?? 0
  const pagesQuota = billing?.subscription?.pagesQuota ?? PLAN_CONFIG[plan]?.quota ?? 100
  const usagePercent = Math.min(100, Math.round((pagesUsed / pagesQuota) * 100))
  const planConfig = PLAN_CONFIG[plan] ?? PLAN_CONFIG.STARTER

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  const userInitials = session?.user?.name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"

  return (
    <aside className="w-[252px] min-h-screen flex flex-col shrink-0 select-none" style={{ background: "#0f172a" }}>

      {/* ── Header / Logo ── */}
      <div className="px-4 py-4 flex flex-col gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/dashboard" className="flex items-center group">
          <div className="transition-transform duration-200 group-hover:scale-[1.02]">
            <Image
              src="/logo.png"
              alt="404 SEO"
              width={160}
              height={48}
              className="h-12 w-auto brightness-0 invert"
              priority
            />
          </div>
        </Link>
        <span
          className="self-start text-[9px] font-bold uppercase px-1.5 py-[1px] rounded"
          style={{ background: `${planConfig.color}22`, color: planConfig.color }}
        >
          {planConfig.label}
        </span>
      </div>

      {/* ── Project Selector ── */}
      <div className="pt-2.5 pb-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <ProjectSelector />
      </div>

      {/* ── Navigation sections ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-3 scrollbar-thin">
        {sections.map((section) => (
          section.collapsible ? (
            <CollapsibleSection key={section.title} section={section} pathname={pathname} />
          ) : (
            <div key={section.title}>
              <div className="px-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#ffffff" }}>
                  {section.title}
                </span>
              </div>
              <NavItems items={section.items} pathname={pathname} />
            </div>
          )
        ))}

        {/* ── Section admin (ADMIN seulement) ── */}
        {role === "ADMIN" && (
          <div>
            <div className="px-3 pb-1.5 pt-1 flex items-center gap-2">
              <ShieldAlert className="h-3 w-3" style={{ color: "#06b6d4" }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#06b6d4" }}>
                Administration
              </span>
            </div>
            <NavItems
              items={[
                { href: "/admin", label: "Stats plateforme", icon: BarChart3 },
                { href: "/admin/users", label: "Utilisateurs", icon: Users },
                { href: "/admin/tenants", label: "Tenants", icon: Building2 },
                { href: "/admin/plans", label: "Plans & Tarifs", icon: CreditCard },
              ]}
              pathname={pathname}
            />
          </div>
        )}
      </nav>

      {/* ── Pro promo card (Starter only) ── */}
      {plan === "STARTER" && (
        <div className="mx-2.5 mb-2">
          <Link
            href="/settings/billing"
            className="block px-3 py-3 rounded-xl transition-all duration-200 hover:scale-[1.02] group"
            style={{
              background: "linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(6,182,212,0.10) 100%)",
              border: "1px solid rgba(37,99,235,0.2)",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="h-3.5 w-3.5" style={{ color: "#06b6d4" }} />
              <span className="text-[11px] font-bold text-white">Passez à Pro</span>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "#94a3b8" }}>
              Débloquez le suivi de position, l'analyse concurrents et les recommandations IA.
            </p>
          </Link>
        </div>
      )}

      {/* ── Quota usage card ── */}
      <div className="mx-2.5 mb-2.5">
        <div className="px-3 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3" style={{ color: planConfig.color }} />
              <span className="text-[11px] font-medium" style={{ color: "#94a3b8" }}>Pages crawlées</span>
            </div>
            {plan === "STARTER" && (
              <Link
                href="/settings/billing"
                className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full transition-opacity hover:opacity-80"
                style={{ background: "rgba(37,99,235,0.2)", color: "#60a5fa" }}
              >
                Upgrade
              </Link>
            )}
          </div>

          <div className="flex justify-between text-[11px] mb-1.5">
            <span style={{ color: "#64748b" }}>
              {pagesUsed.toLocaleString("fr-FR")} / {pagesQuota.toLocaleString("fr-FR")}
            </span>
            <span style={{ color: usagePercent >= 90 ? "#ef4444" : usagePercent >= 70 ? "#f59e0b" : "#475569" }}>
              {usagePercent}%
            </span>
          </div>

          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${usagePercent}%`,
                background: usagePercent >= 90
                  ? "#ef4444"
                  : usagePercent >= 70
                  ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                  : `linear-gradient(90deg, ${planConfig.color}, #06b6d4)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── User profile ── */}
      <div className="px-2.5 pb-3 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <ThemeToggle />
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-default">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-[11px] font-bold" style={{ background: "rgba(37,99,235,0.25)", color: "#60a5fa" }}>
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-medium text-white truncate leading-none">
                {session?.user?.name ?? "Utilisateur"}
              </p>
              <span
                className="shrink-0 text-[8px] font-bold uppercase px-1 py-[1px] rounded"
                style={{
                  background: `${ROLE_BADGE[role]?.color ?? "#64748b"}22`,
                  color: ROLE_BADGE[role]?.color ?? "#64748b",
                }}
              >
                {ROLE_BADGE[role]?.label ?? role}
              </span>
            </div>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: "#475569" }}>
              {session?.user?.email ?? ""}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            title="Déconnexion"
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            style={{ color: "#475569" }}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
