// lib/email.ts — Service email via Resend HTTP API (pas de dépendance npm)

const RESEND_API_KEY = () => process.env.RESEND_API_KEY || ""
const FROM_EMAIL = () => process.env.EMAIL_FROM || "404 SEO <noreply@seo.404notfood.fr>"
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://seo.404notfood.fr"

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const apiKey = RESEND_API_KEY()
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY non configurée, email ignoré")
    return false
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL(),
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("[email] Erreur Resend:", res.status, err)
      return false
    }

    return true
  } catch (err) {
    console.error("[email] Erreur envoi:", err)
    return false
  }
}

// ── Templates ──────────────────────────────────────────────

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px; margin: 0 auto; padding: 40px 20px;
  background: #0f172a; color: #f1f5f9;
`
const btnStyle = `
  display: inline-block; padding: 12px 32px; background: #2563eb;
  color: #ffffff; text-decoration: none; border-radius: 8px;
  font-weight: 600; font-size: 16px;
`

function wrap(content: string): string {
  return `
    <div style="${baseStyle}">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #2563eb; font-size: 24px; margin: 0;">404 SEO</h1>
      </div>
      ${content}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
        <p>404 SEO — Audit SEO professionnel</p>
        <p><a href="${APP_URL()}" style="color: #2563eb;">seo.404notfood.fr</a></p>
      </div>
    </div>
  `
}

// ── Emails publics ──────────────────────────────────────────

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const url = `${APP_URL()}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(APP_URL() + "/dashboard")}`
  return sendEmail({
    to,
    subject: "Vérifiez votre adresse email — 404 SEO",
    html: wrap(`
      <h2 style="color: #f1f5f9; font-size: 20px;">Bienvenue sur 404 SEO !</h2>
      <p style="color: #94a3b8; line-height: 1.6;">
        Cliquez sur le bouton ci-dessous pour confirmer votre adresse email et activer votre compte.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${url}" style="${btnStyle}">Vérifier mon email</a>
      </div>
      <p style="color: #64748b; font-size: 13px;">
        Si vous n'avez pas créé de compte, ignorez cet email.
      </p>
    `),
  })
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Bienvenue sur 404 SEO !",
    html: wrap(`
      <h2 style="color: #f1f5f9; font-size: 20px;">Bienvenue ${name} !</h2>
      <p style="color: #94a3b8; line-height: 1.6;">
        Votre compte 404 SEO est prêt. Commencez par créer votre premier projet et lancez un audit SEO.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL()}/dashboard" style="${btnStyle}">Accéder au dashboard</a>
      </div>
      <ul style="color: #94a3b8; line-height: 2;">
        <li>Créez un projet pour votre site</li>
        <li>Lancez votre premier audit SEO</li>
        <li>Analysez les résultats et corrigez les problèmes</li>
      </ul>
    `),
  })
}

export async function sendAuditCompleteEmail(
  to: string,
  auditId: string,
  url: string,
  score: number
): Promise<boolean> {
  const scoreColor = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444"
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 50 ? "D" : "F"

  return sendEmail({
    to,
    subject: `Audit terminé : ${url} — Score ${score}/100`,
    html: wrap(`
      <h2 style="color: #f1f5f9; font-size: 20px;">Votre audit est terminé !</h2>
      <p style="color: #94a3b8;">Résultats pour <strong style="color: #f1f5f9;">${url}</strong></p>
      <div style="text-align: center; margin: 32px 0;">
        <div style="display: inline-block; width: 120px; height: 120px; border-radius: 50%; border: 6px solid ${scoreColor}; line-height: 120px; text-align: center;">
          <span style="font-size: 36px; font-weight: bold; color: ${scoreColor};">${score}</span>
        </div>
        <p style="color: ${scoreColor}; font-size: 24px; font-weight: bold; margin-top: 8px;">Grade ${grade}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL()}/audits/${auditId}" style="${btnStyle}">Voir les détails</a>
      </div>
    `),
  })
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const url = `${APP_URL()}/reset-password?token=${token}`
  return sendEmail({
    to,
    subject: "Réinitialisation de mot de passe — 404 SEO",
    html: wrap(`
      <h2 style="color: #f1f5f9; font-size: 20px;">Réinitialisation de mot de passe</h2>
      <p style="color: #94a3b8; line-height: 1.6;">
        Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${url}" style="${btnStyle}">Réinitialiser le mot de passe</a>
      </div>
      <p style="color: #64748b; font-size: 13px;">
        Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.
      </p>
    `),
  })
}

export async function sendWeeklyGADigestEmail(
  to: string,
  data: {
    siteName: string
    sessions: number
    users: number
    pageviews: number
    bounceRate: number
    avgDuration: number
    sessionsChange?: number
    topQueries?: Array<{ query: string; clicks: number; impressions: number; position: number }>
  }
): Promise<boolean> {
  const { siteName, sessions, users, pageviews, bounceRate, avgDuration, sessionsChange, topQueries } = data

  const changeHtml = sessionsChange !== undefined
    ? `<span style="color: ${sessionsChange >= 0 ? "#22c55e" : "#ef4444"}; font-size: 14px; font-weight: 600;">
        ${sessionsChange >= 0 ? "+" : ""}${sessionsChange}%
      </span>`
    : ""

  const gscHtml = topQueries && topQueries.length > 0 ? `
    <h3 style="color: #f1f5f9; font-size: 16px; margin-top: 32px;">Top requêtes Search Console</h3>
    <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
      <tr style="border-bottom: 1px solid #1e293b;">
        <th style="text-align: left; padding: 8px 4px; color: #64748b; font-size: 12px;">Requête</th>
        <th style="text-align: right; padding: 8px 4px; color: #64748b; font-size: 12px;">Clics</th>
        <th style="text-align: right; padding: 8px 4px; color: #64748b; font-size: 12px;">Pos.</th>
      </tr>
      ${topQueries.slice(0, 10).map(q => `
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 8px 4px; color: #f1f5f9; font-size: 13px;">${q.query}</td>
          <td style="text-align: right; padding: 8px 4px; color: #06b6d4; font-size: 13px; font-weight: 600;">${q.clicks}</td>
          <td style="text-align: right; padding: 8px 4px; color: #94a3b8; font-size: 13px;">${q.position.toFixed(1)}</td>
        </tr>
      `).join("")}
    </table>
  ` : ""

  return sendEmail({
    to,
    subject: `Rapport hebdo — ${siteName} — ${sessions} sessions`,
    html: wrap(`
      <h2 style="color: #f1f5f9; font-size: 20px;">Rapport hebdomadaire</h2>
      <p style="color: #94a3b8;">Résumé des 7 derniers jours pour <strong style="color: #f1f5f9;">${siteName}</strong></p>

      <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0;">
        <div style="flex: 1; min-width: 120px; background: #1e293b; border-radius: 12px; padding: 16px; text-align: center;">
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Sessions</div>
          <div style="color: #2563eb; font-size: 24px; font-weight: bold;">${sessions.toLocaleString("fr-FR")}</div>
          ${changeHtml}
        </div>
        <div style="flex: 1; min-width: 120px; background: #1e293b; border-radius: 12px; padding: 16px; text-align: center;">
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Utilisateurs</div>
          <div style="color: #06b6d4; font-size: 24px; font-weight: bold;">${users.toLocaleString("fr-FR")}</div>
        </div>
        <div style="flex: 1; min-width: 120px; background: #1e293b; border-radius: 12px; padding: 16px; text-align: center;">
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Pages vues</div>
          <div style="color: #8b5cf6; font-size: 24px; font-weight: bold;">${pageviews.toLocaleString("fr-FR")}</div>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; min-width: 120px; background: #1e293b; border-radius: 12px; padding: 16px; text-align: center;">
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Taux de rebond</div>
          <div style="color: #f59e0b; font-size: 24px; font-weight: bold;">${bounceRate.toFixed(1)}%</div>
        </div>
        <div style="flex: 1; min-width: 120px; background: #1e293b; border-radius: 12px; padding: 16px; text-align: center;">
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Durée moy.</div>
          <div style="color: #10b981; font-size: 24px; font-weight: bold;">${Math.floor(avgDuration / 60)}m${Math.round(avgDuration % 60)}s</div>
        </div>
      </div>

      ${gscHtml}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL()}/dashboard" style="${btnStyle}">Voir le dashboard</a>
      </div>
    `),
  })
}

export async function sendQuotaWarningEmail(
  to: string,
  quotaType: string,
  used: number,
  total: number
): Promise<boolean> {
  const pct = Math.round((used / total) * 100)
  return sendEmail({
    to,
    subject: `Quota ${quotaType} à ${pct}% — 404 SEO`,
    html: wrap(`
      <h2 style="color: #f1f5f9; font-size: 20px;">Alerte quota</h2>
      <p style="color: #94a3b8; line-height: 1.6;">
        Votre quota <strong style="color: #f1f5f9;">${quotaType}</strong> est utilisé à <strong style="color: #f59e0b;">${pct}%</strong> (${used}/${total}).
      </p>
      <p style="color: #94a3b8; line-height: 1.6;">
        Passez à un plan supérieur pour augmenter vos limites.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL()}/settings/billing" style="${btnStyle}">Gérer mon plan</a>
      </div>
    `),
  })
}
