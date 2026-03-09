"use client"

import { useState } from "react"
import { useAdminUsers, usePatchAdminUser } from "@/hooks/useAdmin"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN:  { bg: "bg-cyan-50",  text: "text-cyan-700",  border: "border-cyan-200" },
  MEMBER: { bg: "bg-blue-50",  text: "text-blue-700",  border: "border-blue-200" },
  GUEST:  { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" },
}
const PLAN_LABELS: Record<string, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  AGENCY: "Agency",
  ENTERPRISE: "Enterprise",
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState("")
  const [bannedFilter, setBannedFilter] = useState("")

  const { data, isLoading } = useAdminUsers({
    search: debouncedSearch || undefined,
    page,
    role: roleFilter || undefined,
    banned: bannedFilter || undefined,
  })

  const patchUser = usePatchAdminUser()

  function handleSearch(val: string) {
    setSearch(val)
    clearTimeout((handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(1)
    }, 400)
  }

  async function handleRoleChange(id: string, role: string) {
    try {
      await patchUser.mutateAsync({ id, data: { role } })
      toast.success("Rôle mis à jour")
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  async function handleBanToggle(id: string, isBanned: boolean) {
    try {
      await patchUser.mutateAsync({ id, data: { isBanned } })
      toast.success(isBanned ? "Utilisateur banni" : "Utilisateur débanni")
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Filtres ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Rechercher par nom ou email..."
            className="pl-9 bg-white border-slate-200"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 outline-none"
        >
          <option value="">Tous les rôles</option>
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Membre</option>
          <option value="GUEST">Invité</option>
        </select>
        <select
          value={bannedFilter}
          onChange={(e) => { setBannedFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="false">Actif</option>
          <option value="true">Banni</option>
        </select>
        <span className="text-sm text-slate-500">{data?.total ?? 0} utilisateur{(data?.total ?? 0) > 1 ? "s" : ""}</span>
      </div>

      {/* ── Tableau ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Utilisateur", "Rôle", "Tenant / Plan", "Inscription", "Statut", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : (data?.users ?? []).map((user) => {
                  const roleStyle = ROLE_COLORS[user.role] ?? ROLE_COLORS.GUEST
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold bg-blue-100 text-blue-600">
                            {user.name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 truncate max-w-[180px]">{user.name}</p>
                            <p className="text-xs text-slate-400 truncate max-w-[180px]">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className={`text-xs px-2 py-1 rounded-md font-bold uppercase cursor-pointer border outline-none ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Membre</option>
                          <option value="GUEST">Invité</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {user.tenant ? (
                          <div>
                            <p className="text-slate-900 text-xs font-medium truncate max-w-[140px]">{user.tenant.name}</p>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{PLAN_LABELS[user.tenant.plan] ?? user.tenant.plan}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        {user.isBanned ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                            Banni
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                            Actif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleBanToggle(user.id, !user.isBanned)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border"
                          style={user.isBanned
                            ? { background: "#f0fdf4", color: "#16a34a", borderColor: "#bbf7d0" }
                            : { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
                        >
                          {user.isBanned ? "Débannir" : "Bannir"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
        {!isLoading && !data?.users?.length && (
          <p className="text-sm text-slate-400 text-center py-8">Aucun utilisateur trouvé</p>
        )}
      </div>

      {/* ── Pagination ── */}
      {(data?.pages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg disabled:opacity-30 transition-colors hover:bg-slate-100 text-slate-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-slate-600">
            Page {page} / {data?.pages ?? 1}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data?.pages ?? 1, p + 1))}
            disabled={page === (data?.pages ?? 1)}
            className="p-2 rounded-lg disabled:opacity-30 transition-colors hover:bg-slate-100 text-slate-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
