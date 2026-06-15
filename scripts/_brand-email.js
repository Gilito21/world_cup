/**
 * _brand-email.js
 * Shell editorial compartido por todos los correos transaccionales.
 *
 * Paleta y marca alineadas con la landing / app:
 *   - cream  #F4ECD6  fondo página
 *   - paper  #EDE3C4  card
 *   - ink    #0E2A18  texto / CTA primario
 *   - terra  #C8552B  acento (italics, badges)
 *
 * Convenciones email: tablas para layout, estilos inline, 600px máx.
 * Outlook desktop no entiende radial-gradient ni border-radius en
 * <a> → caemos a sólidos vía background-color y conditional MSO.
 */

export const BRAND = Object.freeze({
  cream:    '#F4ECD6',
  paper:    '#EDE3C4',
  ink:      '#0E2A18',
  inkSoft:  '#1C4D2C',
  terra:    '#C8552B',
  terra2:   '#E58A2E',
  green:    '#2E8B45',  // acierto exacto (+3): verde vivo. El +1 (tendencia) usa terra/clay.
  rule:     'rgba(14,42,24,0.18)',
})

export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/* Wordmark "P●RRA de empresas" en tabla.
 * El balón usa background-color sólido como fallback Outlook y un
 * radial-gradient encima para clientes que lo soportan. */
function wordmark() {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;">
  <tr>
    <td valign="middle" style="font-family:'Boldonse','Anton','Arial Black',Impact,Helvetica,sans-serif;font-weight:900;font-size:38px;color:${BRAND.ink};letter-spacing:-.02em;line-height:1;padding:0;">P</td>
    <td valign="middle" style="padding:0 3px;line-height:0;">
      <span style="display:inline-block;width:30px;height:30px;border-radius:50%;background-color:${BRAND.ink};background-image:radial-gradient(circle at 36% 30%,#ffffff 0 26%,${BRAND.ink} 27% 31%,#ffffff 32% 62%,${BRAND.ink} 63% 67%,#ffffff 68% 100%);box-shadow:inset 0 0 0 2px ${BRAND.ink};vertical-align:middle;">&nbsp;</span>
    </td>
    <td valign="middle" style="font-family:'Boldonse','Anton','Arial Black',Impact,Helvetica,sans-serif;font-weight:900;font-size:38px;color:${BRAND.ink};letter-spacing:-.02em;line-height:1;padding:0;">RRA</td>
    <td valign="middle" style="padding:0 0 0 12px;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;font-size:30px;color:${BRAND.terra};line-height:.9;">de empresas</td>
  </tr>
</table>`
}

/* "ATLAS MUNDIAL ★ EDICIÓN '26" en mono small caps, separator opcional. */
function editorialTagline() {
  return `
<div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${BRAND.ink};opacity:.65;line-height:1;">
  ATLAS MUNDIAL &nbsp;<span style="color:${BRAND.terra};opacity:1;">★</span>&nbsp; EDICIÓN &rsquo;26
</div>`
}

/* Bulletproof CTA. variant: 'primary' (ink) | 'terracotta'. */
export function brandButton({ href, label, variant = 'primary' }) {
  const bg = variant === 'terracotta' ? BRAND.terra : BRAND.ink
  const fg = BRAND.cream
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${bg};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;line-height:1;letter-spacing:.01em;color:${fg};text-decoration:none;">${escHtml(label)} &rarr;</a>
    </td>
  </tr>
</table>`
}

/* Editorial section heading: pequeño, mono, kerning ancho. */
export function brandKicker(text) {
  return `<div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;margin:0 0 8px;">${escHtml(text)}</div>`
}

/* Título display serif. */
export function brandHeadline(text) {
  return `<h1 style="margin:0 0 14px;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:1.05;color:${BRAND.ink};letter-spacing:-.01em;">${escHtml(text)}</h1>`
}

/**
 * Wrapper completo. `content` es HTML ya formateado que va dentro
 * de la card paper.
 */
export function brandShell({
  title,
  preheader = '',
  content,
  footerNote = '¿Preguntas? Responde a este email y te leemos.',
  appUrl = 'https://www.porradeempresas.com',
}) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    table, td { mso-line-height-rule:exactly; }
    .ink-fallback { background:${BRAND.ink} !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink};">
  <div style="display:none !important;font-size:1px;color:${BRAND.cream};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background:${BRAND.cream};">
    <tr>
      <td align="center" style="padding:36px 16px 28px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Wordmark -->
          <tr><td align="center" style="padding:4px 0 28px;">${wordmark()}</td></tr>

          <!-- Card paper -->
          <tr>
            <td bgcolor="${BRAND.paper}" style="background:${BRAND.paper};border:1px solid ${BRAND.ink};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="padding:36px 36px 32px;">${content}</td></tr>
              </table>
            </td>
          </tr>

          <!-- Tagline editorial -->
          <tr><td align="center" style="padding:22px 8px 6px;">${editorialTagline()}</td></tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:10px 24px 0;">
              <p style="margin:0 0 6px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.62;">${escHtml(footerNote)}</p>
              <p style="margin:0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.45;">
                <a href="${appUrl}" style="color:${BRAND.ink};text-decoration:none;opacity:.7;">porradeempresas.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/* Caja "feature row" reutilizable (icono + texto). */
export function brandFeatureRow({ icon, title, body }) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.rule};">
  <tr>
    <td valign="top" width="36" style="padding:14px 12px 14px 0;font-size:20px;line-height:1;">${icon}</td>
    <td valign="top" style="padding:14px 0;">
      <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};margin:0 0 2px;">${escHtml(title)}</div>
      <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;">${escHtml(body)}</div>
    </td>
  </tr>
</table>`
}

/* Stat / KPI tile editorial: kicker + valor grande + sub. */
export function brandStatTile({ kicker, value, sub }) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background:${BRAND.cream};border:1px solid ${BRAND.ink};border-left:6px solid ${BRAND.terra};">
  <tr>
    <td style="padding:16px 20px;">
      <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.6;margin:0 0 6px;">${escHtml(kicker)}</div>
      <div style="font-family:'Instrument Serif',Georgia,serif;font-size:34px;line-height:1;color:${BRAND.ink};letter-spacing:-.01em;">${value}</div>
      ${sub ? `<div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.ink};opacity:.65;margin-top:6px;">${escHtml(sub)}</div>` : ''}
    </td>
  </tr>
</table>`
}
