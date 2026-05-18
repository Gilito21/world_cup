import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../contexts/LangContext'
import { teamName, TEAM_CODES } from '../utils/teams'
import useScrollLock from '../lib/useScrollLock'
import Spinner from './Spinner'

// Drawing-only component. Receives a finished or in-progress match and
// the user's prediction. Renders a card on a canvas and offers Web Share
// (with files when supported) and a download fallback.

const CARD_W = 1080
const CARD_H = 1080
const APP_HOST = 'porradeempresas.com'

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function drawCard(ctx, { match, prediction, username, t, dateLocale }) {
  // ── Background gradient ───────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, CARD_W, CARD_H)
  grad.addColorStop(0, '#0c0a09')
  grad.addColorStop(0.5, '#1c1917')
  grad.addColorStop(1, '#292524')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Amber accent corner
  ctx.fillStyle = '#f59e0b'
  ctx.fillRect(0, 0, CARD_W, 8)

  // ── Header ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#f5f5f4'
  ctx.font = 'bold 36px Inter, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('⚽  Porra Mundial 2026', 64, 100)

  // Username badge
  ctx.fillStyle = '#fbbf24'
  ctx.font = '500 32px Inter, system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('@' + username, CARD_W - 64, 100)

  // ── Result vs prediction ─────────────────────────────────────────────
  const isFinished = match.status === 'finished'
  const actualHome = match.home_score
  const actualAway = match.away_score
  const predHome   = prediction?.home_score
  const predAway   = prediction?.away_score

  const isExact   = isFinished && predHome === actualHome && predAway === actualAway
  const predWinner = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw'
  const realWinner = isFinished
    ? (actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw')
    : null
  const isCorrect = isFinished && !isExact && predWinner === realWinner

  // Title row
  ctx.textAlign = 'center'
  ctx.fillStyle = isExact ? '#fbbf24' : isCorrect ? '#60a5fa' : '#a8a29e'
  ctx.font = 'bold 28px Inter, system-ui, sans-serif'
  const stageLabel = (match.stage || '').replaceAll('_', ' ').toUpperCase()
  ctx.fillText(stageLabel, CARD_W / 2, 200)

  // Try to load flags. flagcdn at 256px is plenty for an 1080 canvas.
  const homeCode = TEAM_CODES[match.home_team]
  const awayCode = TEAM_CODES[match.away_team]
  const [homeFlag, awayFlag] = await Promise.all([
    homeCode ? loadImage(`https://flagcdn.com/w320/${homeCode}.png`) : null,
    awayCode ? loadImage(`https://flagcdn.com/w320/${awayCode}.png`) : null,
  ])

  const flagW = 220
  const flagH = 140
  const flagY = 280

  // Home flag + name
  if (homeFlag) ctx.drawImage(homeFlag, 120, flagY, flagW, flagH)
  ctx.fillStyle = '#f5f5f4'
  ctx.font = 'bold 40px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(teamName(match.home_team), 120 + flagW / 2, flagY + flagH + 60)

  // Away flag + name
  if (awayFlag) ctx.drawImage(awayFlag, CARD_W - 120 - flagW, flagY, flagW, flagH)
  ctx.fillText(teamName(match.away_team), CARD_W - 120 - flagW / 2, flagY + flagH + 60)

  // VS divider
  ctx.fillStyle = '#78716c'
  ctx.font = '600 56px Inter, system-ui, sans-serif'
  ctx.fillText('vs', CARD_W / 2, flagY + flagH / 2 + 20)

  // ── Prediction line ──────────────────────────────────────────────────
  ctx.fillStyle = '#a8a29e'
  ctx.font = '600 28px Inter, system-ui, sans-serif'
  ctx.fillText(t('share.cardPredLabel').toUpperCase(), CARD_W / 2, 600)

  ctx.fillStyle = isExact ? '#fbbf24' : isCorrect ? '#60a5fa' : '#f5f5f4'
  ctx.font = 'bold 180px Inter, system-ui, sans-serif'
  ctx.fillText(`${predHome ?? '-'} – ${predAway ?? '-'}`, CARD_W / 2, 760)

  // ── Actual score / status ─────────────────────────────────────────────
  if (isFinished) {
    ctx.fillStyle = '#a8a29e'
    ctx.font = '500 28px Inter, system-ui, sans-serif'
    ctx.fillText(
      `${t('share.cardActualLabel')} ${actualHome} – ${actualAway}`,
      CARD_W / 2, 830
    )

    let badge = t('share.badgeMiss')
    let badgeBg = '#44403c'
    let badgeFg = '#f5f5f4'
    if (isExact)        { badge = t('share.badgeExact');   badgeBg = '#f59e0b'; badgeFg = '#0c0a09' }
    else if (isCorrect) { badge = t('share.badgeCorrect'); badgeBg = '#2563eb'; badgeFg = '#ffffff' }

    const bw = 360, bh = 80, bx = (CARD_W - bw) / 2, by = 870
    ctx.fillStyle = badgeBg
    roundedRect(ctx, bx, by, bw, bh, 40)
    ctx.fill()
    ctx.fillStyle = badgeFg
    ctx.font = 'bold 36px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badge, CARD_W / 2, by + bh / 2)
    ctx.textBaseline = 'alphabetic'
  } else {
    ctx.fillStyle = '#a8a29e'
    ctx.font = '500 30px Inter, system-ui, sans-serif'
    const dateStr = new Date(match.match_date).toLocaleDateString(dateLocale, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    ctx.fillText(dateStr, CARD_W / 2, 870)
  }

  // ── Footer ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#78716c'
  ctx.font = '500 24px Inter, system-ui, sans-serif'
  ctx.fillText(APP_HOST, CARD_W / 2, CARD_H - 60)
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export default function SharePredictionCard({ match, prediction, username, onClose }) {
  useScrollLock()
  const { t, dateLocale } = useLang()
  const canvasRef = useRef(null)
  const [building, setBuilding] = useState(true)
  const [imgUrl,   setImgUrl]   = useState(null)
  const [shared,   setShared]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      try {
        await drawCard(ctx, { match, prediction, username, t, dateLocale })
        if (cancelled) return
        const url = canvas.toDataURL('image/png')
        setImgUrl(url)
      } catch (err) {
        if (!cancelled) setError(t('share.errorBuild'))
      } finally {
        if (!cancelled) setBuilding(false)
      }
    })()
    return () => { cancelled = true }
  // Intentionally exclude `t` from deps: it changes identity only on
  // language switch, and a re-draw mid-share would replace the canvas
  // image with one in the new locale anyway. Pinning to the data inputs
  // avoids accidental re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, prediction, username, dateLocale])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function handleShare() {
    if (!imgUrl) return
    setError('')
    // Convert data URL → Blob → File for the Web Share API.
    const blob = await (await fetch(imgUrl)).blob()
    const file = new File([blob], 'porra-prediccion.png', { type: 'image/png' })
    const shareText = t('share.shareText', {
      home: teamName(match.home_team),
      away: teamName(match.away_team),
    })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          text:  shareText,
          title: t('share.shareTitle'),
        })
        setShared(true)
      } catch (err) {
        if (err?.name !== 'AbortError') setError(t('share.errorShare'))
      }
    } else if (navigator.share) {
      // Browser supports share but not files — fallback to text+url.
      try {
        await navigator.share({ text: shareText, title: t('share.shareTitle'), url: `https://${APP_HOST}` })
        setShared(true)
      } catch (err) {
        if (err?.name !== 'AbortError') setError(t('share.errorShare'))
      }
    } else {
      // Last resort: copy text to clipboard.
      try {
        await navigator.clipboard.writeText(shareText + ' ' + `https://${APP_HOST}`)
        setShared(true)
      } catch { setError(t('share.errorShare')) }
    }
  }

  function handleDownload() {
    if (!imgUrl) return
    // Strip accents/punctuation/anything non-alphanumeric so the filename
    // is portable across OSes. "Türkiye" → "T-rkiye", "Côte d'Ivoire" →
    // "C-te-d-Ivoire" — ugly but always safe.
    const safe = (s) => String(s ?? '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
    const a = document.createElement('a')
    a.href = imgUrl
    a.download = `porra-${safe(match.home_team)}-${safe(match.away_team)}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/70 backdrop-blur-md animate-fade-in px-3 py-4 sm:px-4 sm:py-8 pt-safe pb-safe"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-paper rounded-none shadow-2xl w-full max-w-md overflow-hidden animate-slide-up max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] flex flex-col">
        <div className="px-5 py-4 border-b border-ink/15 flex items-center justify-between">
          <p className="text-base font-bold text-ink">{t('share.title')}</p>
          <button
            onClick={onClose}
            className="text-ink/50 hover:text-ink/80 text-2xl leading-none"
            aria-label={t('common.close')}
          >×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-cream">
          <div className="aspect-square w-full rounded-none overflow-hidden bg-ink shadow-lg shadow-ink/20 flex items-center justify-center">
            {/* Real canvas — hidden offscreen while building, then displayed via <img> */}
            <canvas
              ref={canvasRef}
              width={CARD_W}
              height={CARD_H}
              className="hidden"
            />
            {building ? (
              <Spinner />
            ) : imgUrl ? (
              <img src={imgUrl} alt="" className="w-full h-full object-contain" />
            ) : (
              <p className="text-sm text-ink/50">{t('share.errorBuild')}</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
          {shared && !error && (
            <p className="text-xs text-grass-600 text-center">{t('share.shared')}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleShare}
              disabled={!imgUrl}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              <span>📤</span>{t('share.shareBtn')}
            </button>
            <button
              onClick={handleDownload}
              disabled={!imgUrl}
              className="btn-secondary flex-1 flex items-center justify-center gap-1.5"
            >
              <span>⬇️</span>{t('share.downloadBtn')}
            </button>
          </div>
          <p className="text-[11px] text-ink/50 text-center leading-relaxed">
            {t('share.hint')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
