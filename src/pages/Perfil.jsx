import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

export default function Perfil() {
  const { user, profile, refreshProfile } = useAuth()
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
    loadStats()
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

  async function loadStats() {
    const { data } = await supabase
      .from('predictions')
      .select('points_earned, league_id')
      .eq('user_id', user.id)

    if (data) {
      const allScored = data.filter(p => p.points_earned !== null)
      setStats({
        totalPredictions: data.length,
        exact:   allScored.filter(p => p.points_earned === 3).length,
        correct: allScored.filter(p => p.points_earned === 1).length,
        accuracy: allScored.length > 0
          ? Math.round((allScored.filter(p => p.points_earned > 0).length / allScored.length) * 100)
          : null,
      })
    }
    setLoadingStats(false)
  }

  async function handleSaveCompany() {
    setSavingCompany(true)
    setCompanyError('')
    const val = companyValue.trim()
    if (val.length > 80) { setCompanyError('Máximo 80 caracteres.'); setSavingCompany(false); return }
    const { error } = await supabase.from('profiles').update({ company: val || null }).eq('id', user.id)
    if (error) { setCompanyError('No se pudo guardar.'); setSavingCompany(false); return }
    await refreshProfile()
    setSavingCompany(false)
    setEditingCompany(false)
  }

  async function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadError('')

    if (!file.type.startsWith('image/')) {
      setUploadError('El archivo debe ser una imagen.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('La imagen debe pesar menos de 2 MB.')
      return
    }

    setUploading(true)
    try {
      const ext  = file.name.split('.').pop().toLowerCase()
      const path = `${user.id}/avatar.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
      if (updateErr) throw updateErr

      setAvatarUrl(publicUrl)
      await refreshProfile()
    } catch (err) {
      setUploadError('No se pudo subir la imagen. Comprueba que el bucket "avatars" existe en Supabase Storage.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-lg">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-stone-900">Mi perfil</h2>
        <p className="text-stone-400 text-xs sm:text-sm mt-0.5 sm:mt-1">Tu cuenta y estadísticas</p>
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
              className="relative w-16 h-16 rounded-full overflow-hidden group focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              title="Cambiar foto"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile?.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-2xl">
                  {profile?.username?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {uploading
                  ? <Spinner size="sm" />
                  : <span className="text-white text-[10px] font-semibold leading-tight text-center px-1">Cambiar foto</span>
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
            <p className="text-lg font-semibold text-stone-900 truncate">{profile?.username}</p>
            {profile?.company && (
              <p className="text-stone-500 text-sm truncate">🏢 {profile.company}</p>
            )}
            <p className="text-stone-400 text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                {profile?.total_points ?? 0} pts globales
              </span>
            </div>
          </div>
        </div>

        {uploadError && (
          <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {uploadError}
          </p>
        )}
        <p className="mt-3 text-xs text-stone-400">
          Haz clic en la foto para cambiarla · Máx. 2 MB
        </p>

        {/* Empresa */}
        <div className="mt-4 pt-4 border-t border-stone-100">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Empresa</p>
          {editingCompany ? (
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 text-sm py-1.5"
                placeholder="ej. Accenture, EY, McKinsey…"
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
                {savingCompany ? <Spinner size="sm" /> : 'Guardar'}
              </button>
              <button
                onClick={() => { setEditingCompany(false); setCompanyValue(profile?.company ?? '') }}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-stone-700">
                {profile?.company || <span className="text-stone-400 italic">Sin empresa</span>}
              </p>
              <button
                onClick={() => setEditingCompany(true)}
                className="text-xs text-amber-600 hover:text-amber-500 font-medium flex-shrink-0"
              >
                {profile?.company ? 'Editar' : '+ Añadir'}
              </button>
            </div>
          )}
          {companyError && <p className="mt-1.5 text-xs text-red-400">{companyError}</p>}
        </div>
      </div>

      {/* Notificaciones */}
      <div>
        <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">Notificaciones</h3>
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-900">Recordatorios por email</p>
              <p className="text-xs text-stone-400 mt-0.5 leading-relaxed">
                Recibe un aviso cuando un partido empiece en menos de 2 horas y no hayas pronosticado.
              </p>
            </div>
            <button
              onClick={handleToggleReminders}
              disabled={savingReminders}
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                emailReminders ? 'bg-amber-500' : 'bg-stone-200'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                emailReminders ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div>
        <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">Estadísticas</h3>
        {loadingStats ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pronósticos', value: stats.totalPredictions, icon: '📝', color: 'text-stone-700' },
              { label: 'Exactos',     value: stats.exact,            icon: '🎯', color: 'text-amber-500' },
              { label: 'Correctos',   value: stats.correct,          icon: '✓',  color: 'text-blue-500'  },
              { label: 'Precisión',   value: stats.accuracy !== null ? `${stats.accuracy}%` : '—', icon: '📊', color: 'text-green-500' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="card p-4 text-center">
                <div className="text-xl mb-1">{icon}</div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-stone-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
