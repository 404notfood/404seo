"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, CheckCircle, BarChart3, Globe, Calendar } from "lucide-react"

function scoreColor(score: number) {
  if (score >= 70) return "#10b981"
  if (score >= 40) return "#f59e0b"
  return "#ef4444"
}

function scoreGrade(score: number) {
  if (score >= 90) return "A"
  if (score >= 75) return "B"
  if (score >= 60) return "C"
  if (score >= 40) return "D"
  return "F"
}

export default function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-report", token],
    queryFn: () => apiClient.getPublicReport(token),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-32 w-32 rounded-full mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Lien expiré ou introuvable</h1>
          <p className="text-slate-400">Ce rapport n&apos;est plus disponible.</p>
        </div>
      </div>
    )
  }

  const report = data.report
  const score = report?.scoreGlobal ?? 0
  const brandColor = data.tenant.brandColor || "#2563eb"

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.tenant.logoUrl ? (
              <img src={data.tenant.logoUrl} alt="" className="h-8 w-8 rounded" />
            ) : (
              <div className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: brandColor }}>
                {data.tenant.name[0]}
              </div>
            )}
            <span className="font-semibold text-slate-800">{data.tenant.name}</span>
          </div>
          <span className="text-xs text-slate-400">Rapport SEO</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Info */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Globe className="h-4 w-4" />
            <span>{data.url}</span>
            <span className="mx-2">·</span>
            <Calendar className="h-4 w-4" />
            <span>{new Date(data.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#0f172a" }}>
            Rapport d&apos;audit SEO — {data.project.name}
          </h1>
        </div>

        {/* Score principal */}
        {report && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center mb-8">
              <div className="relative inline-flex items-center justify-center w-36 h-36 mx-auto mb-4">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
                  <circle
                    cx="18" cy="18" r="16" fill="none"
                    stroke={scoreColor(score)}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * 100.53} 100.53`}
                  />
                </svg>
                <div>
                  <p className="text-5xl font-bold" style={{ color: scoreColor(score) }}>{score}</p>
                  <p className="text-xs text-slate-400">/100</p>
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: scoreColor(score) }}>Grade {scoreGrade(score)}</p>
            </div>

            {/* Scores catégories */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Technique", value: report.scoreTechnical, icon: BarChart3 },
                { label: "On-Page", value: report.scoreOnPage, icon: CheckCircle },
                { label: "Performance", value: report.scorePerformance, icon: BarChart3 },
                { label: "UX Mobile", value: report.scoreUX, icon: CheckCircle },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-center">
                  <Icon className="h-5 w-5 mx-auto mb-2" style={{ color: scoreColor(value ?? 0) }} />
                  <p className="text-2xl font-bold" style={{ color: scoreColor(value ?? 0) }}>{value ?? 0}</p>
                  <p className="text-xs text-slate-400 mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-center">
                <p className="text-2xl font-bold text-slate-800">{report.totalPages}</p>
                <p className="text-xs text-slate-400">Pages analysées</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-center">
                <p className="text-2xl font-bold text-red-500">{report.criticalIssues}</p>
                <p className="text-xs text-slate-400">Critiques</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 text-center">
                <p className="text-2xl font-bold text-green-500">{report.passed}</p>
                <p className="text-xs text-slate-400">Réussis</p>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-slate-200">
          <p className="text-xs text-slate-400">
            Rapport généré par <strong style={{ color: brandColor }}>{data.tenant.name}</strong> via 404 SEO
          </p>
          <p className="text-xs text-slate-300 mt-1">
            Expire le {new Date(data.expiresAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
      </main>
    </div>
  )
}
