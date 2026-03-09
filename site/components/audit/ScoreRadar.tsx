"use client"

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

interface ScoreRadarProps {
  technical: number
  onPage: number
  performance: number
  uxMobile: number
}

export function ScoreRadar({ technical, onPage, performance, uxMobile }: ScoreRadarProps) {
  const data = [
    { subject: "Technique", score: technical, fullMark: 100 },
    { subject: "On-Page", score: onPage, fullMark: 100 },
    { subject: "Performance", score: performance, fullMark: 100 },
    { subject: "UX Mobile", score: uxMobile, fullMark: 100 },
  ]

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data}>
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
        />
        <Radar
          name="Score"
          dataKey="score"
          stroke="#2563eb"
          fill="#2563eb"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Tooltip
          formatter={(value) => [`${value ?? 0}/100`, "Score"]}
          contentStyle={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
