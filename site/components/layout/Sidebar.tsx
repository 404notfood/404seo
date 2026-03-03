"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Search, FolderOpen, Settings, CreditCard, LogOut } from "lucide-react"
import { signOut, useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useRole } from "@/hooks/useMe"

const navItems = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/audits",    label: "Audits",     icon: Search },
  { href: "/projects",  label: "Projets",    icon: FolderOpen },
  { href: "/settings",  label: "Paramètres", icon: Settings },
]

function RadarLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" stroke="#2563eb" strokeWidth="1.5" opacity="0.3" />
      <circle cx="16" cy="16" r="9"  stroke="#2563eb" strokeWidth="1.5" opacity="0.55" />
      <circle cx="16" cy="16" r="4"  fill="#2563eb" />
      <line x1="16" y1="2"  x2="16" y2="30" stroke="#06b6d4" strokeWidth="0.75" opacity="0.25" />
      <line x1="2"  y1="16" x2="30" y2="16" stroke="#06b6d4" strokeWidth="0.75" opacity="0.25" />
      <path d="M10 22 L16 12 L22 17" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  ADMIN: { label: "Admin", color: "#06b6d4" },
  MEMBER: { label: "Membre", color: "#2563eb" },
  GUEST: { label: "Invité", color: "#64748b" },
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { role, plan } = useRole()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  const userInitials = session?.user?.name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"

  return (
    <aside className="w-60 min-h-screen flex flex-col shrink-0" style={{ background: "#0f172a" }}>

      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="transition-transform duration-200 group-hover:scale-105">
            <RadarLogo />
          </div>
          <div>
            <p className="text-white font-bold text-sm tracking-tight leading-none">SEO Audit</p>
            <p className="text-[10px] font-semibold tracking-widest uppercase mt-0.5" style={{ color: "#06b6d4" }}>Pro</p>
          </div>
        </Link>
      </div>

      {/* Nav principale */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
              style={isActive ? {
                background: "rgba(37,99,235,0.18)",
                borderLeft: "2px solid #2563eb",
                paddingLeft: "10px",
              } : { borderLeft: "2px solid transparent" }}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: isActive ? "#06b6d4" : undefined }} />
              {item.label}
            </Link>
          )
        })}

        <div className="pt-5 pb-1.5 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#334155" }}>
            Compte
          </span>
        </div>

        <Link
          href="/settings/billing"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
            pathname.startsWith("/settings/billing") ? "text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
          style={pathname.startsWith("/settings/billing") ? {
            background: "rgba(37,99,235,0.18)",
            borderLeft: "2px solid #2563eb",
            paddingLeft: "10px",
          } : { borderLeft: "2px solid transparent" }}
        >
          <CreditCard className="h-4 w-4 shrink-0" style={{ color: pathname.startsWith("/settings/billing") ? "#06b6d4" : undefined }} />
          Facturation
        </Link>
      </nav>

      {/* Quota card */}
      <div className="mx-3 mb-3 px-3.5 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: "#94a3b8" }}>Plan Starter</span>
          <Link href="/settings/billing" className="text-[10px] font-semibold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity" style={{ background: "rgba(37,99,235,0.22)", color: "#60a5fa" }}>
            Upgrade
          </Link>
        </div>
        <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "#475569" }}>
          <span>0 / 100 pages</span>
          <span>0%</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div className="h-1 rounded-full" style={{ width: "0%", background: "linear-gradient(90deg, #2563eb, #06b6d4)" }} />
        </div>
      </div>

      {/* User */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-default">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs font-bold" style={{ background: "rgba(37,99,235,0.28)", color: "#60a5fa" }}>
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-white truncate leading-none">{session?.user?.name ?? "Utilisateur"}</p>
              <span className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{ background: `${ROLE_BADGE[role]?.color ?? "#64748b"}22`, color: ROLE_BADGE[role]?.color ?? "#64748b" }}>
                {ROLE_BADGE[role]?.label ?? role}
              </span>
            </div>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "#475569" }}>{session?.user?.email ?? ""}</p>
          </div>
          <button onClick={handleSignOut} title="Déconnexion"
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            style={{ color: "#475569" }}>
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
