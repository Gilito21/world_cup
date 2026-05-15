import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../contexts/LangContext'

function CopyButton({ text, label }) {
  const { t } = useLang()
  const displayLabel = label ?? t('common.copy')
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {/* clipboard blocked — ignoramos */}
  }
  return (
    <button
      onClick={handleCopy}
      className="btn-secondary text-xs px-3 py-2 flex-shrink-0"
    >
      {copied ? '✓' : displayLabel}
    </button>
  )
}

// Generates a downloadable PNG share card via canvas
function generateShareImage({ leagueName, inviteCode, inviteLink, appName, joinText }) {
  const W = 1080, H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Amber gradient background
  const grd = ctx.createLinearGradient(0, 0, W, H)
  grd.addColorStop(0, '#f59e0b')
  grd.addColorStop(0.55, '#fb923c')
  grd.addColorStop(1, '#ea580c')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, W, H)

  // Subtle dot pattern overlay
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  for (let x = 24; x < W; x += 40) {
    for (let y = 24; y < H; y += 40) {
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // White glass card
  const cx = W / 2, cardW = 860, cardH = 640, cardY = 200
  const cardX = (W - cardW) / 2
  ctx.fillStyle = 'rgba(255,255,255,0.20)'
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, 32)
  ctx.fill()

  // ⚽ emoji
  ctx.font = '96px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('⚽', cx, 140)

  // App name
  ctx.font = 'bold 38px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.70)'
  ctx.fillText(appName, cx, 210)

  // "Join my league!" headline
  ctx.font = 'bold 68px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#000'
  ctx.fillText(joinText, cx, 330)

  // League name
  ctx.font = 'bold 52px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  // Truncate long names
  let nameText = leagueName
  while (nameText.length > 22 && ctx.measureText(nameText).width > cardW - 80) {
    nameText = nameText.slice(0, -1)
  }
  if (nameText !== leagueName) nameText += '…'
  ctx.fillText(nameText, cx, 420)

  // Divider
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cardX + 60, 480)
  ctx.lineTo(cardX + cardW - 60, 480)
  ctx.stroke()

  // Code label
  ctx.font = '500 28px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillText('CÓDIGO', cx, 530)

  // Invite code (large monospace)
  ctx.font = 'bold 88px monospace'
  ctx.fillStyle = '#000'
  ctx.fillText(inviteCode, cx, 640)

  // Divider
  ctx.beginPath()
  ctx.moveTo(cardX + 60, 695)
  ctx.lineTo(cardX + cardW - 60, 695)
  ctx.stroke()

  // Join URL
  ctx.font = '26px monospace'
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillText(inviteLink, cx, 740)

  // Footer strip
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(0, H - 100, W, 100)
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(0,0,0,0.50)'
  ctx.fillText('porramundial.com · World Cup 2026', cx, H - 55)

  return canvas
}

// Visual share card shown inside the modal
function ShareCard({ leagueName, inviteCode, appName, joinText }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden select-none"
      style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #fb923c 55%, #ea580c 100%)' }}
    >
      {/* Dot overlay */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />
      <div className="relative px-6 py-8 text-center">
        <div className="text-5xl mb-1">⚽</div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-black/60 mb-4">{appName}</p>

        {/* Glass card */}
        <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-5 mx-auto max-w-xs">
          <p className="font-bold text-lg text-black/80 mb-1">{joinText}</p>
          <p className="font-semibold text-sm text-black/60 mb-4 truncate">{leagueName}</p>
          <div className="h-px bg-black/15 mb-4" />
          <p className="text-[10px] font-semibold text-black/50 uppercase tracking-widest mb-1">Código</p>
          <p className="font-black text-3xl tracking-[0.35em] text-black font-mono">{inviteCode}</p>
        </div>
      </div>
    </div>
  )
}

// Modal de éxito tras crear una liga (founder o tras pago).
// Muestra el código, el link y una tarjeta visual para compartir.
export default function LeagueCreatedModal({ league, onClose }) {
  const { t, lang } = useLang()
  const [shareStatus, setShareStatus] = useState('idle') // idle | copied | downloading

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const inviteLink = `${window.location.origin}/join/${league.invite_code}`
  const appName = lang === 'es' ? 'Porra Mundial 2026' : 'World Cup Predictor 2026'
  const joinText = t('league.shareCardJoin')

  async function handleShare() {
    const text = t('league.shareMsg', {
      name: league.name,
      code: league.invite_code,
      link: inviteLink,
    })
    if (navigator.share && navigator.canShare?.({ title: appName, text, url: inviteLink })) {
      try {
        await navigator.share({ title: appName, text, url: inviteLink })
      } catch { /* user cancelled */ }
    } else {
      // Fallback: copy text to clipboard
      try {
        await navigator.clipboard.writeText(`${text}\n${inviteLink}`)
        setShareStatus('copied')
        setTimeout(() => setShareStatus('idle'), 2500)
      } catch { /* clipboard blocked */ }
    }
  }

  async function handleDownload() {
    setShareStatus('downloading')
    try {
      const canvas = generateShareImage({
        leagueName: league.name,
        inviteCode: league.invite_code,
        inviteLink,
        appName,
        joinText,
      })
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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-stone-900/60 backdrop-blur-md animate-fade-in px-3 sm:px-4 py-4 sm:py-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden animate-slide-up">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-amber-500 via-amber-400 to-orange-400 p-6 text-stone-950 text-center">
          <div className="text-4xl mb-1">🎉</div>
          <h2 className="text-xl font-bold">{t('league.created')}</h2>
          <p className="text-stone-900/80 text-sm mt-1">
            {t('league.createdReady', { name: league.name })}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Visual share card */}
          <ShareCard
            leagueName={league.name}
            inviteCode={league.invite_code}
            appName={appName}
            joinText={joinText}
          />

          {/* Invite code row */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{t('league.inviteCode')}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-stone-100 border border-amber-500/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold tracking-[0.3em] text-amber-500 font-mono">{league.invite_code}</p>
              </div>
              <CopyButton text={league.invite_code} />
            </div>
          </div>

          {/* Direct link row */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{t('league.directLink')}</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-stone-500 bg-stone-100 rounded-xl px-3 py-2.5 font-mono truncate">
                {inviteLink}
              </p>
              <CopyButton text={inviteLink} />
            </div>
            <p className="text-xs text-stone-400">{t('league.inviteFriends')}</p>
          </div>

          {/* Share + Download buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
            >
              <span>📤</span>
              {shareStatus === 'copied' ? '✓ Copiado' : t('league.shareBtn')}
            </button>
            <button
              onClick={handleDownload}
              disabled={shareStatus === 'downloading'}
              className="btn-secondary flex items-center justify-center gap-1 text-sm px-3"
              title={t('league.downloadImage')}
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
