"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { useMe, useRole } from "@/hooks/useMe"
import { BarChart3, Users, Building2, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"

const adminNav = [
  { href: "/admin", label: "Vue d'ensemble", icon: BarChart3, exact: true },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/plans", label: "Plans & Tarifs", icon: CreditCard },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoading } = useMe()
  const { role } = useRole()

  useEffect(() => {
    if (!isLoading && role !== "ADMIN") {
      router.replace("/dashboard")
    }
  }, [role, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (role !== "ADMIN") return null

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header admin ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
          <p className="text-sm text-slate-500 mt-1">Gestion de la plateforme SEO</p>
        </div>
        <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
          Super Admin
        </span>
      </div>

      {/* ── Sous-navigation ── */}
      <nav className="flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
        {adminNav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* ── Contenu ── */}
      {children}
    </div>
  )
}
