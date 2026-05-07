/**
 * send-reminders.js
 * Envía recordatorios por email a usuarios con partidos próximos sin pronosticar.
 * Ejecutar como cron job en Render cada 30 minutos.
 *
 * Lógica:
 *  - Detecta partidos que empiezan en la ventana [1.5h, 2.5h] desde ahora
 *  - Para cada partido: usuarios con email_reminders=true y sin pronóstico
 *  - Agrupa por usuario (un email con todos sus partidos pendientes)
 *  - Registra en prediction_reminders para no reenviar
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   APP_URL          (ej. https://tu-app.onrender.com)
 *   FROM_EMAIL       (ej. "Porra Mundial <porra@tudominio.com>")
 *                    → Para pruebas puedes usar: onboarding@resend.dev
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()

const SUPABASE_URL   = process.env.SUPABASE_URL
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY     = process.env.RESEND_API_KEY
const APP_URL        = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const FROM_EMAIL     = process.env.FROM_EMAIL ?? 'Porra Mundial <onboarding@resend.dev>'

const WINDOW_START_H = 1.5   // solo se envía si faltan entre 1.5h...
const WINDOW_END_H   = 2.5   // ...y 2.5h para el partido

// ─── Email HTML ───────────────────────────────────────────────────────────────

function matchRow(m) {
  const time = new Date(m.match_date).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit',
  })
  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #3a3835;font-size:14px;color:#e7e5e4;">
        ${m.home_flag}&nbsp;${m.home_team}
      </td>
      <td style="padding:10px 4px;border-bottom:1px solid #3a3835;color:#78716c;text-align:center;font-size:12px;">vs</td>
      <td style="padding:10px 12px;border-bottom:1px solid #3a3835;font-size:14px;color:#e7e5e4;">
        ${m.away_flag}&nbsp;${m.away_team}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #3a3835;font-size:13px;color:#f59e0b;text-align:right;white-space:nowrap;font-weight:600;">
        ${time}
      </td>
    </tr>`
}

function buildEmail({ username, matches }) {
  const plural  = matches.length > 1
  const subject = plural
    ? `⏰ ${matches.length} partidos próximos sin pronosticar`
    : `⏰ ${matches[0].home_team} vs ${matches[0].away_team} — ¡faltan menos de 2h!`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0c0a09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">

    <!-- Cabecera -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:44px;line-height:1;margin-bottom:10px;">⚽</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#f5f5f4;">
        Porra <span style="color:#f59e0b;">Mundial 2026</span>
      </h1>
    </div>

    <!-- Tarjeta principal -->
    <div style="background:#1c1917;border:1px solid #292524;border-radius:16px;padding:24px 20px;">
      <p style="margin:0 0 6px;font-size:16px;color:#e7e5e4;">
        Hola <strong style="color:#fbbf24;">${escHtml(username)}</strong> 👋
      </p>
      <p style="margin:0 0 20px;color:#a8a29e;font-size:14px;line-height:1.5;">
        ${plural
          ? `Tienes <strong style="color:#e7e5e4;">${matches.length} partidos</strong> que empiezan en menos de 2 horas y aún no has pronosticado:`
          : 'Este partido empieza en <strong style="color:#e7e5e4;">menos de 2 horas</strong> y todavía no tienes pronóstico:'}
      </p>

      <!-- Tabla de partidos -->
      <table style="width:100%;border-collapse:collapse;background:#141210;border-radius:10px;overflow:hidden;margin-bottom:24px;">
        ${matches.map(matchRow).join('')}
      </table>

      <!-- CTA -->
      <a href="${APP_URL}/pronosticos"
         style="display:block;background:#f59e0b;color:#0c0a09;text-decoration:none;text-align:center;padding:13px 24px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.01em;">
        Pronosticar ahora →
      </a>
    </div>

    <!-- Pie -->
    <p style="text-align:center;color:#44403c;font-size:12px;margin-top:20px;line-height:1.6;">
      Recibes este email porque tienes los recordatorios activados.<br>
      Puedes desactivarlos desde tu
      <a href="${APP_URL}/perfil" style="color:#78716c;text-decoration:underline;">perfil en la app</a>.
    </p>

  </div>
</body>
</html>`

  return { subject, html }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Envío via Resend API ─────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] Comprobando recordatorios...`)

  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan vars de Supabase'); process.exit(1) }
  if (!RESEND_KEY)                    { console.error('Falta RESEND_API_KEY');     process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const now        = new Date()
  const windowStart = new Date(now.getTime() + WINDOW_START_H * 3_600_000)
  const windowEnd   = new Date(now.getTime() + WINDOW_END_H   * 3_600_000)

  // 1. Partidos en la ventana [1.5h, 2.5h]
  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('id, home_team, away_team, home_flag, away_flag, match_date')
    .eq('status', 'scheduled')
    .gte('match_date', windowStart.toISOString())
    .lte('match_date', windowEnd.toISOString())

  if (matchErr) throw matchErr
  if (!matches || matches.length === 0) {
    console.log('Sin partidos en la ventana. Nada que enviar.')
    return
  }

  console.log(`${matches.length} partido(s) en la ventana.`)
  const matchIds = matches.map(m => m.id)

  // 2. Usuarios con email_reminders = true
  const { data: { users: authUsers }, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (usersErr) throw usersErr

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, email_reminders')
    .eq('email_reminders', true)

  const activeProfiles  = new Map((profiles ?? []).map(p => [p.id, p]))
  const emailByUserId   = new Map(authUsers.map(u => [u.id, u.email]))

  // 3. Pronósticos existentes para estos partidos
  const { data: preds } = await supabase
    .from('predictions')
    .select('user_id, match_id')
    .in('match_id', matchIds)

  const predicted = new Set((preds ?? []).map(p => `${p.user_id}|${p.match_id}`))

  // 4. Recordatorios ya enviados
  const { data: alreadySent } = await supabase
    .from('prediction_reminders')
    .select('user_id, match_id')
    .in('match_id', matchIds)

  const sent = new Set((alreadySent ?? []).map(r => `${r.user_id}|${r.match_id}`))

  // 5. Construir mapa usuario → partidos pendientes
  const pending = new Map() // userId → [match, ...]

  for (const match of matches) {
    for (const [userId] of activeProfiles) {
      const key = `${userId}|${match.id}`
      if (!predicted.has(key) && !sent.has(key)) {
        if (!pending.has(userId)) pending.set(userId, [])
        pending.get(userId).push(match)
      }
    }
  }

  if (pending.size === 0) {
    console.log('Todos los usuarios ya tienen pronósticos o recordatorios enviados.')
    return
  }

  // 6. Enviar emails y registrar
  let okCount = 0
  let errCount = 0

  for (const [userId, userMatches] of pending) {
    const email    = emailByUserId.get(userId)
    const profile  = activeProfiles.get(userId)
    if (!email || !profile) continue

    try {
      const { subject, html } = buildEmail({ username: profile.username, matches: userMatches })
      await sendEmail(email, subject, html)

      // Registrar para no reenviar
      await supabase
        .from('prediction_reminders')
        .upsert(
          userMatches.map(m => ({ user_id: userId, match_id: m.id })),
          { onConflict: 'user_id,match_id', ignoreDuplicates: true }
        )

      console.log(`✉️  Enviado a ${profile.username} (${userMatches.length} partido(s))`)
      okCount++
    } catch (err) {
      console.error(`❌ Error enviando a ${profile?.username}: ${err.message}`)
      errCount++
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`✅ ${okCount} emails enviados · ${errCount} errores · ${elapsed}s`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
