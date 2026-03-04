// packages/reporter/src/index.ts — Génération PDF via Puppeteer
import puppeteer from "puppeteer"
import type { SEOScore, Recommendation } from "@seo/scorer"
import type { CheckResult, SiteKeywordEntry } from "@seo/shared"

export interface ReportData {
  url: string
  date: string
  score: SEOScore
  recommendations: Recommendation[]
  keywords?: {
    keywords: SiteKeywordEntry[]
    totalPages: number
  }
  tenantBranding?: {
    name?: string
    logoUrl?: string
    brandColor?: string
  }
}

// ─────────────────────────────────────────────
// Couleurs & Helpers
// ─────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function gradeColor(score: number): string {
  if (score >= 90) return "#10b981"
  if (score >= 75) return "#22c55e"
  if (score >= 60) return "#f59e0b"
  if (score >= 40) return "#ef4444"
  return "#dc2626"
}

function statusDot(status: string): string {
  const color = status === "PASS" ? "#10b981" : status === "WARN" ? "#f59e0b" : "#ef4444"
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0"></span>`
}

function renderSvgGauge(score: number, size: number = 120, strokeWidth: number = 10): string {
  const color = gradeColor(score)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // 270° arc
  const arcLength = circumference * 0.75
  const filledLength = arcLength * (score / 100)
  const rotation = 135 // Start at bottom-left for 270° arc

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
      fill="none" stroke="#1e293b" stroke-width="${strokeWidth}"
      stroke-dasharray="${arcLength} ${circumference}" stroke-dashoffset="0"
      stroke-linecap="round"
      transform="rotate(${rotation} ${size / 2} ${size / 2})" />
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
      fill="none" stroke="${color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${filledLength} ${circumference}" stroke-dashoffset="0"
      stroke-linecap="round"
      transform="rotate(${rotation} ${size / 2} ${size / 2})" />
    <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" dominant-baseline="central"
      font-size="${size * 0.3}px" font-weight="800" fill="${color}">${score}</text>
  </svg>`
}

function renderMiniGauge(score: number, label: string): string {
  return `<div style="text-align:center">
    ${renderSvgGauge(score, 90, 7)}
    <div style="margin-top:6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">${label}</div>
  </div>`
}

// ─────────────────────────────────────────────
// Sections par catégorie
// ─────────────────────────────────────────────

function renderCategoryDetail(
  title: string,
  score: number,
  checks: CheckResult[],
  brandColor: string
): string {
  if (checks.length === 0) return ""

  const passed = checks.filter((c) => c.status === "PASS")
  const failed = checks.filter((c) => c.status === "FAIL")
  const warned = checks.filter((c) => c.status === "WARN")

  return `
  <div class="page">
    <div class="cat-header">
      <div>
        <h2 style="border-bottom:none;margin-bottom:4px;padding-bottom:0">${title}</h2>
        <p style="color:#64748b;font-size:13px;margin:0">${passed.length} réussi(s) · ${warned.length} avertissement(s) · ${failed.length} échec(s)</p>
      </div>
      ${renderSvgGauge(score, 80, 7)}
    </div>
    <div class="check-list">
      ${[...failed, ...warned, ...passed].map((c, i) => `
        <div class="check-row">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
            ${statusDot(c.status)}
            <span class="check-name-text">${escapeHtml(formatCheckName(c.checkName))}</span>
          </div>
          <span class="check-score" style="color:${gradeColor(c.score)}">${c.score}/100</span>
        </div>
        ${c.status !== "PASS" ? `<div class="check-detail">${escapeHtml(c.message)}${c.value ? ` <span class="tag">Valeur : ${escapeHtml(c.value)}</span>` : ""}${c.expected ? ` <span class="tag">Attendu : ${escapeHtml(c.expected)}</span>` : ""}</div>` : ""}
      `).join("")}
    </div>
  </div>`
}

function formatCheckName(name: string): string {
  const names: Record<string, string> = {
    https: "HTTPS activé",
    http_status: "Code HTTP",
    indexability: "Indexabilité",
    canonical: "Balise canonical",
    response_time: "Temps de réponse",
    page_size: "Poids de la page",
    https_resources: "Ressources HTTPS",
    title: "Balise Title",
    meta_description: "Meta Description",
    h1: "Balise H1",
    images_alt: "Attributs ALT images",
    internal_links: "Liens internes",
    external_links: "Liens externes",
    schema_org: "Schema.org",
    image_optimization: "Optimisation images",
    viewport: "Balise Viewport",
    mobile_friendly: "Compatibilité mobile",
    tap_targets: "Cibles tactiles",
    font_size: "Taille de police",
    lang_attribute: "Attribut lang",
    robots_txt: "Fichier robots.txt",
    sitemap: "Sitemap XML",
    open_graph: "Balises Open Graph",
    heading_hierarchy: "Hiérarchie des titres",
    word_count: "Volume de contenu",
    lcp: "LCP (Largest Contentful Paint)",
    cls: "CLS (Cumulative Layout Shift)",
    fid: "FID (First Input Delay)",
    ttfb: "TTFB (Time to First Byte)",
  }
  return names[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

// ─────────────────────────────────────────────
// Issue & Recommendation renderers
// ─────────────────────────────────────────────

function renderIssueItem(issue: CheckResult, index: number, type: string): string {
  const badgeLabel = type === "critical" ? "Critique" : type === "warning" ? "Attention" : "Réussi"
  const badgeClass = type === "critical" ? "critical" : type === "warning" ? "warning" : "passed"
  return `
  <div class="issue-item ${badgeClass}">
    <div class="issue-num">${index}</div>
    <div class="issue-body">
      <div class="issue-top">
        <span class="check-name-text">${escapeHtml(formatCheckName(issue.checkName))}</span>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="message">${escapeHtml(issue.message)}</div>
      <div class="issue-meta">
        ${issue.value ? `<span class="tag">Valeur : ${escapeHtml(issue.value)}</span>` : ""}
        ${issue.expected ? `<span class="tag">Attendu : ${escapeHtml(issue.expected)}</span>` : ""}
        <span class="tag">Priorité : ${issue.priority}</span>
      </div>
    </div>
  </div>`
}

function renderRecItem(rec: Recommendation, index: number, brandColor: string): string {
  const impactColors: Record<string, string> = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" }
  const effortColors: Record<string, string> = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#22c55e" }
  return `
  <div class="rec-item">
    <div class="rec-num" style="background:${brandColor}">${index}</div>
    <div class="rec-body">
      <div class="rec-header">
        <span class="rec-title">${escapeHtml(rec.title)}</span>
        <span class="roi-badge" style="background:${brandColor}">ROI ${rec.roi}/10</span>
      </div>
      <div class="rec-desc">${escapeHtml(rec.description)}</div>
      <div class="rec-tags">
        <span class="tag-color" style="background:${impactColors[rec.impact]}20;color:${impactColors[rec.impact]}">Impact : ${rec.impact}</span>
        <span class="tag-color" style="background:${effortColors[rec.effort]}20;color:${effortColors[rec.effort]}">Effort : ${rec.effort}</span>
      </div>
    </div>
  </div>`
}

// ─────────────────────────────────────────────
// Keywords Section
// ─────────────────────────────────────────────

function renderKeywordsSection(keywords: SiteKeywordEntry[], brandColor: string): string {
  if (keywords.length === 0) return ""

  const maxScore = keywords[0]?.avgScore ?? 1
  const top20 = keywords.slice(0, 20)

  return `
  <div class="page">
    <h2>Mots-clés Identifiés</h2>
    <p style="color:#64748b;margin-bottom:20px;font-size:13px">
      Top ${top20.length} mots-clés extraits des pages crawlées, pondérés par position (Title, H1, H2...) et fréquence.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;text-align:left">
          <th style="padding:8px 12px;color:#64748b;font-weight:600">#</th>
          <th style="padding:8px 12px;color:#64748b;font-weight:600">Mot-clé</th>
          <th style="padding:8px 12px;color:#64748b;font-weight:600;text-align:center">Occurrences</th>
          <th style="padding:8px 12px;color:#64748b;font-weight:600;text-align:center">Pages</th>
          <th style="padding:8px 12px;color:#64748b;font-weight:600">Score</th>
          <th style="padding:8px 12px;color:#64748b;font-weight:600">Positions</th>
        </tr>
      </thead>
      <tbody>
        ${top20.map((kw, i) => {
          const barWidth = Math.round((kw.avgScore / maxScore) * 100)
          const positionBadges = kw.positions.map((p) =>
            `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;background:${p === "title" || p === "h1" ? brandColor + "20" : "#f1f5f9"};color:${p === "title" || p === "h1" ? brandColor : "#64748b"};margin-right:3px">${p}</span>`
          ).join("")

          return `<tr style="border-bottom:1px solid #f1f5f9;${i % 2 === 0 ? "background:#f8fafc" : ""}">
            <td style="padding:8px 12px;color:#94a3b8;font-weight:600">${i + 1}</td>
            <td style="padding:8px 12px;font-weight:600;color:#1e293b">${escapeHtml(kw.term)}</td>
            <td style="padding:8px 12px;text-align:center;color:#475569">${kw.totalCount}</td>
            <td style="padding:8px 12px;text-align:center;color:#475569">${kw.pageCount}</td>
            <td style="padding:8px 12px;min-width:120px">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">
                  <div style="width:${barWidth}%;height:100%;background:${brandColor};border-radius:3px"></div>
                </div>
                <span style="font-size:10px;color:#64748b;min-width:30px;text-align:right">${kw.avgScore}</span>
              </div>
            </td>
            <td style="padding:8px 12px">${positionBadges}</td>
          </tr>`
        }).join("")}
      </tbody>
    </table>
  </div>`
}

// ─────────────────────────────────────────────
// Template HTML complet
// ─────────────────────────────────────────────

function generateReportHTML(data: ReportData): string {
  const { url, date, score, recommendations, keywords, tenantBranding } = data
  const brandColor = tenantBranding?.brandColor ?? "#2563eb"
  const logoUrl = tenantBranding?.logoUrl ?? ""
  const companyName = tenantBranding?.name ?? "SEO Audit Pro"

  const totalChecks = score.criticalIssues.length + score.warnings.length + score.passed.length
  const critPct = totalChecks > 0 ? Math.round((score.criticalIssues.length / totalChecks) * 100) : 0
  const warnPct = totalChecks > 0 ? Math.round((score.warnings.length / totalChecks) * 100) : 0
  const passPct = totalChecks > 0 ? 100 - critPct - warnPct : 0

  // Regrouper les checks par catégorie depuis les issues
  const allChecks = [...score.criticalIssues, ...score.warnings, ...score.passed]
  const technicalChecks = allChecks.filter((c) => c.category === "TECHNICAL")
  const onPageChecks = allChecks.filter((c) => c.category === "ON_PAGE")
  const performanceChecks = allChecks.filter((c) => c.category === "PERFORMANCE")
  const uxMobileChecks = allChecks.filter((c) => c.category === "UX_MOBILE")

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport SEO — ${url}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;background:#fff;color:#1a1a1a;font-size:13px}

    /* ── COVER ── */
    .cover{
      width:100%;height:100vh;
      background:
        radial-gradient(circle at 20% 80%, ${brandColor}15 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, ${brandColor}10 0%, transparent 40%),
        radial-gradient(ellipse at 50% 50%, #0f172a 0%, #1e293b 100%);
      display:flex;flex-direction:column;justify-content:center;align-items:center;
      text-align:center;position:relative;page-break-after:always;overflow:hidden;
    }
    .cover::before{
      content:'';position:absolute;inset:0;
      background-image:radial-gradient(circle,#ffffff08 1px,transparent 1px);
      background-size:24px 24px;
    }
    .cover .brand{color:${brandColor};font-size:13px;letter-spacing:4px;text-transform:uppercase;margin-bottom:32px;position:relative}
    .cover h1{color:#fff;font-size:42px;font-weight:800;line-height:1.2;margin-bottom:12px;position:relative}
    .cover .subtitle{color:#94a3b8;font-size:15px;margin-bottom:48px;position:relative}
    .cover .gauge-wrap{position:relative;margin-bottom:48px}
    .cover .url-box{
      background:#ffffff0a;border:1px solid #ffffff15;border-radius:8px;
      padding:12px 32px;color:#cbd5e1;font-size:14px;word-break:break-all;
      position:relative;max-width:600px
    }
    .cover .date{color:#475569;font-size:12px;margin-top:24px;position:relative}
    .cover .grade-label{
      position:relative;margin-top:-12px;margin-bottom:16px;
      font-size:18px;font-weight:700;letter-spacing:2px;
    }

    /* ── PAGE LAYOUT ── */
    .page{padding:48px 56px;page-break-after:always;position:relative;min-height:100vh}
    h2{font-size:24px;font-weight:700;color:#0f172a;padding-bottom:10px;
       border-bottom:3px solid ${brandColor};margin-bottom:28px}

    /* ── FOOTER ── */
    .page-footer{
      position:absolute;bottom:24px;left:56px;right:56px;
      display:flex;justify-content:space-between;align-items:center;
      border-top:1px solid #e2e8f0;padding-top:12px;
      font-size:10px;color:#94a3b8
    }

    /* ── EXECUTIVE SUMMARY ── */
    .gauges-row{display:flex;justify-content:center;gap:40px;margin-bottom:36px}
    .stat-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px}
    .stat-card{
      text-align:center;padding:20px 16px;border-radius:12px;
    }
    .stat-card.critical-card{background:#fef2f2;border:1px solid #fecaca}
    .stat-card.warning-card{background:#fffbeb;border:1px solid #fde68a}
    .stat-card.passed-card{background:#f0fdf4;border:1px solid #bbf7d0}
    .stat-card .stat-num{font-size:36px;font-weight:800}
    .stat-card .stat-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-top:4px}
    .stat-card.critical-card .stat-num{color:#ef4444}
    .stat-card.warning-card .stat-num{color:#d97706}
    .stat-card.passed-card .stat-num{color:#10b981}

    .distrib-bar{
      display:flex;height:12px;border-radius:6px;overflow:hidden;margin-bottom:8px
    }
    .distrib-bar .seg-critical{background:#ef4444}
    .distrib-bar .seg-warning{background:#f59e0b}
    .distrib-bar .seg-passed{background:#10b981}
    .distrib-legend{display:flex;gap:16px;justify-content:center;font-size:11px;color:#64748b;margin-bottom:28px}
    .distrib-legend span::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
    .legend-crit::before{background:#ef4444!important}
    .legend-warn::before{background:#f59e0b!important}
    .legend-pass::before{background:#10b981!important}

    .summary-text{
      background:#f8fafc;border-radius:10px;padding:20px 24px;
      color:#475569;line-height:1.7;font-size:14px;border-left:4px solid ${brandColor}
    }

    /* ── CATEGORY DETAIL ── */
    .cat-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
    .check-list{display:flex;flex-direction:column;gap:0}
    .check-row{
      display:flex;justify-content:space-between;align-items:center;
      padding:10px 16px;border-bottom:1px solid #f1f5f9;
    }
    .check-row:nth-child(odd){background:#f8fafc}
    .check-name-text{font-weight:600;font-size:13px;color:#1e293b}
    .check-score{font-weight:700;font-size:13px;min-width:56px;text-align:right}
    .check-detail{
      padding:6px 16px 12px 32px;font-size:12px;color:#64748b;line-height:1.5;
      border-bottom:1px solid #f1f5f9;
    }

    /* ── ISSUES ── */
    .issue-list{display:flex;flex-direction:column;gap:12px}
    .issue-item{display:flex;gap:14px;align-items:flex-start;
      background:#f8fafc;border-radius:10px;padding:16px;page-break-inside:avoid}
    .issue-item.critical{border-left:4px solid #ef4444}
    .issue-item.warning{border-left:4px solid #f59e0b}
    .issue-item.passed{border-left:4px solid #10b981}
    .issue-num{
      min-width:28px;height:28px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;color:#fff;flex-shrink:0
    }
    .issue-item.critical .issue-num{background:#ef4444}
    .issue-item.warning .issue-num{background:#f59e0b}
    .issue-item.passed .issue-num{background:#10b981}
    .issue-body{flex:1;min-width:0}
    .issue-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
    .badge{padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
    .badge.critical{background:#fee2e2;color:#ef4444}
    .badge.warning{background:#fef3c7;color:#d97706}
    .badge.passed{background:#d1fae5;color:#059669}
    .message{font-size:12px;color:#64748b;line-height:1.5;margin-bottom:6px}
    .issue-meta{display:flex;gap:6px;flex-wrap:wrap}
    .tag{padding:2px 8px;border-radius:4px;font-size:10px;background:#e2e8f0;color:#475569}

    /* ── PASSED CHECKS ── */
    .passed-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    .passed-item{
      display:flex;align-items:center;gap:8px;padding:8px 12px;
      background:#f0fdf4;border-radius:6px;font-size:12px;color:#1e293b
    }

    /* ── RECOMMENDATIONS ── */
    .rec-item{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px;page-break-inside:avoid}
    .rec-num{
      min-width:32px;height:32px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;font-weight:700;color:#fff;flex-shrink:0
    }
    .rec-body{flex:1;min-width:0;background:#f8fafc;border-radius:10px;padding:16px}
    .rec-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .rec-title{font-weight:700;font-size:14px;color:#0f172a}
    .roi-badge{color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
    .rec-desc{color:#64748b;font-size:12px;line-height:1.5;margin-bottom:8px}
    .rec-tags{display:flex;gap:8px}
    .tag-color{padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600}
  </style>
</head>
<body>

  <!-- ════════════ PAGE 1: COVER ════════════ -->
  <div class="cover">
    ${logoUrl
      ? `<img src="${logoUrl}" style="height:40px;margin-bottom:32px;position:relative" alt="${companyName}">`
      : `<div class="brand">${companyName}</div>`
    }
    <h1>Rapport d'Audit SEO</h1>
    <div class="subtitle">Analyse complète et recommandations</div>
    <div class="gauge-wrap">${renderSvgGauge(score.global, 180, 14)}</div>
    <div class="grade-label" style="color:${gradeColor(score.global)}">Grade ${score.grade}</div>
    <div class="url-box">${escapeHtml(url)}</div>
    <div class="date">Généré le ${date}</div>
  </div>

  <!-- ════════════ PAGE 2: RÉSUMÉ EXÉCUTIF ════════════ -->
  <div class="page">
    <h2>Résumé Exécutif</h2>

    <div class="gauges-row">
      ${renderMiniGauge(score.technical, "Technique")}
      ${renderMiniGauge(score.onPage, "On-Page")}
      ${renderMiniGauge(score.performance, "Performance")}
      ${renderMiniGauge(score.uxMobile, "UX & Mobile")}
    </div>

    <div class="stat-cards">
      <div class="stat-card critical-card">
        <div class="stat-num">${score.criticalIssues.length}</div>
        <div class="stat-label">Critiques</div>
      </div>
      <div class="stat-card warning-card">
        <div class="stat-num">${score.warnings.length}</div>
        <div class="stat-label">Avertissements</div>
      </div>
      <div class="stat-card passed-card">
        <div class="stat-num">${score.passed.length}</div>
        <div class="stat-label">Réussis</div>
      </div>
    </div>

    <div class="distrib-bar">
      ${critPct > 0 ? `<div class="seg-critical" style="width:${critPct}%"></div>` : ""}
      ${warnPct > 0 ? `<div class="seg-warning" style="width:${warnPct}%"></div>` : ""}
      ${passPct > 0 ? `<div class="seg-passed" style="width:${passPct}%"></div>` : ""}
    </div>
    <div class="distrib-legend">
      <span class="legend-crit">Critiques ${critPct}%</span>
      <span class="legend-warn">Avertissements ${warnPct}%</span>
      <span class="legend-pass">Réussis ${passPct}%</span>
    </div>

    <div class="summary-text">${score.summary}</div>

    <div class="page-footer">
      <span>${companyName}</span>
      <span>${url}</span>
      <span>Page 2 · ${date}</span>
    </div>
  </div>

  <!-- ════════════ PAGES 3-6: DÉTAIL PAR CATÉGORIE ════════════ -->
  ${renderCategoryDetail("Détail Technique", score.technical, technicalChecks, brandColor)}
  ${renderCategoryDetail("Détail On-Page", score.onPage, onPageChecks, brandColor)}
  ${renderCategoryDetail("Détail Performance", score.performance, performanceChecks, brandColor)}
  ${renderCategoryDetail("Détail UX & Mobile", score.uxMobile, uxMobileChecks, brandColor)}

  <!-- ════════════ PROBLÈMES CRITIQUES ════════════ -->
  ${score.criticalIssues.length > 0 ? `
  <div class="page">
    <h2>Problèmes Critiques</h2>
    <p style="color:#64748b;margin-bottom:20px;font-size:13px">
      ${score.criticalIssues.length} problème(s) nécessitant une action immédiate.
    </p>
    <div class="issue-list">
      ${score.criticalIssues.map((issue, i) => renderIssueItem(issue, i + 1, "critical")).join("")}
    </div>
    <div class="page-footer">
      <span>${companyName}</span>
      <span>${url}</span>
      <span>${date}</span>
    </div>
  </div>` : ""}

  <!-- ════════════ AVERTISSEMENTS ════════════ -->
  ${score.warnings.length > 0 ? `
  <div class="page">
    <h2>Avertissements</h2>
    <p style="color:#64748b;margin-bottom:20px;font-size:13px">
      ${score.warnings.length} point(s) d'amélioration identifié(s).
    </p>
    <div class="issue-list">
      ${score.warnings.map((issue, i) => renderIssueItem(issue, i + 1, "warning")).join("")}
    </div>
    <div class="page-footer">
      <span>${companyName}</span>
      <span>${url}</span>
      <span>${date}</span>
    </div>
  </div>` : ""}

  <!-- ════════════ CRITÈRES RÉUSSIS ════════════ -->
  ${score.passed.length > 0 ? `
  <div class="page">
    <h2>Critères Réussis</h2>
    <p style="color:#64748b;margin-bottom:20px;font-size:13px">
      ${score.passed.length} critère(s) validé(s) avec succès.
    </p>
    <div class="passed-grid">
      ${score.passed.map((c) => `
        <div class="passed-item">
          ${statusDot("PASS")}
          <span>${formatCheckName(c.checkName)}</span>
        </div>
      `).join("")}
    </div>
    <div class="page-footer">
      <span>${companyName}</span>
      <span>${url}</span>
      <span>${date}</span>
    </div>
  </div>` : ""}

  <!-- ════════════ MOTS-CLÉS (optionnel) ════════════ -->
  ${keywords?.keywords?.length ? renderKeywordsSection(keywords.keywords, brandColor) : ""}

  <!-- ════════════ PLAN D'ACTION ════════════ -->
  <div class="page">
    <h2>Plan d'Action Priorisé</h2>
    <p style="color:#64748b;margin-bottom:24px;font-size:13px">
      Top ${Math.min(recommendations.length, 10)} actions triées par ROI (Impact / Effort). Commencez par le haut.
    </p>
    ${recommendations.slice(0, 10).map((rec, i) => renderRecItem(rec, i + 1, brandColor)).join("")}
    <div class="page-footer">
      <span>${companyName}</span>
      <span>${url}</span>
      <span>${date}</span>
    </div>
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
