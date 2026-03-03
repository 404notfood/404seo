// packages/reporter/src/index.ts — Génération PDF via Puppeteer
import puppeteer from "puppeteer"
import type { SEOScore, Recommendation } from "@seo/scorer"

export interface ReportData {
  url: string
  date: string
  score: SEOScore
  recommendations: Recommendation[]
  tenantBranding?: {
    name?: string
    logoUrl?: string
    brandColor?: string
  }
}

// ─────────────────────────────────────────────
// Helpers HTML
// ─────────────────────────────────────────────

function renderScoreCard(label: string, score: number, color: string): string {
  return `
  <div class="score-card">
    <div class="cat">${label}</div>
    <div class="num">${score}<span style="font-size:20px;color:#94a3b8">/100</span></div>
    <div class="bar-container">
      <div class="bar" style="width:${score}%;background:${color}"></div>
    </div>
  </div>`
}

function renderIssueItem(issue: { checkName: string; message: string; value?: string; expected?: string }, type: string): string {
  const label = type === "critical" ? "Critique" : type === "warning" ? "Attention" : "OK"
  return `
  <div class="issue-item ${type}">
    <span class="badge ${type}">${label}</span>
    <div class="issue-content">
      <div class="check-name">${issue.checkName}</div>
      <div class="message">${issue.message}</div>
      <div class="issue-meta">
        ${issue.value ? `<span class="tag">Valeur : ${issue.value}</span>` : ""}
        ${issue.expected ? `<span class="tag">Attendu : ${issue.expected}</span>` : ""}
      </div>
    </div>
  </div>`
}

// ─────────────────────────────────────────────
// Template HTML
// ─────────────────────────────────────────────

function generateReportHTML(data: ReportData): string {
  const { url, date, score, recommendations, tenantBranding } = data
  const brandColor = tenantBranding?.brandColor ?? "#2563eb"
  const logoUrl = tenantBranding?.logoUrl ?? ""
  const companyName = tenantBranding?.name ?? "SEO Audit Pro"

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport SEO — ${url}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a}

    .cover{width:100%;height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
      display:flex;flex-direction:column;justify-content:center;align-items:flex-start;
      padding:80px;position:relative;page-break-after:always}
    .cover .brand{color:${brandColor};font-size:14px;letter-spacing:3px;text-transform:uppercase;margin-bottom:60px}
    .cover h1{color:#fff;font-size:48px;font-weight:700;line-height:1.2;margin-bottom:20px}
    .cover .url{color:#94a3b8;font-size:20px;margin-bottom:40px;word-break:break-all}
    .cover .date{color:#64748b;font-size:14px}
    .score-badge{position:absolute;top:80px;right:80px;width:140px;height:140px;
      border:4px solid ${brandColor};border-radius:50%;
      display:flex;flex-direction:column;align-items:center;justify-content:center}
    .score-badge .score-num{color:#fff;font-size:52px;font-weight:800}
    .score-badge .score-label{color:${brandColor};font-size:11px;letter-spacing:2px}

    .page{padding:60px;page-break-after:always}
    h2{font-size:28px;font-weight:700;color:#0f172a;padding-bottom:12px;
       border-bottom:3px solid ${brandColor};margin-bottom:32px}

    .scores-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-bottom:40px}
    .score-card{background:#f8fafc;border-radius:12px;padding:24px;border-left:4px solid ${brandColor}}
    .score-card .cat{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px}
    .score-card .num{font-size:40px;font-weight:800;color:#0f172a}
    .score-card .bar-container{height:6px;background:#e2e8f0;border-radius:3px;margin-top:12px}
    .score-card .bar{height:6px;border-radius:3px}

    .issue-list{display:flex;flex-direction:column;gap:12px}
    .issue-item{display:flex;gap:16px;align-items:flex-start;
      background:#f8fafc;border-radius:8px;padding:16px}
    .issue-item.critical{border-left:4px solid #ef4444}
    .issue-item.warning{border-left:4px solid #f59e0b}
    .issue-item.passed{border-left:4px solid #10b981}
    .badge{min-width:70px;text-align:center;padding:4px 8px;border-radius:4px;
      font-size:11px;font-weight:600;text-transform:uppercase}
    .badge.critical{background:#fee2e2;color:#ef4444}
    .badge.warning{background:#fef3c7;color:#d97706}
    .badge.passed{background:#d1fae5;color:#059669}
    .issue-content .check-name{font-weight:600;font-size:14px;color:#1e293b}
    .issue-content .message{font-size:13px;color:#64748b;margin-top:4px}
    .issue-meta{display:flex;gap:8px;margin-top:8px}
    .tag{padding:2px 8px;border-radius:4px;font-size:11px;background:#e2e8f0;color:#475569}

    .rec-item{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:16px}
    .rec-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .rec-title{font-weight:700;font-size:15px}
    .roi-badge{background:${brandColor};color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700}
    .rec-desc{color:#64748b;font-size:13px;line-height:1.5}
    .rec-tags{display:flex;gap:8px;margin-top:12px}

    .footer{text-align:center;padding:20px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0}
  </style>
</head>
<body>

  <div class="cover">
    ${logoUrl
      ? `<img src="${logoUrl}" style="height:48px;margin-bottom:40px" alt="${companyName}">`
      : `<div class="brand">${companyName}</div>`
    }
    <h1>Rapport d'Audit SEO</h1>
    <div class="url">${url}</div>
    <div class="date">Généré le ${date}</div>
    <div class="score-badge">
      <span class="score-num">${score.global}</span>
      <span class="score-label">/100</span>
    </div>
  </div>

  <div class="page">
    <h2>Score SEO Global — Grade ${score.grade}</h2>
    <div class="scores-grid">
      ${renderScoreCard("Technique", score.technical, brandColor)}
      ${renderScoreCard("On-Page", score.onPage, brandColor)}
      ${renderScoreCard("Performance", score.performance, brandColor)}
      ${renderScoreCard("UX &amp; Mobile", score.uxMobile, brandColor)}
    </div>
    <p style="color:#64748b;font-size:14px;line-height:1.7">
      ${score.summary}<br>
      Problèmes critiques : <strong>${score.criticalIssues.length}</strong> —
      Avertissements : <strong>${score.warnings.length}</strong> —
      Critères réussis : <strong>${score.passed.length}</strong>
    </p>
  </div>

  ${score.criticalIssues.length > 0 ? `
  <div class="page">
    <h2>Problèmes Critiques</h2>
    <div class="issue-list">
      ${score.criticalIssues.map((i) => renderIssueItem(i, "critical")).join("")}
    </div>
  </div>` : ""}

  ${score.warnings.length > 0 ? `
  <div class="page">
    <h2>Avertissements</h2>
    <div class="issue-list">
      ${score.warnings.map((i) => renderIssueItem(i, "warning")).join("")}
    </div>
  </div>` : ""}

  <div class="page">
    <h2>Plan d'Action Priorisé</h2>
    <p style="color:#64748b;margin-bottom:24px;font-size:14px">
      Actions triées par ROI (Impact / Effort). Commencez par le haut.
    </p>
    ${recommendations.slice(0, 10).map((rec) => `
    <div class="rec-item">
      <div class="rec-header">
        <span class="rec-title">${rec.title}</span>
        <span class="roi-badge">ROI ${rec.roi}/10</span>
      </div>
      <div class="rec-desc">${rec.description}</div>
      <div class="rec-tags">
        <span class="tag">Impact : ${rec.impact}</span>
        <span class="tag">Effort : ${rec.effort}</span>
      </div>
    </div>`).join("")}
  </div>

  <div class="footer">
    Rapport généré par ${companyName} — ${date} — ${url}
  </div>

</body>
</html>`
}

// ─────────────────────────────────────────────
// Génération PDF
// ─────────────────────────────────────────────

export async function generatePDF(data: ReportData): Promise<Buffer> {
  const html = generateReportHTML(data)

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "networkidle0" })

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      displayHeaderFooter: false,
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
