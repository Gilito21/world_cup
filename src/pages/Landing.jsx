import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useLang } from '../contexts/LangContext'
import { supabase, sq } from '../lib/supabase'
import ReportButton from '../components/ReportButton'

// CDN scripts needed by the Atlas/Map section (d3 + topojson-client). Loaded
// once on first mount; reused on subsequent navigations.
const D3_SRC       = 'https://d3js.org/d3.v7.min.js'
const TOPOJSON_SRC = 'https://unpkg.com/topojson-client@3'
const WORLD_ATLAS  = 'https://unpkg.com/world-atlas@2/countries-50m.json'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload  = () => { s.dataset.loaded = '1'; resolve() }
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// 16 host cities (lat/lng). Route order traces a believable east-west loop.
const CITIES = [
  { name: 'Vancouver',     lng: -123.12, lat: 49.26, c: 'CA' },
  { name: 'Toronto',       lng:  -79.38, lat: 43.65, c: 'CA' },
  { name: 'Seattle',       lng: -122.33, lat: 47.61, c: 'US' },
  { name: 'San Francisco', lng: -122.42, lat: 37.77, c: 'US' },
  { name: 'Los Angeles',   lng: -118.24, lat: 34.05, c: 'US' },
  { name: 'Kansas City',   lng:  -94.58, lat: 39.10, c: 'US' },
  { name: 'Dallas',        lng:  -96.80, lat: 32.78, c: 'US' },
  { name: 'Houston',       lng:  -95.37, lat: 29.76, c: 'US' },
  { name: 'Atlanta',       lng:  -84.39, lat: 33.75, c: 'US' },
  { name: 'Miami',         lng:  -80.19, lat: 25.76, c: 'US' },
  { name: 'Boston',        lng:  -71.06, lat: 42.36, c: 'US' },
  { name: 'Philadelphia',  lng:  -75.16, lat: 39.95, c: 'US' },
  { name: 'NY/NJ',         lng:  -74.01, lat: 40.71, c: 'US', final: true },
  { name: 'Guadalajara',   lng: -103.35, lat: 20.66, c: 'MX' },
  { name: 'Mexico City',   lng:  -99.13, lat: 19.43, c: 'MX' },
  { name: 'Monterrey',     lng: -100.32, lat: 25.69, c: 'MX' },
]
const ROUTE_ORDER = [
  'Vancouver', 'Seattle', 'San Francisco', 'Los Angeles',
  'Guadalajara', 'Monterrey', 'Mexico City', 'Houston',
  'Dallas', 'Kansas City', 'Atlanta', 'Miami',
  'Philadelphia', 'NY/NJ', 'Boston', 'Toronto',
]

// City → Wikipedia page title for the venue. We fetch the lead image from
// Wikipedia's REST summary API on mount and cache in localStorage. URL
// encoding handles the few stadium names with special chars (&, ').
const STADIUMS = {
  'NY/NJ':         { wiki: 'MetLife_Stadium',          name: 'MetLife Stadium',          cap: '82.500' },
  'Los Angeles':   { wiki: 'SoFi_Stadium',             name: 'SoFi Stadium',             cap: '70.000' },
  'Dallas':        { wiki: 'AT%26T_Stadium',           name: 'AT&T Stadium',             cap: '80.000' },
  'Atlanta':       { wiki: 'Mercedes-Benz_Stadium',    name: 'Mercedes-Benz Stadium',    cap: '71.000' },
  'Houston':       { wiki: 'NRG_Stadium',              name: 'NRG Stadium',              cap: '72.220' },
  'Kansas City':   { wiki: 'Arrowhead_Stadium',        name: 'Arrowhead Stadium',        cap: '76.416' },
  'Philadelphia':  { wiki: 'Lincoln_Financial_Field',  name: 'Lincoln Financial Field',  cap: '69.796' },
  'Boston':        { wiki: 'Gillette_Stadium',         name: 'Gillette Stadium',         cap: '64.628' },
  'Miami':         { wiki: 'Hard_Rock_Stadium',        name: 'Hard Rock Stadium',        cap: '64.767' },
  'Seattle':       { wiki: 'Lumen_Field',              name: 'Lumen Field',              cap: '68.740' },
  'San Francisco': { wiki: "Levi%27s_Stadium",         name: "Levi's Stadium",           cap: '68.500' },
  'Toronto':       { wiki: 'BMO_Field',                name: 'BMO Field',                cap: '30.000' },
  'Vancouver':     { wiki: 'BC_Place',                 name: 'BC Place',                 cap: '54.500' },
  'Mexico City':   { wiki: 'Estadio_Azteca',           name: 'Estadio Azteca',           cap: '87.000' },
  'Guadalajara':   { wiki: 'Estadio_Akron',            name: 'Estadio Akron',            cap: '49.850' },
  'Monterrey':     { wiki: 'Estadio_BBVA',             name: 'Estadio BBVA',             cap: '53.500' },
}

// Returns a pre-sized 640px thumbnail URL for a Wikipedia page via the
// MediaWiki action API. Going through `pithumbsize` is more reliable than
// post-processing a REST-summary thumbnail URL, which sometimes ends up
// pointing at a size the thumb server refuses to render.
function stadiumImgEndpoint(wikiTitle) {
  return `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2`
    + `&prop=pageimages&piprop=thumbnail&pithumbsize=640`
    + `&titles=${wikiTitle}&origin=*`
}

// Fallback for the countdown if the matches table can't be reached.
// Opening match: Mexico vs South Africa, 11 Jun 2026 at Estadio Azteca.
const WORLD_CUP_FALLBACK_TS = new Date('2026-06-11T18:00:00Z').getTime()

// Pulls the earliest scheduled match from Supabase so the landing
// countdown automatically tracks any schedule edits. Falls back to the
// hard-coded date above on first paint and on query failure.
function useFirstMatchKickoff() {
  const [ts, setTs] = useState(WORLD_CUP_FALLBACK_TS)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await sq(
        supabase.from('matches')
          .select('match_date')
          .order('match_date', { ascending: true })
          .limit(1)
      )
      if (cancelled) return
      const dateStr = data?.[0]?.match_date
      if (dateStr) {
        const parsed = new Date(dateStr).getTime()
        if (!Number.isNaN(parsed)) setTs(parsed)
      }
    })()
    return () => { cancelled = true }
  }, [])
  return ts
}

// ─────────────────────────────────────────────────────────────────────────
// Real-time company leaderboard (top 8 by average points per member).
// Mirrors the calculation used in src/pages/Clasificacion.jsx so the
// landing's preview matches what users see inside the app.
// ─────────────────────────────────────────────────────────────────────────
function useTopCompanies(limit = 8) {
  const [rows, setRows]    = useState([])
  const [state, setState]  = useState('loading') // 'loading' | 'ready' | 'empty'

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data } = await sq(
        supabase.from('profiles')
          .select('company, total_points')
          .eq('email_confirmed', true)
          .not('company', 'is', null).neq('company', '')
      )
      if (cancelled) return
      if (!data || data.length === 0) {
        setState('empty')
        return
      }
      const map = {}
      for (const p of data) {
        const c = (p.company ?? '').trim()
        if (!c) continue
        if (!map[c]) map[c] = { sum: 0, count: 0 }
        map[c].sum   += p.total_points ?? 0
        map[c].count += 1
      }
      const result = Object.entries(map)
        .map(([name, v]) => ({ name, avg: v.count ? v.sum / v.count : 0 }))
        .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map((r, i) => ({ ...r, position: i + 1 }))

      setRows(result)
      setState(result.length === 0 ? 'empty' : 'ready')
    }

    load()
    const channel = supabase
      .channel('landing-companies')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        load)
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [limit])

  return { rows, state }
}

// Live countdown to the first World Cup match. Ticks every second; when
// the target is reached, swaps to a single "kick-off" cell.
function LandingCountdown({ target, t }) {
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()))
  useEffect(() => {
    setLeft(Math.max(0, target - Date.now()))
    const id = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000)
    return () => clearInterval(id)
  }, [target])

  if (left === 0) {
    return (
      <div className="ln-countdown-body started">
        <span className="ln-countdown-started">{t('landing.countdown.started')}</span>
      </div>
    )
  }

  const d = Math.floor(left / 86400000)
  const h = Math.floor((left % 86400000) / 3600000)
  const m = Math.floor((left %  3600000) /   60000)
  const s = Math.floor((left %    60000) /    1000)

  const cells = [
    [d, t('landing.countdown.days')],
    [h, t('landing.countdown.hours')],
    [m, t('landing.countdown.minutes')],
    [s, t('landing.countdown.seconds')],
  ]

  return (
    <div className="ln-countdown-body">
      {cells.map(([n, lbl], i) => (
        <div className="ln-countdown-cell" key={i}>
          <span className="ln-countdown-n">{String(n).padStart(2, '0')}</span>
          <span className="ln-countdown-lbl">{lbl}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Landing() {
  const { t, lang } = useLang()
  const { rows: topCompanies, state: companiesState } = useTopCompanies(8)
  const firstMatchTs = useFirstMatchKickoff()
  const ballRef    = useRef(null)
  const mapRef     = useRef(null)
  const mapBuilt   = useRef(false)

  // Stadium images keyed by city name. Prefetched on mount from Wikipedia's
  // REST summary API, then cached in localStorage for a week. We render the
  // tooltip immediately on hover; the <img> loads progressively once the
  // src URL arrives, so first hover before fetch shows the textual card.
  const [stadiumImgs, setStadiumImgs] = useState({})
  const [imgFailed, setImgFailed]     = useState({}) // city -> true if <img> failed to load
  const [hovered, setHovered]         = useState(null) // { name, x, y } | null

  useEffect(() => {
    let cancelled = false
    async function fetchOne(city, info) {
      // Bumped cache key (v2) so any stale URLs from the previous
      // REST-summary endpoint are invalidated for existing users.
      const cacheKey = `porra-stadium-img-v2:${info.wiki}`
      try {
        const raw = localStorage.getItem(cacheKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.exp > Date.now() && parsed.src) {
            setStadiumImgs(prev => ({ ...prev, [city]: parsed.src }))
            return
          }
        }
      } catch {}
      try {
        const r = await fetch(stadiumImgEndpoint(info.wiki))
        if (!r.ok || cancelled) return
        const j = await r.json()
        const src = j?.query?.pages?.[0]?.thumbnail?.source
        if (!src || cancelled) return
        setStadiumImgs(prev => ({ ...prev, [city]: src }))
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            src, exp: Date.now() + 7 * 24 * 3600 * 1000,
          }))
        } catch {}
      } catch {}
    }
    Object.entries(STADIUMS).forEach(([city, info]) => fetchOne(city, info))
    return () => { cancelled = true }
  }, [])

  // Reveal-on-scroll observer (translates `.reveal` → `.reveal.in`).
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in') })
    }, { threshold: 0.15 })
    document.querySelectorAll('.landing-root .reveal').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Top-nav background goes opaque after a tiny scroll, plus the floating
  // parallax ball traces a zig-zag bezier path down the page.
  useEffect(() => {
    const nav  = document.getElementById('landing-nav')
    const ball = ballRef.current
    const path = [
      { x: 0.88, y: 0.18 },
      { x: 0.16, y: 0.40 },
      { x: 0.84, y: 0.55 },
      { x: 0.16, y: 0.45 },
      { x: 0.84, y: 0.65 },
      { x: 0.50, y: 0.78 },
    ]
    let raf = null
    function apply() {
      raf = null
      const y    = window.scrollY
      const docH = document.documentElement.scrollHeight - window.innerHeight
      const p    = Math.min(1, Math.max(0, docH > 0 ? y / docH : 0))
      const vw   = window.innerWidth
      const vh   = window.innerHeight
      const idx  = Math.min(path.length - 2, Math.floor(p * (path.length - 1)))
      const local = (p * (path.length - 1)) - idx
      const a = path[idx], b = path[idx + 1]
      const mx = (a.x + b.x) / 2
      const my = Math.min(a.y, b.y) - 0.08
      const tt = local
      const bx = (1 - tt) * (1 - tt) * a.x + 2 * (1 - tt) * tt * mx + tt * tt * b.x
      const by = (1 - tt) * (1 - tt) * a.y + 2 * (1 - tt) * tt * my + tt * tt * b.y
      const rot = (p * 720) % 360
      if (ball) {
        ball.style.transform = `translate3d(${bx * vw - 17}px, ${by * vh - 17}px, 0) rotate(${rot}deg)`
        ball.style.opacity   = y > 280 ? 1 : 0
      }
      if (nav) nav.classList.toggle('scrolled', y > 30)
    }
    function onScroll() {
      if (raf != null) return
      raf = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', apply)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [])

  // Build the d3 map once scripts are loaded. Idempotent.
  useEffect(() => {
    let cancelled = false

    async function build() {
      try {
        await loadScript(D3_SRC)
        await loadScript(TOPOJSON_SRC)
        if (cancelled || mapBuilt.current) return

        const d3       = window.d3
        const topojson = window.topojson
        const world    = await fetch(WORLD_ATLAS).then(r => r.json())
        if (cancelled) return
        const countries = topojson.feature(world, world.objects.countries)

        const NA_NAMES = new Set([
          'United States of America', 'Canada', 'Mexico', 'Cuba', 'Greenland', 'Bahamas',
          'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica',
          'Panama', 'Haiti', 'Dominican Rep.', 'Jamaica', 'Puerto Rico', 'Trinidad and Tobago',
        ])
        const naFeatures = countries.features.filter(
          f => f.properties && NA_NAMES.has(f.properties.name)
        )

        const projection = d3.geoMercator()
          .center([-95, 45])
          .scale(440)
          .translate([500, 310])
        const pathGen = d3.geoPath(projection)

        // Graticule
        const grat = document.getElementById('landing-graticule')
        if (grat) grat.innerHTML = `<path d="${pathGen(d3.geoGraticule().step([15, 15])())}"/>`

        // Real country outlines
        const landGroup = document.getElementById('landing-na-land')
        if (landGroup) {
          landGroup.innerHTML = ''
          naFeatures.forEach(country => {
            const d = pathGen(country)
            if (!d) return
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            path.setAttribute('d', d)
            path.setAttribute('data-name', country.properties.name)
            landGroup.appendChild(path)
          })
        }

        // Country labels
        const labelGroup = document.getElementById('landing-country-labels')
        if (labelGroup) {
          labelGroup.innerHTML = ''
          const labels = [
            { name: 'CANADA',        lng: -100, lat: 58, size: 11 },
            { name: 'UNITED STATES', lng:  -97, lat: 39, size: 13 },
            { name: 'MÉXICO',        lng: -102, lat: 22, size: 10 },
          ]
          labels.forEach(l => {
            const [x, y] = projection([l.lng, l.lat])
            const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            tx.setAttribute('x', x); tx.setAttribute('y', y)
            tx.setAttribute('font-size', l.size)
            tx.textContent = l.name
            labelGroup.appendChild(tx)
          })
        }

        // City pins
        const projected = CITIES.map(c => {
          const p = projection([c.lng, c.lat])
          return { ...c, x: p[0], y: p[1] }
        })
        const g = document.getElementById('landing-cities')
        if (g) {
          g.innerHTML = ''
          projected.forEach((c, i) => {
            const color = c.final ? '#C8552B' : '#0E2A18'
            const node = document.createElementNS('http://www.w3.org/2000/svg', 'g')
            node.setAttribute('class', 'city')
            node.setAttribute('data-idx', i)
            node.setAttribute('data-name', c.name)
            // The transparent hit area is 14px radius so hovering the pin
            // is forgiving — the visible pin is only 4px.
            node.innerHTML = `
              <circle class="ring" cx="${c.x}" cy="${c.y}" r="5" fill="none" stroke="${color}" stroke-width="1.2" style="--d:${(i * 0.18).toFixed(2)}s"/>
              <circle class="hit"  cx="${c.x}" cy="${c.y}" r="14" fill="transparent" pointer-events="all"/>
              <circle class="pin"  cx="${c.x}" cy="${c.y}" r="4" fill="${color}" stroke="#F4ECD6" stroke-width="1.2" pointer-events="none"/>
              <text class="lbl" x="${c.x + 8}" y="${c.y + 4}" pointer-events="none">${c.name}${c.final ? ' ★' : ''}</text>
            `
            const show = () => {
              const hit = node.querySelector('.hit')
              if (!hit) return
              const r = hit.getBoundingClientRect()
              setHovered({
                name: c.name,
                x: r.left + r.width / 2,
                y: r.top  + r.height / 2,
              })
            }
            const hide = () => setHovered(h => (h && h.name === c.name ? null : h))
            node.addEventListener('pointerenter', show)
            node.addEventListener('pointerleave', hide)
            node.addEventListener('focus', show)
            node.addEventListener('blur', hide)
            node.setAttribute('tabindex', '0')
            g.appendChild(node)
          })
        }

        // Route through cities
        const ordered = ROUTE_ORDER.map(n => projected.find(c => c.name === n))
        if (ordered[0]) {
          let d = `M ${ordered[0].x.toFixed(1)},${ordered[0].y.toFixed(1)}`
          for (let i = 1; i < ordered.length; i++) {
            const p = ordered[i], q = ordered[i - 1]
            const cx = (p.x + q.x) / 2 + (Math.random() * 30 - 15)
            const cy = (p.y + q.y) / 2 - 20
            d += ` Q ${cx.toFixed(1)},${cy.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
          }
          const route = document.getElementById('landing-route')
          if (route) route.setAttribute('d', d)
        }

        mapBuilt.current = true

        // Reveal cities as the map enters viewport
        const mapEl = mapRef.current
        if (mapEl) {
          const cityIo = new IntersectionObserver(entries => {
            entries.forEach(e => {
              if (e.isIntersecting) {
                const canvas = document.getElementById('landing-mapCanvas')
                if (canvas) canvas.classList.add('in')
                ROUTE_ORDER.forEach((name, i) => {
                  const idx = CITIES.findIndex(c => c.name === name)
                  const city = document.querySelector(`.landing-root .city[data-idx="${idx}"]`)
                  if (city) setTimeout(() => city.classList.add('in'), i * 120)
                })
              }
            })
          }, { threshold: 0.25 })
          cityIo.observe(mapEl)
        }
      } catch (err) {
        console.error('Atlas map load failed', err)
      }
    }

    build()
    return () => { cancelled = true }
  }, [])

  const numFmt = new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    maximumFractionDigits: 0,
  })

  return (
    <div className="landing-root">
      <style>{LANDING_CSS}</style>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <nav className="ln-top" id="landing-nav">
        <Link className="ln-brand" to="/">
          <span className="ln-brand-mark" />
          <span>
            <span className="ln-brand-name">{t('common.appName')}</span>
            <span className="ln-brand-sub">{t('landing.nav.sub')}</span>
          </span>
        </Link>
        <div className="ln-nav-right">
          <div className="ln-nav-links">
            <a href="#landing-atlas">{t('landing.nav.atlas')}</a>
            <a href="#landing-how">{t('landing.nav.how')}</a>
            <a href="#landing-ranking">{t('landing.nav.ranking')}</a>
          </div>
          <LandingLangToggle />
          <Link to="/auth" className="ln-btn">{t('landing.nav.cta')}</Link>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="ln-hero" id="landing-hero">
        <div className="ln-cover-meta">
          <span>
            <span className="ln-dot" />
            <span>{t('landing.cover.iss')}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{t('landing.cover.date')}</span>
          </span>
          <span>{t('landing.cover.title')}</span>
          <span>{t('landing.cover.copies')}</span>
        </div>

        <div className="ln-hero-grid">
          <div>
            <span className="ln-hero-kicker">{t('landing.hero.kicker')}</span>
            <h1 className="ln-hero-title ln-display">
              <span>{t('landing.hero.l1')}</span><br />
              <span>{t('landing.hero.l2')}</span><br />
              <em>{t('landing.hero.l3')}</em>
            </h1>
            <p className="ln-hero-lead">
              <span>{t('landing.hero.lead1')}</span>
              <em> {t('landing.hero.lead2')}</em>
            </p>
            <div className="ln-hero-actions">
              <Link to="/auth" className="ln-btn">{t('landing.hero.cta1')}</Link>
              <a href="#landing-atlas" className="ln-btn ghost">{t('landing.hero.cta2')}</a>
            </div>
            <div className="ln-hero-byline">
              <span>{t('landing.hero.by')}</span>
              <strong>{t('landing.hero.byline')}</strong>
              {' · '}
              <span>{t('landing.hero.read')}</span>
            </div>
          </div>

          {/* Right column: countdown + real-time company leaderboard */}
          <div className="ln-right-stack">

          <div className="ln-countdown-card reveal">
            <div className="ln-stripe ln-stripe-sm">
              <span>▶ {t('landing.countdown.title')}</span>
              <span>{t('landing.countdown.target')}</span>
            </div>
            <LandingCountdown target={firstMatchTs} t={t} />
          </div>

          <div className="ln-feature-card reveal" id="landing-ranking">
            <div className="ln-stripe">
              <span>▶ {t('landing.live.title')}</span>
              <span>
                <span className="ln-live-dot" /> {t('landing.live.live')}
              </span>
            </div>
            <div className="ln-live-body">
              <p className="ln-live-sub">{t('landing.live.subtitle')}</p>

              {companiesState === 'loading' && (
                <ul className="ln-live-list">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="ln-live-row skeleton">
                      <span className="ln-live-rk">{String(i + 1).padStart(2, '0')}</span>
                      <span className="ln-live-name"><span className="ln-skel" /></span>
                      <span className="ln-live-pts"><span className="ln-skel" /></span>
                    </li>
                  ))}
                </ul>
              )}

              {companiesState === 'empty' && (
                <div className="ln-live-empty">
                  <p>{t('landing.live.emptyTitle')}</p>
                  <p className="ln-live-empty-sub">{t('landing.live.emptyBody')}</p>
                </div>
              )}

              {companiesState === 'ready' && (
                <ul className="ln-live-list">
                  {topCompanies.map(c => (
                    <li
                      key={c.name}
                      className={`ln-live-row ${c.position === 1 ? 'leader' : ''}`}
                    >
                      <span className="ln-live-rk">{String(c.position).padStart(2, '0')}</span>
                      <span className="ln-live-name" title={c.name}>{c.name}</span>
                      <span className="ln-live-pts">{numFmt.format(Math.round(c.avg))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="ln-live-foot">
              <span>{t('landing.live.footnote')}</span>
              <Link to="/auth" className="ln-live-cta">{t('landing.live.cta')} →</Link>
            </div>
          </div>

          </div>
        </div>
      </section>

      {/* Fixed parallax ball overlay */}
      <div className="ln-ball-fix" ref={ballRef} aria-hidden="true" />

      {/* Stadium hover tooltip — fixed-positioned, follows the hovered pin */}
      {hovered && (() => {
        const stadium = STADIUMS[hovered.name]
        if (!stadium) return null
        const W = 260
        // Flip horizontally so the card doesn't overflow the viewport edge.
        const flipX = hovered.x + W + 24 > window.innerWidth
        const left = flipX ? hovered.x - W - 18 : hovered.x + 18
        const top  = Math.max(12, Math.min(window.innerHeight - 220, hovered.y - 110))
        const img    = stadiumImgs[hovered.name]
        const failed = imgFailed[hovered.name]
        return (
          <div className="ln-stadium-tip" style={{ left, top, width: W }}>
            <div className="ln-stadium-img">
              {img && !failed
                ? <img
                    src={img}
                    alt={stadium.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(prev => ({ ...prev, [hovered.name]: true }))}
                  />
                : <div className="ln-stadium-img-fallback">{stadium.name}</div>}
              <div className="ln-stadium-badge">{hovered.name}</div>
            </div>
            <div className="ln-stadium-meta">
              <div className="ln-stadium-name">{stadium.name}</div>
              <div className="ln-stadium-cap">
                <span>{t('landing.stadium.cap')}</span>
                <span>{stadium.cap}</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── ATLAS / MAP ───────────────────────────────────────────────── */}
      <section className="ln-atlas" id="landing-atlas">
        <div className="ln-atlas-head">
          <div className="reveal">
            <span className="ln-mono" style={{ color: 'var(--terracotta)' }}>{t('landing.atlas.tag')}</span>
            <h2 className="ln-display"><span>{t('landing.atlas.h1')}</span><br /><em>{t('landing.atlas.h2')}</em></h2>
          </div>
          <div className="ln-atlas-right reveal">
            <p className="ln-pull">{t('landing.atlas.pull')}</p>
            <p>{t('landing.atlas.p')}</p>
          </div>
        </div>

        <div className="ln-map-card reveal" ref={mapRef}>
          <div className="ln-map-head">
            <span>{t('landing.map.label')} · {t('landing.map.countries')}</span>
            <span className="ln-coord">40.7°N · 74.0°W</span>
          </div>
          <div className="ln-map-canvas" id="landing-mapCanvas">
            <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="ln-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r=".7" fill="#7d6f3a" opacity=".3" />
                </pattern>
                <pattern id="ln-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="#7d6f3a" strokeWidth=".5" opacity=".22" />
                </pattern>
              </defs>
              <rect width="1000" height="620" fill="url(#ln-dots)" />
              <rect width="1000" height="620" fill="url(#ln-hatch)" />
              <g id="landing-graticule" fill="none" stroke="#7d6f3a" strokeWidth=".7" strokeDasharray="2 5" opacity=".55" />
              <g className="country" id="landing-na-land" />
              <path id="landing-route" className="route" d="" />
              <g id="landing-cities" />
              <g id="landing-country-labels" fontFamily="JetBrains Mono" letterSpacing="3" fill="#7d6f3a" textAnchor="middle" />
              <g transform="translate(925,80)" fontFamily="JetBrains Mono" fontSize="9" fill="#0E2A18">
                <circle r="22" fill="none" stroke="#7d6f3a" strokeWidth=".7" opacity=".5" />
                <circle r="14" fill="none" stroke="#7d6f3a" strokeWidth=".5" opacity=".4" />
                <path d="M 0,-22 L 4,0 L 0,22 L -4,0 Z" fill="#0E2A18" opacity=".85" />
                <path d="M -22,0 L 0,-4 L 22,0 L 0,4 Z" fill="#0E2A18" opacity=".5" />
                <text x="0" y="-26" textAnchor="middle" fontSize="8" letterSpacing="2">N</text>
              </g>
            </svg>
          </div>
          <div className="ln-map-foot">
            <div className="ln-cell"><div className="ln-num">16</div><div className="ln-lbl">{t('landing.map.f1')}</div></div>
            <div className="ln-cell"><div className="ln-num">11</div><div className="ln-lbl">{t('landing.map.f2')}</div></div>
            <div className="ln-cell"><div className="ln-num">3</div><div className="ln-lbl">{t('landing.map.f3')}</div></div>
            <div className="ln-cell"><div className="ln-num">2</div><div className="ln-lbl">{t('landing.map.f4')}</div></div>
          </div>
        </div>

        <div className="ln-cities-list">
          <div className="ln-cities-col reveal">
            <h4>{t('landing.cl.us')}</h4>
            <ul>
              <li><span>Atlanta</span><span className="ln-n">ATL</span></li>
              <li><span>Boston</span><span className="ln-n">BOS</span></li>
              <li><span>Dallas</span><span className="ln-n">DAL</span></li>
              <li><span>Houston</span><span className="ln-n">HOU</span></li>
              <li><span>Kansas City</span><span className="ln-n">MKC</span></li>
              <li><span>Los Angeles</span><span className="ln-n">LAX</span></li>
              <li><span>Miami</span><span className="ln-n">MIA</span></li>
              <li><span>{t('landing.cl.final')}</span><span className="ln-n">NYC</span></li>
              <li><span>Philadelphia</span><span className="ln-n">PHL</span></li>
              <li><span>San Francisco</span><span className="ln-n">SFO</span></li>
              <li><span>Seattle</span><span className="ln-n">SEA</span></li>
            </ul>
          </div>
          <div className="ln-cities-col reveal">
            <h4>{t('landing.cl.mx')}</h4>
            <ul>
              <li><span>{t('landing.cl.cdmx')}</span><span className="ln-n">MEX</span></li>
              <li><span>Guadalajara</span><span className="ln-n">GDL</span></li>
              <li><span>Monterrey</span><span className="ln-n">MTY</span></li>
            </ul>
            <h4 style={{ marginTop: 32 }}>{t('landing.cl.ca')}</h4>
            <ul>
              <li><span>Toronto</span><span className="ln-n">YYZ</span></li>
              <li><span>Vancouver</span><span className="ln-n">YVR</span></li>
            </ul>
          </div>
          <div className="ln-cities-col reveal">
            <h4>{t('landing.cl.notes')}</h4>
            <p style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, lineHeight: 1.45, color: 'var(--ink)', margin: '0 0 14px', fontStyle: 'italic' }}>
              {t('landing.cl.n1')}
            </p>
            <p style={{ fontSize: 14, color: '#444', lineHeight: 1.55, margin: 0 }}>
              {t('landing.cl.n2')}
            </p>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#888', marginTop: 16 }}>
              {t('landing.cl.n3')}
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="ln-how" id="landing-how">
        <div className="ln-how-head">
          <div className="reveal">
            <span className="ln-mono" style={{ color: 'var(--terracotta)' }}>{t('landing.how.tag')}</span>
            <h2 className="ln-display"><span>{t('landing.how.h1')}</span><br /><em>{t('landing.how.h2')}</em></h2>
          </div>
          <div className="ln-how-right reveal">
            <p>{t('landing.how.p')}</p>
          </div>
        </div>

        <div className="ln-steps">
          {[
            { k: 's1' }, { k: 's2' }, { k: 's3' }, { k: 's4' },
          ].map((s, i) => (
            <div className="ln-step reveal" key={s.k}>
              <div className="ln-step-head">
                <span className="ln-step-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="ln-step-tag">{t(`landing.hw.${s.k}.tag`)}</span>
              </div>
              <h3><span>{t(`landing.hw.${s.k}.h1`)}</span>{' '}<em>{t(`landing.hw.${s.k}.h2`)}</em></h3>
              <p>{t(`landing.hw.${s.k}.p`)}</p>
              <div className="ln-step-meta">
                <span>{t(`landing.hw.${s.k}.m1`)}</span>
                <span>{t(`landing.hw.${s.k}.m2`)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Scoring system — kept from the original landing since it's core info */}
        <div className="ln-scoring reveal">
          <div className="ln-scoring-head">
            <span className="ln-mono" style={{ color: 'var(--terracotta)' }}>{t('landing.score.tag')}</span>
            <h3 className="ln-display"><em>{t('landing.score.title')}</em></h3>
          </div>
          <div className="ln-scoring-grid">
            <div className="ln-score-card">
              <div className="ln-score-pts">3</div>
              <div className="ln-score-lbl">{t('landing.score.exact')}</div>
              <div className="ln-score-desc">{t('landing.score.exactDesc')}</div>
            </div>
            <div className="ln-score-card mid">
              <div className="ln-score-pts">1</div>
              <div className="ln-score-lbl">{t('landing.score.winner')}</div>
              <div className="ln-score-desc">{t('landing.score.winnerDesc')}</div>
            </div>
            <div className="ln-score-card flat">
              <div className="ln-score-pts">0</div>
              <div className="ln-score-lbl">{t('landing.score.wrong')}</div>
              <div className="ln-score-desc">{t('landing.score.wrongDesc')}</div>
            </div>
          </div>
          <p className="ln-score-note">{t('landing.score.extra')}</p>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="ln-cta" id="landing-registro">
        <div className="ln-cta-inner">
          <span className="ln-cta-kicker">{t('landing.ctaf.k')}</span>
          <h2 className="ln-display"><span>{t('landing.ctaf.h1')}</span><br /><em>{t('landing.ctaf.h2')}</em></h2>
          <p>{t('landing.ctaf.p')}</p>
          <div className="ln-cta-actions">
            <Link to="/auth" className="ln-btn">{t('landing.ctaf.b1')} →</Link>
            <a href="mailto:hola@porradeempresas.com" className="ln-btn ghost">{t('landing.ctaf.b2')}</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer className="ln-site">
        <div>© 2026 Porra de Empresas</div>
        <div className="ln-center">porradeempresas.com</div>
        <div className="ln-links">
          <Link to="/privacidad">{t('landing.ft.privacy')}</Link>
          <a href="mailto:hola@porradeempresas.com">{t('landing.ft.contact')}</a>
        </div>
      </footer>

      <ReportButton />
    </div>
  )
}

// Compact ES/EN toggle styled to match the editorial nav.
function LandingLangToggle() {
  const { lang, setLang } = useLang()
  return (
    <div className="ln-lang">
      {['es', 'en'].map(l => (
        <button
          key={l}
          className={lang === l ? 'on' : ''}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Scoped editorial CSS. Everything is prefixed with `.landing-root` so it
// doesn't leak into the rest of the app.
// ─────────────────────────────────────────────────────────────────────────
const LANDING_CSS = `
.landing-root{
  --cream:#F4ECD6;
  --cream-2:#EBE0BD;
  --paper:#EDE3C4;
  --ink:#0E2A18;
  --ink-2:#1c4d2c;
  --grass-600:#2f7d3b;
  --grass-300:#7BB661;
  --terracotta:#C8552B;
  --terracotta-2:#E58A2E;
  --line:rgba(14,42,24,.16);
  --line-2:rgba(14,42,24,.32);
  position:relative;
  background:var(--cream);
  color:var(--ink);
  font-family:"Inter","Helvetica Neue",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
  min-height:100vh;
}
.landing-root *{box-sizing:border-box}
.landing-root::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:1;opacity:.05;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/></svg>")}
.landing-root a{color:inherit}

.landing-root .ln-mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase}
.landing-root .ln-display{font-family:"Boldonse","Anton","Arial Black",sans-serif;font-weight:400;line-height:.92;letter-spacing:-.01em}

/* NAV */
.landing-root .ln-top{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 16px max(16px,env(safe-area-inset-left));background:rgba(244,236,214,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);transition:background .3s;gap:12px}
@media (min-width:640px){.landing-root .ln-top{padding-left:max(32px,env(safe-area-inset-left));padding-right:max(32px,env(safe-area-inset-right))}}
@media (max-width:520px){.landing-root .ln-top .ln-brand-sub{display:none}.landing-root .ln-brand-name{font-size:15px}.landing-root .ln-brand-mark{width:30px;height:30px}.landing-root .ln-btn{padding:9px 12px;font-size:12px}}
.landing-root .ln-top.scrolled{background:rgba(244,236,214,.96)}
.landing-root .ln-brand{display:flex;align-items:center;gap:14px;text-decoration:none;color:var(--ink)}
.landing-root .ln-brand-mark{width:34px;height:34px;border-radius:50%;background:var(--ink);position:relative;overflow:hidden;flex-shrink:0}
.landing-root .ln-brand-mark::before{content:"";position:absolute;inset:4px;border-radius:50%;background:repeating-conic-gradient(from 0deg, var(--cream) 0deg 18deg, var(--ink) 18deg 36deg)}
.landing-root .ln-brand-mark::after{content:"";position:absolute;inset:11px;background:var(--cream);border-radius:50%}
.landing-root .ln-brand-name{font-family:"Boldonse",sans-serif;font-size:17px;line-height:1}
.landing-root .ln-brand-sub{display:block;font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:.22em;color:var(--terracotta);margin-top:4px;text-transform:uppercase}
.landing-root .ln-nav-right{display:flex;align-items:center;gap:20px}
.landing-root .ln-nav-links{display:flex;gap:24px}
.landing-root .ln-nav-links a{text-decoration:none;font-size:13px;color:var(--ink);font-weight:500;transition:color .2s}
.landing-root .ln-nav-links a:hover{color:var(--terracotta)}
.landing-root .ln-lang{display:flex;border:1px solid var(--ink);border-radius:0;overflow:hidden;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.18em}
.landing-root .ln-lang button{background:transparent;border:0;color:var(--ink);padding:6px 10px;cursor:pointer;font:inherit}
.landing-root .ln-lang button.on{background:var(--ink);color:var(--cream)}
.landing-root .ln-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;background:var(--ink);color:var(--cream);text-decoration:none;border-radius:0;font-size:13px;font-weight:600;border:1px solid var(--ink);transition:all .2s;cursor:pointer}
.landing-root .ln-btn:hover{background:var(--terracotta);border-color:var(--terracotta)}
.landing-root .ln-btn.ghost{background:transparent;color:var(--ink)}
.landing-root .ln-btn.ghost:hover{background:var(--ink);color:var(--cream)}
@media (max-width:880px){.landing-root .ln-nav-links{display:none}}

/* HERO */
.landing-root .ln-hero{position:relative;min-height:100vh;padding:calc(130px + env(safe-area-inset-top,0px)) 6vw 80px;overflow:hidden}
@media (max-width:600px){.landing-root .ln-hero{padding-top:calc(96px + env(safe-area-inset-top,0px));padding-bottom:60px}}
.landing-root .ln-hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
@media (max-width:980px){.landing-root .ln-hero-grid{grid-template-columns:1fr;gap:40px}}
.landing-root .ln-cover-meta{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid var(--line-2);margin-bottom:36px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink);flex-wrap:wrap;gap:8px}
.landing-root .ln-cover-meta span{display:flex;gap:14px;align-items:center}
.landing-root .ln-dot{width:6px;height:6px;background:var(--terracotta);border-radius:50%}

.landing-root .ln-hero-title{font-size:clamp(40px,7vw,120px);line-height:1.18;color:var(--ink);margin:0}
.landing-root .ln-hero-title span,.landing-root .ln-hero-title em{display:inline-block;padding-bottom:.12em}
.landing-root .ln-hero-title em{font-style:italic;color:var(--terracotta);font-family:"Instrument Serif",serif;font-weight:400;letter-spacing:0}
.landing-root .ln-hero-kicker{display:inline-block;background:var(--ink);color:var(--cream);padding:6px 12px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:24px}
.landing-root .ln-hero-lead{font-size:19px;line-height:1.55;color:#234;max-width:520px;margin:32px 0 28px}
.landing-root .ln-hero-lead em{font-style:italic;font-family:"Instrument Serif",serif;font-size:22px;color:var(--ink)}
.landing-root .ln-hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px}
.landing-root .ln-hero-byline{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666;padding-top:18px;border-top:1px solid var(--line)}
.landing-root .ln-hero-byline strong{color:var(--ink);font-weight:600}

/* RIGHT-COLUMN STACK (countdown + ranking) */
.landing-root .ln-right-stack{display:flex;flex-direction:column;gap:18px}

/* COUNTDOWN CARD */
.landing-root .ln-countdown-card{position:relative;background:var(--paper);border:1px solid var(--line-2);overflow:hidden}
.landing-root .ln-stripe-sm{padding:10px 22px;font-size:10px}
.landing-root .ln-countdown-body{display:grid;grid-template-columns:repeat(4,1fr);padding:18px 22px}
.landing-root .ln-countdown-cell{display:flex;flex-direction:column;align-items:flex-start;gap:6px;position:relative;padding-right:12px}
.landing-root .ln-countdown-cell+.ln-countdown-cell{padding-left:12px;border-left:1px dashed var(--line)}
.landing-root .ln-countdown-n{font-family:"Boldonse",sans-serif;font-size:40px;line-height:.9;color:var(--ink);font-variant-numeric:tabular-nums}
.landing-root .ln-countdown-lbl{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#666}
.landing-root .ln-countdown-body.started{display:block;text-align:center;padding:22px}
.landing-root .ln-countdown-started{font-family:"Instrument Serif",serif;font-style:italic;font-size:22px;color:var(--terracotta)}
@media (max-width:520px){.landing-root .ln-countdown-n{font-size:32px}}

/* FEATURE CARD = real-time company leaderboard */
.landing-root .ln-feature-card{position:relative;background:var(--paper);border:1px solid var(--line-2);overflow:hidden;display:flex;flex-direction:column}
.landing-root .ln-stripe{padding:14px 22px;background:var(--ink);color:var(--cream);font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center}
.landing-root .ln-live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--terracotta-2);margin-right:6px;box-shadow:0 0 0 0 rgba(229,138,46,.7);animation:ln-pulse 1.6s infinite}
@keyframes ln-pulse{0%{box-shadow:0 0 0 0 rgba(229,138,46,.7)}70%{box-shadow:0 0 0 10px rgba(229,138,46,0)}100%{box-shadow:0 0 0 0 rgba(229,138,46,0)}}
.landing-root .ln-live-body{padding:24px 22px 8px;flex:1}
.landing-root .ln-live-sub{font-family:"Instrument Serif",serif;font-style:italic;font-size:18px;color:var(--ink);margin:0 0 18px;line-height:1.3}
.landing-root .ln-live-list{list-style:none;padding:0;margin:0}
.landing-root .ln-live-row{display:grid;grid-template-columns:36px 1fr auto;align-items:baseline;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}
.landing-root .ln-live-row:last-child{border-bottom:0}
.landing-root .ln-live-rk{font-family:"JetBrains Mono",monospace;font-size:11px;color:#666;letter-spacing:.1em}
.landing-root .ln-live-name{font-family:"Instrument Serif",serif;font-size:20px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.landing-root .ln-live-row.leader .ln-live-name::after{content:" ★";color:var(--terracotta);font-family:"Inter",sans-serif;font-size:14px}
.landing-root .ln-live-pts{font-family:"Boldonse",sans-serif;font-size:20px;color:var(--ink);text-align:right;line-height:1}
.landing-root .ln-live-row.leader .ln-live-pts{color:var(--terracotta)}
.landing-root .ln-live-empty{padding:32px 8px;text-align:center;font-family:"Instrument Serif",serif}
.landing-root .ln-live-empty p{margin:0;font-size:22px;font-style:italic;color:var(--ink)}
.landing-root .ln-live-empty-sub{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#666;margin-top:10px!important;font-style:normal!important;font-size:10px!important}
.landing-root .ln-skel{display:inline-block;height:14px;width:80%;background:linear-gradient(90deg,rgba(14,42,24,.06),rgba(14,42,24,.14),rgba(14,42,24,.06));background-size:200% 100%;animation:ln-skel 1.4s ease-in-out infinite;border-radius:2px}
.landing-root .ln-live-row.skeleton .ln-live-pts .ln-skel{width:40px}
@keyframes ln-skel{0%{background-position:200% 0}100%{background-position:-200% 0}}
.landing-root .ln-live-foot{border-top:1px solid var(--line-2);padding:14px 22px;display:flex;justify-content:space-between;align-items:center;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#666;gap:12px;flex-wrap:wrap}
.landing-root .ln-live-cta{color:var(--ink);font-weight:700;text-decoration:none;border-bottom:1px solid var(--ink);padding-bottom:2px}
.landing-root .ln-live-cta:hover{color:var(--terracotta);border-color:var(--terracotta)}

/* FIXED BALL */
.landing-root .ln-ball-fix{position:fixed;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 32% 28%, #fff 0 28%, #0E2A18 29% 33%, #fff 34% 64%, #0E2A18 65% 69%, #fff 70% 100%);box-shadow:0 10px 26px rgba(0,0,0,.35), 0 0 0 1px rgba(14,42,24,.5) inset;z-index:40;will-change:transform;pointer-events:none;opacity:0;transition:opacity .3s}

/* ATLAS */
.landing-root .ln-atlas{position:relative;padding:120px 6vw;background:var(--paper);border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2)}
.landing-root .ln-atlas-head{display:grid;grid-template-columns:1fr 1fr;gap:64px;margin-bottom:60px;align-items:end}
@media (max-width:880px){.landing-root .ln-atlas-head{grid-template-columns:1fr;gap:32px}}
.landing-root .ln-atlas-head h2{font-size:clamp(48px,7vw,108px);margin:14px 0 0}
.landing-root .ln-atlas-head h2 em{font-style:italic;font-family:"Instrument Serif",serif;color:var(--terracotta);font-weight:400}
.landing-root .ln-atlas-right{font-size:17px;line-height:1.55;color:#234}
.landing-root .ln-atlas-right .ln-pull{font-family:"Instrument Serif",serif;font-style:italic;font-size:24px;color:var(--ink);margin-bottom:16px;line-height:1.3}

.landing-root .ln-map-card{background:var(--cream);border:1px solid var(--line-2);position:relative;overflow:hidden}
.landing-root .ln-map-head{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--line-2);font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink);flex-wrap:wrap;gap:8px}
.landing-root .ln-map-head .ln-coord{color:#666}
.landing-root .ln-map-canvas{position:relative;aspect-ratio:16/10}
.landing-root .ln-map-canvas svg{width:100%;height:100%;display:block}
.landing-root .country{fill:#dbcd9c;stroke:#7d6f3a;stroke-width:1.2}
.landing-root .city{cursor:pointer}
.landing-root .city .ring{transform-origin:center;transform-box:fill-box;opacity:0;animation:ln-ringPulse 2.4s ease-out infinite;animation-delay:var(--d,0s)}
.landing-root .city.in .ring{opacity:1}
@keyframes ln-ringPulse{0%{r:5;opacity:.9}100%{r:22;opacity:0}}
.landing-root .city .pin{transform-origin:center;transform-box:fill-box;transform:scale(0);transition:transform .5s cubic-bezier(.2,1.4,.4,1)}
.landing-root .city.in .pin{transform:scale(1)}
.landing-root .city .lbl{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;fill:var(--ink);opacity:0;transition:opacity .4s}
.landing-root .city.in .lbl{opacity:1}
.landing-root .city:hover .pin{transform:scale(1.4)}
.landing-root .city:focus{outline:none}
.landing-root .city:focus .pin{transform:scale(1.4);filter:drop-shadow(0 0 4px var(--terracotta))}
.landing-root .route{fill:none;stroke:var(--terracotta);stroke-width:1.8;stroke-dasharray:4 4;stroke-dashoffset:0;opacity:0;transition:opacity .6s}

/* Stadium tooltip — fixed-positioned editorial card next to the hovered pin */
.landing-root .ln-stadium-tip{position:fixed;z-index:60;background:var(--cream);border:1px solid var(--line-2);box-shadow:0 24px 60px rgba(14,42,24,.22);pointer-events:none;animation:ln-tipIn .22s ease-out}
@keyframes ln-tipIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.landing-root .ln-stadium-img{position:relative;aspect-ratio:16/10;background:var(--paper);overflow:hidden;border-bottom:1px solid var(--line-2)}
.landing-root .ln-stadium-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.92) contrast(1.02)}
.landing-root .ln-stadium-img-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;font-family:"Instrument Serif",serif;font-style:italic;font-size:18px;color:var(--ink);background:repeating-linear-gradient(45deg,var(--paper) 0 8px, var(--cream-2) 8px 16px)}
.landing-root .ln-stadium-badge{position:absolute;left:10px;top:10px;background:var(--ink);color:var(--cream);font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;padding:4px 8px}
.landing-root .ln-stadium-meta{padding:12px 14px 14px}
.landing-root .ln-stadium-name{font-family:"Instrument Serif",serif;font-size:20px;line-height:1.1;color:var(--ink)}
.landing-root .ln-stadium-cap{display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#666}
.landing-root .ln-stadium-cap span:last-child{color:var(--ink);font-weight:500}
@media (max-width:600px){.landing-root .ln-stadium-tip{display:none}}
.landing-root .ln-map-canvas.in .route{opacity:.85;animation:ln-dash 30s linear infinite}
@keyframes ln-dash{to{stroke-dashoffset:-400}}

.landing-root .ln-map-foot{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--line-2)}
@media (max-width:680px){.landing-root .ln-map-foot{grid-template-columns:1fr 1fr}}
.landing-root .ln-cell{padding:22px;border-right:1px solid var(--line-2)}
.landing-root .ln-cell:last-child{border-right:0}
.landing-root .ln-num{font-family:"Boldonse",sans-serif;font-size:36px;color:var(--ink);line-height:.9}
.landing-root .ln-lbl{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#666;margin-top:8px}

.landing-root .ln-cities-list{margin-top:64px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px}
@media (max-width:880px){.landing-root .ln-cities-list{grid-template-columns:1fr 1fr}}
@media (max-width:540px){.landing-root .ln-cities-list{grid-template-columns:1fr}}
.landing-root .ln-cities-col h4{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;margin:0 0 16px;color:var(--terracotta);padding-bottom:8px;border-bottom:1px solid var(--line-2)}
.landing-root .ln-cities-col ul{list-style:none;padding:0;margin:0}
.landing-root .ln-cities-col li{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px dashed var(--line);font-size:15px;color:var(--ink)}
.landing-root .ln-cities-col li .ln-n{font-family:"JetBrains Mono",monospace;font-size:11px;color:#666;letter-spacing:.1em}

/* HOW */
.landing-root .ln-how{padding:140px 6vw 160px;background:var(--cream);position:relative}
.landing-root .ln-how-head{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:end;margin-bottom:80px}
@media (max-width:880px){.landing-root .ln-how-head{grid-template-columns:1fr;gap:24px}}
.landing-root .ln-how-head h2{font-size:clamp(48px,7vw,108px);margin:14px 0 0}
.landing-root .ln-how-head h2 em{font-style:italic;font-family:"Instrument Serif",serif;color:var(--terracotta);font-weight:400}
.landing-root .ln-how-right p{font-size:17px;line-height:1.55;color:#234;margin:0}

.landing-root .ln-steps{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line-2)}
@media (max-width:980px){.landing-root .ln-steps{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.landing-root .ln-steps{grid-template-columns:1fr}}
.landing-root .ln-step{padding:36px 32px 40px;border-right:1px solid var(--line-2);position:relative;background:var(--cream);transition:background .2s}
.landing-root .ln-step:last-child{border-right:0}
@media (max-width:980px){.landing-root .ln-step:nth-child(2){border-right:0}.landing-root .ln-step:nth-child(1),.landing-root .ln-step:nth-child(2){border-bottom:1px solid var(--line-2)}}
@media (max-width:600px){.landing-root .ln-step{border-right:0;border-bottom:1px solid var(--line-2)}.landing-root .ln-step:last-child{border-bottom:0}}
.landing-root .ln-step:hover{background:var(--paper)}
.landing-root .ln-step-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px}
.landing-root .ln-step-n{font-family:"Boldonse",sans-serif;font-size:54px;line-height:.85;color:var(--ink)}
.landing-root .ln-step-tag{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--terracotta)}
.landing-root .ln-step h3{font-family:"Instrument Serif",serif;font-weight:400;font-size:28px;line-height:1.1;margin:0 0 12px;color:var(--ink)}
.landing-root .ln-step h3 em{font-style:italic}
.landing-root .ln-step p{font-size:14px;line-height:1.55;color:#444;margin:0}
.landing-root .ln-step-meta{margin-top:24px;padding-top:16px;border-top:1px dashed var(--line);font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#666;display:flex;justify-content:space-between}

/* SCORING (kept from original landing) */
.landing-root .ln-scoring{margin-top:100px;border:1px solid var(--line-2);background:var(--paper);padding:48px 40px}
.landing-root .ln-scoring-head{text-align:center;margin-bottom:40px}
.landing-root .ln-scoring-head h3{font-size:clamp(36px,5vw,56px);margin:8px 0 0;font-family:"Boldonse",sans-serif;font-weight:400;color:var(--ink)}
.landing-root .ln-scoring-head h3 em{font-style:italic;font-family:"Instrument Serif",serif;color:var(--terracotta);font-weight:400}
.landing-root .ln-scoring-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media (max-width:680px){.landing-root .ln-scoring-grid{grid-template-columns:1fr}}
.landing-root .ln-score-card{background:var(--cream);border:1px solid var(--line-2);padding:28px 24px;text-align:center}
.landing-root .ln-score-pts{font-family:"Boldonse",sans-serif;font-size:72px;line-height:.9;color:var(--grass-600)}
.landing-root .ln-score-card.mid .ln-score-pts{color:var(--terracotta)}
.landing-root .ln-score-card.flat .ln-score-pts{color:#888}
.landing-root .ln-score-lbl{font-family:"Instrument Serif",serif;font-style:italic;font-size:22px;color:var(--ink);margin-top:8px}
.landing-root .ln-score-desc{font-size:13px;line-height:1.5;color:#444;margin-top:10px}
.landing-root .ln-score-note{margin-top:24px;text-align:center;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#666}

/* CTA */
.landing-root .ln-cta{padding:160px 6vw;background:var(--ink);color:var(--cream);position:relative;overflow:hidden;text-align:center}
.landing-root .ln-cta::before{content:"";position:absolute;left:50%;top:50%;width:1100px;height:1100px;border-radius:50%;border:1px dashed rgba(244,236,214,.16);transform:translate(-50%,-50%)}
.landing-root .ln-cta::after{content:"";position:absolute;left:50%;top:50%;width:700px;height:700px;border-radius:50%;border:1px dashed rgba(244,236,214,.12);transform:translate(-50%,-50%)}
.landing-root .ln-cta-inner{position:relative}
.landing-root .ln-cta-kicker{display:inline-block;background:var(--terracotta);color:var(--cream);padding:6px 12px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;margin-bottom:24px}
.landing-root .ln-cta h2{font-size:clamp(56px,8vw,140px);margin:0 0 24px}
.landing-root .ln-cta h2 em{font-style:italic;font-family:"Instrument Serif",serif;color:var(--terracotta-2);font-weight:400}
.landing-root .ln-cta p{font-size:18px;max-width:600px;margin:0 auto 36px;line-height:1.55;color:#cfd8c9}
.landing-root .ln-cta-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.landing-root .ln-cta .ln-btn{background:var(--cream);color:var(--ink);border-color:var(--cream)}
.landing-root .ln-cta .ln-btn:hover{background:var(--terracotta);border-color:var(--terracotta);color:var(--cream)}
.landing-root .ln-cta .ln-btn.ghost{background:transparent;color:var(--cream)}
.landing-root .ln-cta .ln-btn.ghost:hover{background:var(--cream);color:var(--ink)}

/* FOOTER */
.landing-root .ln-site{padding:40px 6vw;background:var(--ink);color:var(--cream);border-top:1px solid rgba(244,236,214,.12);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase}
@media (max-width:680px){.landing-root .ln-site{grid-template-columns:1fr;text-align:center}.landing-root .ln-site .ln-links{justify-self:center}}
.landing-root .ln-site a{color:#cfd8c9;text-decoration:none}
.landing-root .ln-site a:hover{color:var(--terracotta-2)}
.landing-root .ln-site .ln-links{display:flex;gap:20px;justify-self:end;flex-wrap:wrap}
.landing-root .ln-site .ln-center{justify-self:center}

/* Reveal */
.landing-root .reveal{opacity:0;transform:translateY(24px);transition:opacity .8s, transform .8s}
.landing-root .reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){
  .landing-root .reveal{opacity:1;transform:none;transition:none}
  .landing-root .ln-ball-fix{display:none}
  .landing-root .city .ring{animation:none}
  .landing-root .ln-map-canvas.in .route{animation:none}
}
`
