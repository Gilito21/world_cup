/**
 * build-auth-templates.js
 * Genera las plantillas HTML de Supabase Auth (signup confirm, magic link,
 * recovery, email change, invite) usando el shell editorial compartido y
 * las escribe a `supabase/auth-templates/`.
 *
 * Las variables `{{ .ConfirmationURL }}`, `{{ .Email }}`, etc. son las que
 * Supabase Auth sustituye en tiempo de envío (sintaxis Go templates).
 *
 * Uso: node scripts/build-auth-templates.js
 *
 * El output se sube manualmente a:
 *   Supabase Dashboard → Authentication → Email Templates
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandShell, brandButton, brandHeadline, brandKicker, BRAND } from './_brand-email.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = resolve(__dirname, '../supabase/auth-templates')
mkdirSync(OUT_DIR, { recursive: true })

/* Bloque que aparece en todos los emails de auth: link de respaldo en mono
 * por si el botón no rinde (algunos clientes corporativos lo cortan). */
function fallbackLink(url) {
  return `
<p style="margin:24px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.55;text-align:center;">
  ¿No funciona el botón? Copia este enlace en tu navegador:<br>
  <span style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:${BRAND.ink};word-break:break-all;opacity:.85;">${url}</span>
</p>`
}

const URL_VAR = '{{ .ConfirmationURL }}'

// ─── 1. Confirm signup ────────────────────────────────────────────────────────
const confirm = brandShell({
  title: 'Confirma tu email · Porra de Empresas',
  preheader: 'Confirma tu email para entrar a la porra del Mundial 2026.',
  content: `
${brandKicker('Confirma tu email')}
${brandHeadline('Estamos a un clic.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Gracias por unirte a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em> del Mundial 2026. Confirma tu email para activar tu cuenta y empezar a pronosticar.
</p>
${brandButton({ href: URL_VAR, label: 'Confirmar mi email' })}
${fallbackLink(URL_VAR)}
<p style="margin:24px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.6;text-align:center;">
  Si no has sido tú, ignora este email — la cuenta no se activará hasta que confirmes.
</p>`,
  footerNote: 'Este enlace caduca pasadas 24 horas por seguridad.',
})

// ─── 2. Magic link ────────────────────────────────────────────────────────────
const magic = brandShell({
  title: 'Tu enlace para entrar · Porra de Empresas',
  preheader: 'Un solo clic y entras a la porra. Sin contraseña.',
  content: `
${brandKicker('Inicio de sesión')}
${brandHeadline('Entra sin contraseña.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Pediste un enlace de acceso a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em>. Toca el botón y te llevamos directo a tu cuenta.
</p>
${brandButton({ href: URL_VAR, label: 'Entrar a la app' })}
${fallbackLink(URL_VAR)}
<p style="margin:24px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.6;text-align:center;">
  Si no has sido tú quien lo pidió, puedes ignorar el email sin riesgo: el enlace caduca solo.
</p>`,
  footerNote: 'El enlace es de un solo uso y caduca pasada 1 hora.',
})

// ─── 3. Password recovery ─────────────────────────────────────────────────────
const recovery = brandShell({
  title: 'Restablece tu contraseña · Porra de Empresas',
  preheader: 'Pediste cambiar tu contraseña — aquí tienes el enlace.',
  content: `
${brandKicker('Recuperar contraseña')}
${brandHeadline('Vuelve a la porra.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Pediste restablecer tu contraseña. Pulsa el botón y elige una nueva — el resto de la cuenta sigue intacta.
</p>
${brandButton({ href: URL_VAR, label: 'Elegir nueva contraseña' })}
${fallbackLink(URL_VAR)}
<p style="margin:24px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.6;text-align:center;">
  Si no fuiste tú, no hace falta hacer nada: tu contraseña actual sigue siendo válida.
</p>`,
  footerNote: 'El enlace caduca pasada 1 hora por seguridad.',
})

// ─── 4. Email change confirmation ─────────────────────────────────────────────
const emailChange = brandShell({
  title: 'Confirma tu nuevo email · Porra de Empresas',
  preheader: 'Confirma el cambio de email asociado a tu cuenta.',
  content: `
${brandKicker('Cambio de email')}
${brandHeadline('Confirma tu nueva dirección.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Estás a un paso de cambiar el email de tu cuenta a <strong>{{ .NewEmail }}</strong>. Confirma desde aquí y la actualización se aplicará al instante.
</p>
${brandButton({ href: URL_VAR, label: 'Confirmar cambio' })}
${fallbackLink(URL_VAR)}
<p style="margin:24px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.6;text-align:center;">
  Si no has pedido este cambio, ignora el email y avísanos respondiendo a este mensaje.
</p>`,
  footerNote: 'El enlace caduca pasadas 24 horas.',
})

// ─── 5. Invitation ────────────────────────────────────────────────────────────
const invite = brandShell({
  title: 'Te han invitado · Porra de Empresas',
  preheader: 'Te han invitado a la porra del Mundial 2026.',
  content: `
${brandKicker('Invitación')}
${brandHeadline('Te quieren en la porra.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Te han invitado a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em> del Mundial 2026. Acepta la invitación para crear tu cuenta y unirte a la competición.
</p>
${brandButton({ href: URL_VAR, label: 'Aceptar invitación' })}
${fallbackLink(URL_VAR)}`,
  footerNote: 'Esta invitación es personal y caduca pasada una semana.',
})

const files = [
  { name: 'confirm-signup.html', html: confirm },
  { name: 'magic-link.html',     html: magic },
  { name: 'recovery.html',       html: recovery },
  { name: 'email-change.html',   html: emailChange },
  { name: 'invite.html',         html: invite },
]

for (const f of files) {
  writeFileSync(resolve(OUT_DIR, f.name), f.html)
  console.log(`  · ${f.name}`)
}

writeFileSync(resolve(OUT_DIR, 'README.md'), `# Plantillas de Supabase Auth

Generadas con \`node scripts/build-auth-templates.js\` a partir del shell
editorial compartido en \`scripts/_brand-email.js\`.

**No editar a mano** — vuelve a ejecutar el build tras cambiar el helper.

## Cómo aplicarlas

1. Supabase Dashboard → Authentication → Email Templates
2. Por cada plantilla:
   - **Confirm signup** ← \`confirm-signup.html\`
   - **Magic Link** ← \`magic-link.html\`
   - **Change Email Address** ← \`email-change.html\`
   - **Reset Password** ← \`recovery.html\`
   - **Invite user** ← \`invite.html\`
3. Pega el HTML completo en el campo "Message (HTML)".
4. Pega el subject correspondiente en "Message subject" (ver lista abajo).
5. Guarda.

## Subjects

| Plantilla            | Subject                                              |
| -------------------- | ---------------------------------------------------- |
| Confirm signup       | Confirma tu email · Porra de Empresas                |
| Magic Link           | Tu enlace para entrar · Porra de Empresas            |
| Reset Password       | Restablece tu contraseña · Porra de Empresas         |
| Change Email Address | Confirma tu nuevo email · Porra de Empresas          |
| Invite user          | Te han invitado · Porra de Empresas                  |

## Variables Go-templates usadas

- \`{{ .ConfirmationURL }}\` — URL firmada al endpoint correspondiente
- \`{{ .NewEmail }}\` — solo en email-change

Resto de variables disponibles (no usadas aquí): \`{{ .Email }}\`,
\`{{ .Token }}\`, \`{{ .TokenHash }}\`, \`{{ .SiteURL }}\`, \`{{ .RedirectTo }}\`.
`)

console.log(`\n${files.length} plantillas generadas en ${OUT_DIR}`)
