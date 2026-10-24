import { CATEGORY_LABELS, CHECK_ADVICE, findingCoverageLabel, getCheckLabel, groupAuditFindings, isCriticalFinding } from "@seo/shared"
import type { AuditFinding, Category } from "@seo/shared"
import { isValidPublicUrl } from "@seo/shared/security"
import type { ReportData } from "./index"

export function escapeReportHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}
const esc = escapeReportHtml
const PRIORITY_LABELS = { HIGH: "Haute", MEDIUM: "Moyenne", LOW: "Faible" }

function scoreColor(score: number): string {
  return score >= 75 ? "#15803d" : score >= 60 ? "#a16207" : "#b91c1c"
}

function clip(value: string | null | undefined, length = 220): string {
  if (!value) return ""
  return esc(value.length > length ? value.slice(0, length - 1) + "…" : value)
}

function renderFinding(finding: AuditFinding, index: number, data: ReportData): string {
  const critical = isCriticalFinding(finding)
  const affected = finding.occurrences.filter(check => check.status !== "PASS")
  const samples = []
  const seen = new Set<string>()
  for (const check of affected) {
    const signature = JSON.stringify([check.message, check.value, check.expected])
    if (seen.has(signature)) continue
    seen.add(signature)
    samples.push(check)
    if (samples.length === 2) break
  }
  const recommendation = data.recommendations.find(rec => rec.checkName === finding.checkName)
  const advice = CHECK_ADVICE[finding.checkName] ?? recommendation?.description
    ?? "Examinez les pages concernées et adaptez la correction au constat relevé."
  return `<article class="finding" id="finding-${index}">
    <div class="finding-heading">
      <span class="finding-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="finding-title"><h3>${esc(getCheckLabel(finding.checkName))}</h3><p>${esc(CATEGORY_LABELS[finding.category])} · Priorité ${PRIORITY_LABELS[finding.priority].toLowerCase()}</p></div>
      <span class="pill ${critical ? "critical" : "warning"}">${critical ? "Prioritaire" : finding.status === "FAIL" ? "À corriger" : "À vérifier"}</span>
    </div>
    <div class="coverage"><strong>${esc(findingCoverageLabel(finding))}</strong><span>${finding.status === "FAIL" ? `${finding.failCount} en échec` : ""}${finding.failCount && finding.warnCount ? " · " : ""}${finding.warnCount ? `${finding.warnCount} à vérifier` : ""}${finding.passCount ? ` · ${finding.passCount} conformes` : ""}</span></div>
    <div class="advice"><span class="eyebrow">Action recommandée</span><p>${clip(advice, 420)}</p></div>
    <div class="evidence"><span class="eyebrow">${samples.length > 1 ? "Exemples de constats" : "Exemple de constat"}</span>
      ${samples.map(check => `<div class="sample">
        ${check.pageUrl ? `<div class="sample-url">${clip(check.pageUrl, 180)}</div>` : ""}
        <p>${clip(check.message)}</p>
        ${check.value || check.expected ? `<div class="sample-values">${check.value ? `<span><b>Observé</b> ${clip(check.value, 140)}</span>` : ""}${check.expected ? `<span><b>Référence</b> ${clip(check.expected, 140)}</span>` : ""}</div>` : ""}
      </div>`).join("")}
    </div>
  </article>`
}

export function generateReportHTML(data: ReportData): string {
  const { score, tenantBranding } = data
  const brandColor = tenantBranding?.brandColor && /^#[0-9a-fA-F]{6}$/.test(tenantBranding.brandColor) ? tenantBranding.brandColor : "#2563eb"
  const logoUrl = tenantBranding?.logoUrl && isValidPublicUrl(tenantBranding.logoUrl) ? tenantBranding.logoUrl : ""
  const companyName = esc(tenantBranding?.name ?? "404 SEO")
  const findings = groupAuditFindings(data.checks ?? [...score.criticalIssues, ...score.warnings, ...score.passed])
  const critical = findings.filter(isCriticalFinding)
  const improvements = findings.filter(finding => finding.status !== "PASS" && !isCriticalFinding(finding))
  const problems = [...critical, ...improvements]
  const passed = findings.filter(finding => finding.status === "PASS")
  const occurrences = problems.reduce((sum, finding) => sum + finding.affectedCount, 0)
  const categories: { key: Category; score: number }[] = [
    { key: "TECHNICAL", score: score.technical }, { key: "ON_PAGE", score: score.onPage },
    { key: "PERFORMANCE", score: score.performance }, { key: "UX_MOBILE", score: score.uxMobile },
  ]
  const pageKeys = new Set(data.checks?.map(check => check.pageUrl ?? check.pageId).filter(Boolean))
  const totalPages = data.totalPages ?? (pageKeys.size || undefined)
  const circumference = 2 * Math.PI * 46
  const gaugeScore = Math.max(0, Math.min(100, score.global))

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Audit SEO - ${esc(data.url)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,'Segoe UI',sans-serif;color:#172238;font-size:12px;line-height:1.5;background:#fff}
    @page{size:A4;margin:16mm 16mm 18mm}h1,h2,h3,p{margin:0}h1{font-size:34px;line-height:1.14;letter-spacing:-1px}h2{font-size:21px;line-height:1.25;letter-spacing:-.4px}h3{font-size:15px;line-height:1.4}a{color:inherit;text-decoration:none}strong{font-weight:700}
    .eyebrow{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:#62728a}.brand-row{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid #dfe5ed;margin-bottom:24px}.brand{font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px}.brand img{max-width:120px;max-height:34px;object-fit:contain}.date{color:#62728a;font-size:12px}
    .hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:25px 28px;border-radius:16px;background:#102139;color:#fff}.hero-copy{flex:1;min-width:0}.hero .eyebrow{color:#a9c3e7;margin-bottom:10px}.hero .url{color:#bdcbe0;font-size:13px;margin-top:14px;overflow-wrap:anywhere}.score{flex-shrink:0;text-align:center}.score svg{display:block}.score-label{font-size:12px;color:#bdcbe0;margin-top:3px}
    .intro{font-size:13px;line-height:1.7;color:#485971;margin:20px 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0 24px}.stat{border:1px solid #dfe5ed;border-radius:10px;padding:13px 12px}.stat strong{display:block;font-size:27px;line-height:1.15;letter-spacing:-1px}.stat span{display:block;margin-top:6px;font-size:11px;color:#62728a}.stat.urgent{border-top:3px solid #dc2626}.stat.improve{border-top:3px solid #d97706}.stat.good{border-top:3px solid #16a34a}.stat.scope{border-top:3px solid ${brandColor}}
    .section-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:24px 0 12px;break-after:avoid}.section-title span{font-size:12px;color:#62728a}.score-table{width:100%;border-collapse:collapse}.score-table td{padding:10px 0;border-bottom:1px solid #edf0f5}.score-table td:last-child{text-align:right;font-weight:700;font-size:13px}.score-track{width:140px;height:5px;background:#e9edf3;border-radius:4px;overflow:hidden}.score-track i{display:block;height:100%;border-radius:4px}.score-table .bar-cell{width:165px}
    .quick-list{border:1px solid #dfe5ed;border-radius:10px;padding:0 14px}.quick-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #edf0f5}.quick-row:last-child{border:0}.quick-row b{color:${brandColor};font-size:13px}.quick-row strong{flex:1;font-size:12px}.quick-row span{color:#62728a;font-size:12px}.reading-note{font-size:12px;color:#62728a;margin-top:13px;line-height:1.7}
    .details-section,.appendix,.keywords{break-before:page}.section-lead{margin:10px 0 18px;color:#62728a;font-size:12px;line-height:1.7}.finding{border:1px solid #dfe5ed;border-radius:12px;padding:17px 18px;margin-bottom:14px;break-inside:avoid}.finding-heading{display:flex;align-items:flex-start;gap:11px}.finding-number{font-size:12px;color:${brandColor};background:${brandColor}12;border-radius:6px;padding:5px 7px;font-weight:700}.finding-title{flex:1;min-width:0}.finding-title p{font-size:11px;color:#62728a;margin-top:3px}.pill{white-space:nowrap;border-radius:5px;padding:4px 7px;font-size:11px;font-weight:700}.pill.critical{background:#fef2f2;color:#b91c1c}.pill.warning{background:#fffbeb;color:#92400e}.coverage{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0;padding:8px 0;border-top:1px solid #edf0f5;border-bottom:1px solid #edf0f5;font-size:12px}.coverage span{color:#62728a;font-size:11px}.advice p{margin-top:5px;line-height:1.6;font-size:12px;color:#34465f}.evidence{margin-top:12px}.sample{margin-top:7px;padding:8px 10px;background:#f6f8fb;border-radius:6px;overflow-wrap:anywhere;line-height:1.55;color:#485971;font-size:11px}.sample-url{font-size:10px;color:#355c91;margin-bottom:3px}.sample-values{display:flex;gap:14px;margin-top:5px;font-size:10px;color:#62728a}.sample-values span{flex:1;min-width:0}.sample-values b{color:#485971;margin-right:4px}
    table.controls{width:100%;border-collapse:collapse;font-size:12px}.controls thead{display:table-header-group}.controls th{text-align:left;color:#62728a;font-weight:600;font-size:11px;padding:9px 10px;border-bottom:1px solid #cdd6e2}.controls td{padding:10px;border-bottom:1px solid #edf0f5}.controls tr{break-inside:avoid}.controls td:last-child{text-align:right}.controls tbody tr:nth-child(even){background:#f8fafc}.conform{color:#15803d;font-weight:700}.method{margin-top:20px;border-left:3px solid ${brandColor};padding:10px 14px;background:#f6f8fb;color:#62728a;font-size:12px;line-height:1.7}.empty{padding:20px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:10px;color:#166534}.keywords td,.keywords th{overflow-wrap:anywhere}
  </style></head><body>
    <section class="overview">
      <div class="brand-row"><div class="brand">${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ""}${companyName}</div><div class="date">${esc(data.date)}</div></div>
      <div class="hero"><div class="hero-copy"><span class="eyebrow">Diagnostic & priorités</span><h1>Votre audit SEO,<br>l’essentiel pour agir.</h1><p class="url">${esc(data.url)}</p></div>
        <div class="score"><svg width="116" height="116" viewBox="0 0 116 116"><circle cx="58" cy="58" r="46" fill="none" stroke="#30445e" stroke-width="7"/><circle cx="58" cy="58" r="46" fill="none" stroke="#81cbb4" stroke-width="7" stroke-linecap="round" stroke-dasharray="${circumference * gaugeScore / 100} ${circumference}" transform="rotate(-90 58 58)"/><text x="58" y="59" fill="#fff" text-anchor="middle" dominant-baseline="central" font-size="34" font-weight="700">${score.global}</text><text x="58" y="82" fill="#bdcbe0" text-anchor="middle" font-size="10">sur 100</text></svg><p class="score-label">Grade ${esc(score.grade)}</p></div>
      </div>
      <p class="intro">${esc(score.summary)}</p>
      <div class="stats"><div class="stat urgent"><strong>${critical.length}</strong><span>types de problèmes prioritaires</span></div><div class="stat improve"><strong>${improvements.length}</strong><span>types de points à améliorer</span></div><div class="stat good"><strong>${passed.length}</strong><span>contrôles entièrement conformes</span></div><div class="stat scope"><strong>${totalPages ?? findings.length}</strong><span>${totalPages === undefined ? "types de contrôles réalisés" : "pages analysées"}</span></div></div>
      <div class="section-title"><h2>La santé de votre site</h2><span>Scores par catégorie / 100</span></div>
      <table class="score-table">${categories.map(category => `<tr><td>${esc(CATEGORY_LABELS[category.key])}</td><td class="bar-cell"><div class="score-track"><i style="width:${Math.max(0, Math.min(100, category.score))}%;background:${scoreColor(category.score)}"></i></div></td><td style="color:${scoreColor(category.score)}">${category.score}</td></tr>`).join("")}</table>
      <div class="section-title"><h2>Par où commencer</h2><span>${problems.length} types de problèmes regroupés</span></div>
      ${problems.length ? `<div class="quick-list">${problems.slice(0, 3).map((finding, index) => `<a class="quick-row" href="#finding-${index}"><b>0${index + 1}</b><strong>${esc(getCheckLabel(finding.checkName))}</strong><span>${esc(findingCoverageLabel(finding))}</span></a>`).join("")}</div>` : `<p class="empty">Aucun problème relevé sur les contrôles effectués.</p>`}
      <p class="reading-note">${occurrences} constats non conformes regroupés en ${problems.length} types de problèmes. Un même contrôle peut concerner plusieurs pages : ces répétitions ne sont pas autant de corrections différentes.</p>
    </section>
    ${problems.length ? `<section class="details-section"><span class="eyebrow">Plan d’action</span><h2>Les problèmes, sans les répétitions</h2><p class="section-lead">Classement par gravité, priorité puis étendue. Chaque fiche donne une action et jusqu’à deux exemples distincts. La liste complète des pages et des valeurs reste consultable dans le rapport sur le site.</p>${problems.map((finding, index) => renderFinding(finding, index, data)).join("")}</section>` : ""}
    <section class="appendix"><span class="eyebrow">Vérifications & périmètre</span><h2>Ce qui fonctionne déjà</h2><p class="section-lead">Seuls les contrôles conformes sur toutes leurs pages vérifiées figurent ici. Les réussites partielles restent comptabilisées dans les fiches des problèmes concernés.</p>
      ${passed.length ? `<table class="controls"><thead><tr><th>Contrôle</th><th>Catégorie</th><th>Couverture</th></tr></thead><tbody>${passed.map(finding => `<tr><td>${esc(getCheckLabel(finding.checkName))}</td><td>${esc(CATEGORY_LABELS[finding.category])}</td><td class="conform">${esc(findingCoverageLabel(finding))}</td></tr>`).join("")}</tbody></table>` : `<p>Aucun contrôle entièrement conforme sur le périmètre analysé.</p>`}
      <div class="method"><strong>Comment lire ce rapport</strong><br>Un problème correspond à un type de contrôle dans une catégorie. Les occurrences sont regroupées sans modifier les scores de l’audit. La couverture porte sur les pages effectivement vérifiées pour ce contrôle. Les exemples du PDF sont limités ; le rapport sur le site conserve le détail par page. Les priorités organisent les vérifications et ne prédisent pas un gain de trafic.</div>
    </section>
    ${data.keywords?.keywords.length ? `<section class="keywords"><span class="eyebrow">Contenu</span><h2>Mots-clés identifiés</h2><p class="section-lead">Les ${Math.min(20, data.keywords.keywords.length)} principaux termes extraits du contenu analysé. Ces données ne constituent pas un classement dans les moteurs de recherche.</p><table class="controls"><thead><tr><th>Mot-clé</th><th>Occurrences</th><th>Pages</th><th>Score</th></tr></thead><tbody>${data.keywords.keywords.slice(0, 20).map(keyword => `<tr><td>${esc(keyword.term)}</td><td>${keyword.totalCount}</td><td>${keyword.pageCount}</td><td>${keyword.avgScore}</td></tr>`).join("")}</tbody></table></section>` : ""}
  </body></html>`
}

