"use client"

interface ScoreGaugeProps {
  score: number
  size?: number
  label?: string
}

function getGradeColor(score: number): string {
  if (score >= 90) return "#10b981"
  if (score >= 75) return "#22c55e"
  if (score >= 60) return "#f59e0b"
  if (score >= 40) return "#ef4444"
  return "#dc2626"
}

function getGrade(score: number): string {
  if (score >= 90) return "A"
  if (score >= 75) return "B"
  if (score >= 60) return "C"
  if (score >= 40) return "D"
  return "F"
}

export function ScoreGauge({ score, size = 140, label }: ScoreGaugeProps) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  // Arc de 270° (3/4 de cercle), commence à 135° (bas-gauche)
  const arcLength = circumference * 0.75
  const filled = (score / 100) * arcLength
  const color = getGradeColor(score)
  const grade = getGrade(score)

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={10}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        {/* Score text */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="font-bold leading-none" style={{ fontSize: size * 0.25, color }}>
            {score}
          </span>
          <span className="text-xs text-slate-400 font-medium">/100</span>
          <span
            className="font-bold text-xs mt-0.5 px-1.5 py-0.5 rounded"
            style={{ background: color + "20", color }}
          >
            {grade}
          </span>
        </div>
      </div>
      {label && <p className="text-xs font-medium text-slate-500">{label}</p>}
    </div>
  )
}
