import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../contexts/LangContext'
import { appUrl } from '../lib/appUrl'
import useScrollLock from '../lib/useScrollLock'

function CopyButton({ text, label }) {
  const { t } = useLang()
  const displayLabel = label ?? t('common.copy')
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {/* clipboard blocked */}
  }
  return (
    <button onClick={handleCopy} className="btn-secondary text-xs px-3 py-2 flex-shrink-0">
      {copied ? '✓' : displayLabel}
    </button>
  )
}

// Draw text letter-by-letter to simulate letterSpacing (not natively supported on canvas)
function fillSpacedText(ctx, text, x, y, spacing) {
  const chars = [...text]
  const totalW = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, 0) - spacing
  let cx = x - totalW / 2
  for (const ch of chars) {
    ctx.fillText(ch, cx + ctx.measureText(ch).width / 2, y)
    cx += ctx.measureText(ch).width + spacing
  }
}

function generateShareImage({ leagueName, inviteCode, joinText, appName, inviteLink, codeLabel }) {
  const W = 1200, H = 675
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'middle'

  // ── BACKGROUND ─────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0,   '#080c18')
  bg.addColorStop(0.5, '#0d1427')
  bg.addColorStop(1,   '#060a14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Blue glow left
  const gl = ctx.createRadialGradient(160, H / 2, 0, 160, H / 2, 420)
  gl.addColorStop(0, 'rgba(37, 99, 235, 0.28)')
  gl.addColorStop(1, 'rgba(37, 99, 235, 0)')
  ctx.fillStyle = gl
  ctx.fillRect(0, 0, W, H)

  // Amber glow right
  const gr = ctx.createRadialGradient(W - 160, H / 2, 0, W - 160, H / 2, 420)
  gr.addColorStop(0, 'rgba(245, 158, 11, 0.22)')
  gr.addColorStop(1, 'rgba(245, 158, 11, 0)')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, W, H)

  // Diagonal lines texture
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  for (let i = -H; i < W + H; i += 36) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke()
  }
  ctx.restore()

  // ── GOLD GRADIENT helper ────────────────────────────────────────────
  function goldGrad(x1, x2, y) {
    const g = ctx.createLinearGradient(x1, y, x2, y)
    g.addColorStop(0,   'rgba(245,158,11,0)')
    g.addColorStop(0.2, 'rgba(245,158,11,0.7)')
    g.addColorStop(0.5, 'rgba(251,191,36,1)')
    g.addColorStop(0.8, 'rgba(245,158,11,0.7)')
    g.addColorStop(1,   'rgba(245,158,11,0)')
    return g
  }

  // ── TOP: App name ───────────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(251,191,36,0.75)'
  ctx.fillText(appName.toUpperCase(), W / 2, 46)

  // ── TITLE: "ÚNETE A MI LIGA" ────────────────────────────────────────
  ctx.font = 'bold 72px system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(245,158,11,0.45)'
  ctx.shadowBlur = 28
  ctx.fillText(joinText.toUpperCase(), W / 2, 140)
  ctx.shadowBlur = 0

  // ── LEAGUE NAME ─────────────────────────────────────────────────────
  ctx.font = 'bold 36px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.50)'
  let name = leagueName
  while (ctx.measureText(name).width > W - 160) name = name.slice(0, -1)
  if (name !== leagueName) name += '…'
  ctx.fillText(name.toUpperCase(), W / 2, 210)

  // ── DIVIDER ─────────────────────────────────────────────────────────
  ctx.strokeStyle = goldGrad(60, W - 60, 248)
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(60, 248); ctx.lineTo(W - 60, 248); ctx.stroke()

  // ── CODE LABEL ──────────────────────────────────────────────────────
  ctx.font = '600 17px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(251,191,36,0.70)'
  ctx.fillText(codeLabel.toUpperCase(), W / 2, 285)

  // ── INVITE CODE (huge, spaced) ──────────────────────────────────────
  ctx.font = 'bold 108px monospace'
  ctx.fillStyle = '#fbbf24'
  ctx.shadowColor = 'rgba(245,158,11,0.55)'
  ctx.shadowBlur = 36
  fillSpacedText(ctx, inviteCode, W / 2, 400, 14)
  ctx.shadowBlur = 0

  // ── DIVIDER ─────────────────────────────────────────────────────────
  ctx.strokeStyle = goldGrad(60, W - 60, 462)
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(60, 462); ctx.lineTo(W - 60, 462); ctx.stroke()

  // ── JOIN URL ────────────────────────────────────────────────────────
  ctx.font = '500 20px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.fillText(inviteLink, W / 2, 500)

  // ── FOOTER BAR ──────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(245,158,11,0.07)'
  ctx.fillRect(0, H - 88, W, 88)
  ctx.strokeStyle = 'rgba(245,158,11,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, H - 88); ctx.lineTo(W, H - 88); ctx.stroke()

  // Footer icon + text
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(251,191,36,0.85)'
  const domain = inviteLink.replace(/https?:\/\//, '').split('/')[0].toUpperCase()
  ctx.fillText(`⚽  ESTADÍSTICAS BASADAS EN VOTOS DE ${domain}`, W / 2, H - 44)

  return canvas
}

// Preview card shown inside the modal — matches the dark style
function ShareCard({ leagueName, inviteCode, joinText, appName }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden select-none"
      style={{ background: 'linear-gradient(135deg, #080c18 0%, #0d1427 50%, #060a14 100%)' }}
    >
      {/* Blue glow left */}
      <div className="absolute inset-y-0 left-0 w-1/2 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(37,99,235,0.25) 0%, transparent 70%)' }} />
      {/* Amber glow right */}
      <div className="absolute inset-y-0 right-0 w-1/2 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 100% 50%, rgba(245,158,11,0.22) 0%, transparent 70%)' }} />
      {/* Diagonal lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 36px)' }} />

      <div className="relative px-5 py-6 text-center space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/70">{appName}</p>
        <p className="text-xl font-black text-white uppercase tracking-wide leading-tight"
          style={{ textShadow: '0 0 20px rgba(245,158,11,0.45)' }}>
          {joinText}
        </p>
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider truncate">{leagueName}</p>

        {/* Gold divider */}
        <div className="my-3" style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(251,191,36,0.8), transparent)' }} />

        {/* Code */}
        <p className="text-[10px] font-semibold text-ink/60 uppercase tracking-[0.15em]">Código</p>
        <p className="font-black text-3xl tracking-[0.4em] text-ink font-mono"
          style={{ textShadow: '0 0 20px rgba(245,158,11,0.55)' }}>
          {inviteCode}
        </p>
      </div>
    </div>
  )
}

export default function LeagueCreatedModal({ league, onClose }) {
  useScrollLock()
  const { t } = useLang()
  const [shareStatus, setShareStatus] = useState('idle')

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const inviteLink = `${appUrl()}/join/${league.invite_code}`
  const appName  = t('common.appName')
  const joinText = t('league.shareCardJoin')
  const codeLabel = t('league.inviteCode')

  const shareText = t('league.shareMsg', { name: league.name, code: league.invite_code, link: inviteLink })

  async function handleShare() {
    if (navigator.share && navigator.canShare?.({ title: appName, text: shareText, url: inviteLink })) {
      try { await navigator.share({ title: appName, text: shareText, url: inviteLink }) } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${inviteLink}`)
        setShareStatus('copied')
        setTimeout(() => setShareStatus('idle'), 2500)
      } catch { /* blocked */ }
    }
  }

  function handleWhatsApp() {
    // wa.me opens the WhatsApp app (or web) with the message pre-filled and
    // lets the user pick the recipient. Works on iOS, Android and desktop.
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDownload() {
    setShareStatus('downloading')
    try {
      const canvas = generateShareImage({ leagueName: league.name, inviteCode: league.invite_code, inviteLink, appName, joinText, codeLabel })
      const a = document.createElement('a')
      a.download = `liga-${league.invite_code}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } finally {
      setShareStatus('idle')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/60 backdrop-blur-md animate-fade-in px-3 sm:px-4 py-4 sm:py-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-paper rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden animate-slide-up max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-4rem)] flex flex-col">
        {/* Hero */}
        <div className="relative bg-cream border-b border-ink/20 p-6 text-ink text-center flex-shrink-0">
          <div className="text-4xl mb-1">🎉</div>
          <h2 className="text-xl font-bold">{t('league.created')}</h2>
          <p className="text-ink/80 text-sm mt-1">{t('league.createdReady', { name: league.name })}</p>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Dark share card preview */}
          <ShareCard leagueName={league.name} inviteCode={league.invite_code} joinText={joinText} appName={appName} />

          {/* Invite code row */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">{t('league.inviteCode')}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-paper border border-ink/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold tracking-[0.3em] text-ink font-mono">{league.invite_code}</p>
              </div>
              <CopyButton text={league.invite_code} />
            </div>
          </div>

          {/* Direct link row */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">{t('league.directLink')}</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-ink/60 bg-paper rounded-xl px-3 py-2.5 font-mono truncate">{inviteLink}</p>
              <CopyButton text={inviteLink} />
            </div>
            <p className="text-xs text-ink/50">{t('league.inviteFriends')}</p>
          </div>

          {/* WhatsApp — primary share channel */}
          <button
            onClick={handleWhatsApp}
            className="w-full bg-[#25D366] hover:bg-[#1ebe5b] active:bg-[#19a851] text-white font-semibold rounded-2xl py-3 flex items-center justify-center gap-2 text-sm shadow-sm transition-colors min-h-[44px]"
          >
            <svg viewBox="0 0 32 32" className="w-5 h-5" fill="currentColor" aria-hidden="true">
              <path d="M19.11 17.55c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15s-.77.97-.94 1.17c-.17.2-.35.22-.65.07-.3-.15-1.26-.47-2.4-1.48-.89-.79-1.49-1.77-1.67-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.49 1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35zM16.02 5.33C10.13 5.33 5.34 10.11 5.34 16c0 1.99.55 3.85 1.5 5.44L5.33 26.67l5.36-1.41c1.54.84 3.3 1.32 5.16 1.32h.01c5.89 0 10.68-4.79 10.68-10.68 0-2.85-1.11-5.53-3.12-7.55a10.6 10.6 0 0 0-7.4-3.02zm0 19.55h-.01c-1.66 0-3.29-.45-4.71-1.29l-.34-.2-3.5.92.93-3.41-.22-.35a8.86 8.86 0 0 1-1.36-4.73c0-4.9 3.99-8.88 8.89-8.88 2.37 0 4.6.92 6.28 2.6a8.83 8.83 0 0 1 2.6 6.28c0 4.9-3.99 8.89-8.88 8.89z"/>
            </svg>
            {t('league.shareWhatsApp')}
          </button>

          {/* Generic share + Download */}
          <div className="flex gap-2">
            <button onClick={handleShare} className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm min-h-[44px]">
              <span>📤</span>
              {shareStatus === 'copied' ? t('common.copied') : t('league.shareBtn')}
            </button>
            <button
              onClick={handleDownload}
              disabled={shareStatus === 'downloading'}
              className="btn-secondary flex items-center justify-center gap-1 text-sm px-3 min-h-[44px]"
              title={t('league.downloadImage')}
              aria-label={t('league.downloadImage')}
            >
              {shareStatus === 'downloading' ? '⏳' : '⬇'}
            </button>
          </div>

          <button onClick={onClose} className="btn-secondary w-full text-sm">{t('common.ok')}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
