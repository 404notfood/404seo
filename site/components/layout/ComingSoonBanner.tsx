import { Sparkles } from "lucide-react"

export function ComingSoonBanner({ feature }: { feature: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4"
      style={{
        background: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(6,182,212,0.06) 100%)",
        border: "1px solid rgba(37,99,235,0.15)",
      }}
    >
      <div className="p-2.5 rounded-xl" style={{ background: "rgba(6,182,212,0.12)" }}>
        <Sparkles className="h-5 w-5" style={{ color: "#06b6d4" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">Fonctionnalité à venir</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {feature} sera disponible prochainement. Connectez vos sources de données pour en profiter.
        </p>
      </div>
    </div>
  )
}
