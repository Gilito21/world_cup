import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLang } from '../contexts/LangContext'
import Spinner from '../components/Spinner'
import { EditorialBand, EditorialStats } from '../components/Editorial'

// Los avatares se servían en crudo (fotos de móvil de 2–4 MB) y se cargan
// repetidamente en Clasificación/Feed, lo que disparaba el cached egress del
// CDN de Supabase. Redimensionamos y reencodeamos a WebP en el cliente antes de
// subir. 128px: el display más grande es 64px (w-16), así cubre 2x DPI de sobra
// y el archivo baja a ~8–15 KB sin tocar el backend.
const AVATAR_MAX_PX = 128

async function compressAvatar(file) {
  const dataUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload  = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })

    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h || w > 4096 || h > 4096) return { tooLarge: true }

    const scale  = Math.min(1, AVATAR_MAX_PX / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/webp', 0.8)
    )
    return { blob }
  } finally {
    URL.revokeObjectURL(dataUrl)
  }
}

export default function Perfil() {
  const { user, profile, refreshProfile } = useAuth()
  const { t } = useLang()
  const [leagues, setLeagues]             = useState([])
  const [selectedLeague, setSelectedLeague] = useState(null)
  const [stats, setStats]               = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [uploading, setUploading]             = useState(false)
  const [uploadError, setUploadError]         = useState('')
  const [avatarUrl, setAvatarUrl]             = useState(profile?.avatar_url ?? null)
  const [emailReminders, setEmailReminders]   = useState(profile?.email_reminders ?? false)
  const [savingReminders, setSavingReminders] = useState(false)
  const [editingCompany, setEditingCompany] = useState(false)
  const [companyValue, setCompanyValue]     = useState(profile?.company ?? '')
  const [savingCompany, setSavingCompany]   = useState(false)
  const [companyError, setCompanyError]     = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (user) loadLeaguesAndStats()
  }, [user])

  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null)
    setEmailReminders(profile?.email_reminders ?? false)
    setCompanyValue(profile?.company ?? '')
  }, [profile?.avatar_url, profile?.email_reminders, profile?.company])

  async function handleToggleReminders() {
    setSavingReminders(true)
    const newVal = !emailReminders
    setEmailReminders(newVal)
    await supabase.from('profiles').update({ email_reminders: newVal }).eq('id', user.id)
    setSavingReminders(false)
  }

  async function loadLeaguesAndStats() {
    const { data: memberships } = await supabase
      .from('league_members')
      .select('league_id, prediction_mode, leagues(id, name)')
      .eq('user_id', user.id)

    const leagueList = (memberships ?? []).map(m => ({
      id:   m.league_id,
      name: m.leagues?.name ?? m.league_id,
      mode: m.prediction_mode ?? 'global',
    }))
    setLeagues(leagueList)

    const initial = leagueList[0] ?? null
    setSelectedLeague(initial)
    await loadStats(initial)
  }

  async function loadStats(league) {
    setLoadingStats(true)

    const isPerLeague = league?.mode === 'per_league'

    const [{ data: preds }, { data: specials }] = await Promise.all([
      supabase.from('predictions')
        .select('points_earned')
        .eq('user_id', user.id)
        [isPerLeague ? 'eq' : 'is']('league_id', isPerLeague ? league.id : null),
      supabase.from('special_predictions')
        .select('points_earned')
        .eq('user_id', user.id)
        [isPerLeague ? 'eq' : 'is']('league_id', isPerLeague ? league.id : null),
    ])

    const totalPoints = (preds ?? []).reduce((s, p) => s + (p.points_earned ?? 0), 0)
                      + (specials ?? []).reduce((s, p) => s + (p.points_earned ?? 0), 0)

    setStats({
      totalPoints,
      totalPredictions: (preds ?? []).length,
      exact:    (preds ?? []).filter(p => p.points_earned === 3).length,
      correct:  (preds ?? []).filter(p => p.points_earned === 1).length,
      accuracy: (preds ?? []).length > 0
        ? Math.round((preds ?? []).filter(p => p.points_earned > 0).length / (preds ?? []).length * 100)
        : null,
    })
    setLoadingStats(false)
  }

  async function handleSaveCompany() {
    setSavingCompany(true)
    setCompanyError('')
    const val = companyValue.trim()
    if (val.length > 80) { setCompanyError(t('perfil.companyMaxChars')); setSavingCompany(false); return }
    const { error } = await supabase.from('profiles').update({ company: val || null }).eq('id', user.id)
    if (error) { setCompanyError(t('perfil.companySaveError')); setSavingCompany(false); return }
    await refreshProfile()
    setSavingCompany(false)
    setEditingCompany(false)
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadError('')

    if (!file.type.startsWith('image/')) {
      setUploadError(t('perfil.uploadError'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('perfil.uploadSizeError'))
      return
    }

    setUploading(true)
    try {
      // Comprime y rechaza dimensiones absurdas (un JPEG de 2MB puede decodear
      // a 12000×12000 y colgar el navegador) en una sola decodificación.
      const { blob, tooLarge } = await compressAvatar(file)
      if (tooLarge) {
        setUploadError(t('perfil.uploadDimensionsError'))
        return
      }
      if (!blob) throw new Error('compression failed')

      const path = `${user.id}/avatar.webp`

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, {
          upsert: true,
          contentType: 'image/webp',
          cacheControl: '31536000',
        })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      // El nombre de archivo es estable (avatar.webp) y lo cacheamos un año, así
      // que añadimos un query param de versión para invalidar el CDN al cambiar.
      const versionedUrl = `${publicUrl}?v=${Date.now()}`

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: versionedUrl })
        .eq('id', user.id)
      if (updateErr) throw updateErr

      setAvatarUrl(versionedUrl)
      await refreshProfile()
    } catch (err) {
      setUploadError(t('perfil.uploadFailed'))
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-lg">
      <div>
        <span className="ed-mono text-terracotta text-[10px] block mb-1.5">// {t('perfil.chapter')}</span>
            <h2 className="font-display text-xl sm:text-2xl text-ink leading-none">{t('perfil.title')}</h2>
        <p className="font-serif italic text-ink/70 text-sm mt-1">{t('perfil.subtitle')}</p>
            <EditorialBand items={['PERFIL', 'EDICIÓN 2026']} />
      </div>

      {/* Tarjeta de identidad */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-4">
          {/* Avatar con upload */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-16 h-16 rounded-full overflow-hidden group focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
              title={t('perfil.changePhoto')}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile?.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-ink flex items-center justify-center text-cream font-bold text-2xl">
                  {profile?.username?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploading
                  ? <Spinner size="sm" />
                  : <span className="text-white text-[10px] font-semibold leading-tight text-center px-1">{t('perfil.changePhoto')}</span>
                }
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-ink truncate">{profile?.username}</p>
            {profile?.company && (
              <p className="text-ink/60 text-sm truncate">🏢 {profile.company}</p>
            )}
            <p className="text-ink/50 text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs bg-paper-200 text-ink border border-ink/20 px-2 py-0.5 rounded-full font-semibold">
                {stats?.totalPoints ?? profile?.total_points ?? 0} pts
                {selectedLeague && ` · ${selectedLeague.name}`}
              </span>
              {leagues.length > 1 && (
                <select
                  value={selectedLeague?.id ?? ''}
                  onChange={e => {
                    const lg = leagues.find(l => l.id === e.target.value)
                    setSelectedLeague(lg)
                    loadStats(lg)
                  }}
                  className="text-xs border border-ink/20 bg-paper text-ink px-2 py-0.5 rounded-full"
                >
                  {leagues.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {uploadError && (
          <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-none px-3 py-2">
            {uploadError}
          </p>
        )}
        <p className="mt-3 text-xs text-ink/50">
          {t('perfil.photoHint')}
        </p>

        {/* Empresa */}
        <div className="mt-4 pt-4 border-t border-ink/15">
          <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider mb-2">{t('perfil.companySection')}</p>
          {editingCompany ? (
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 text-sm py-1.5"
                placeholder={t('perfil.companyPlaceholder')}
                value={companyValue}
                onChange={e => setCompanyValue(e.target.value)}
                maxLength={80}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSaveCompany(); if (e.key === 'Escape') setEditingCompany(false) }}
              />
              <button
                onClick={handleSaveCompany}
                disabled={savingCompany}
                className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1"
              >
                {savingCompany ? <Spinner size="sm" /> : t('common.save')}
              </button>
              <button
                onClick={() => { setEditingCompany(false); setCompanyValue(profile?.company ?? '') }}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-ink/80">
                {profile?.company || <span className="text-ink/50 italic">{t('perfil.noCompany')}</span>}
              </p>
              <button
                onClick={() => setEditingCompany(true)}
                className="text-xs text-ink/70 hover:text-ink font-medium flex-shrink-0"
              >
                {profile?.company ? t('perfil.editCompany') : t('perfil.addCompany')}
              </button>
            </div>
          )}
          {companyError && <p className="mt-1.5 text-xs text-red-400">{companyError}</p>}
        </div>
      </div>

      {/* Notificaciones */}
      <div>
        <h3 className="text-sm font-semibold text-ink/50 uppercase tracking-wider mb-3">{t('perfil.notificationsSection')}</h3>
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t('perfil.remindersTitle')}</p>
              <p className="text-xs text-ink/50 mt-0.5 leading-relaxed">
                {t('perfil.remindersDesc')}
              </p>
            </div>
            <button
              onClick={handleToggleReminders}
              disabled={savingReminders}
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 ${
                emailReminders ? 'bg-ink' : 'bg-paper-200'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-paper rounded-full shadow transition-transform duration-200 ${
                emailReminders ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-terracotta mb-3">// {t('perfil.statsSection')}</h3>
        {loadingStats ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : stats ? (
          <EditorialStats items={[
            { label: t('perfil.statPredictions'), value: stats.totalPredictions },
            { label: t('perfil.statExact'),       value: stats.exact },
            { label: t('perfil.statCorrect'),     value: stats.correct },
            { label: t('perfil.statAccuracy'),    value: stats.accuracy !== null ? `${stats.accuracy}%` : '—' },
          ]} />
        ) : null}
      </div>
    </div>
  )
}
