import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

export default function Perfil() {
  const { user, profile, refreshProfile } = useAuth()
  const [stats, setStats]               = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const [avatarUrl, setAvatarUrl]       = useState(profile?.avatar_url ?? null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadStats()
  }, [user])

  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null)
  }, [profile?.avatar_url])

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
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Mi perfil</h2>
        <p className="text-stone-400 text-sm mt-1">Tu cuenta y estadísticas</p>
      </div>

      {/* Tarjeta de identidad */}
      <div className="card p-5">
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
