"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

interface PagesBreakdownDonutProps {
  healthy: number
  redirects: number
  errors: number
  blocked: number
}

const COLORS = {
  healthy: "#10b981",
  redirects: "#f59e0b",
  errors: "#ef4444",
  blocked: "#94a3b8",
}

const LABELS: Record<string, string> = {
  healthy: "Saines (200)",
  redirects: "Redirections",
  errors: "Erreurs",
  blocked: "Bloquées (noindex)",
}

export function PagesBreakdownDonut({ healthy, redirects, errors, blocked }: PagesBreakdownDonutProps) {
  const data = [
    { name: LABELS.healthy, value: healthy, color: COLORS.healthy },
    { name: LABELS.redirects, value: redirects, color: COLORS.redirects },
    { name: LABELS.errors, value: errors, color: COLORS.errors },
    { name: LABELS.blocked, value: blocked, color: COLORS.blocked },
  ].filter((d) => d.value > 0)

  const total = healthy + redirects + errors + blocked

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        Aucune page crawlée
      </div>
    )
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={((value: number | undefined, name: string | undefined) => [`${value ?? 0} page${(value ?? 0) > 1 ? "s" : ""}`, name ?? ""]) as never}
            contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px" }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-slate-600">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: "32px" }}>
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">{total}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">pages</p>
        </div>
      </div>
    </div>
  )
}
