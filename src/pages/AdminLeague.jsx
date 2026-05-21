import { useState, useEffect, useCallback } from 'react'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'
import { TRIGGER_GROUPS, getTriggerInfo } from '../utils/prizeRules'

const COOLDOWN_MS = 24 * 60 * 60 * 1000

function StatusBadge({ submitted }) {
  const { t } = useLang()
  return submitted ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
      ✅ {t('adminLeague.submitted')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink/60 bg-paper rounded-full px-2 py-0.5">
      ⏳ {t('adminLeague.pending')}
    </span>
  )
}

function MemberRow({ member, leagueId }) {
  const { t } = useLang()
  const [status, setStatus] = useState('idle') // idle | sending | sent | error | cooldown

  async function sendReminder() {
    setStatus('sending')
    try {
      const { error } = await supabase.functions.invoke('send-reminder', {
        body: { league_id: leagueId, target_user_id: member.user_id },
      })
      if (error?.context) {
        const body = await error.context.json?.() ?? {}
        if (body.error === 'cooldown') { setStatus('cooldown'); return }
      }
      if (error) { setStatus('error'); return }
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  const canRemind = !member.predictions_submitted || !member.extras_submitted
  const btnDisabled = !canRemind || status === 'sending' || status === 'sent' || status === 'cooldown'

  function btnLabel() {
    if (status === 'sending')  return t('adminLeague.reminderSending')
    if (status === 'sent')     return t('adminLeague.reminderSent')
    if (status === 'cooldown') return t('adminLeague.reminderCooldown')
    if (status === 'error')    return t('adminLeague.reminderError')
    return t('adminLeague.reminder')
  }

  return (
    <tr className="border-b border-ink/15 last:border-0 hover:bg-cream transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {member.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{member.username}</p>
            {member.company && <p className="text-[11px] text-ink/50 truncate">{member.company}</p>}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-center">
        <StatusBadge submitted={member.predictions_submitted} />
      </td>
      <td className="py-3 px-4 text-center">
        <StatusBadge submitted={member.extras_submitted} />
      </td>
      <td className="py-3 px-4 text-right">
        {canRemind ? (
          <button
            onClick={sendReminder}
            disabled={btnDisabled}
            className={`text-xs font-medium px-3 py-1.5 rounded-none transition-all ${
              status === 'sent' || status === 'cooldown'
                ? 'bg-green-100 text-green-700'
                : status === 'error'
                  ? 'bg-red-100 text-red-600'
                  : 'btn-secondary'
            } disabled:opacity-60`}
          >
            {status === 'sending' ? <Spinner size="sm" /> : null}
            {btnLabel()}
          </button>
        ) : (
          <span className="text-xs text-ink/40">—</span>
        )}
      </td>
    </tr>
  )
}

function PrizeConfigPanel({ league, memberCount, onSaved }) {
  const [entryFee, setEntryFee] = useState(
    league.entry_fee != null ? String(league.entry_fee) : ''
  )
  const [rules, setRules] = useState(
    Array.isArray(league.prize_rules) && league.prize_rules.length > 0
      ? league.prize_rules.map(r => ({ ...r, labelOverridden: true }))
      : []
  )
  const [saving,  setSaving]  = useState(false)
  const [flash,   setFlash]   = useState(false)
  const [error,   setError]   = useState('')

  const parsedFee = entryFee === '' ? null : parseFloat(entryFee)
  const totalPot  = parsedFee != null && !isNaN(parsedFee) && memberCount > 0 ? parsedFee * memberCount : null
  const totalPct  = rules.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
  const overLimit = totalPct > 100.005

  const DEFAULT_TRIGGER = TRIGGER_GROUPS[0].options[0]

  function addRule() {
    setRules(prev => [
      ...prev,
      {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2),
        trigger:        DEFAULT_TRIGGER.value,
        label:          DEFAULT_TRIGGER.label,
        pct:            '',
        labelOverridden: false,
      },
    ])
  }

  function removeRule(id) {
    setRules(prev => prev.filter(r => r.id !== id))
  }

  function updateRule(id, changes) {
    setRules(prev => prev.map(r => {
      if (r.id !== id) return r
      const next = { ...r, ...changes }
      if ('trigger' in changes && !r.labelOverridden) {
        next.label = getTriggerInfo(changes.trigger).label
      }
      if ('label' in changes) next.labelOverridden = true
      return next
    }))
  }

  async function handleSave() {
    if (overLimit || saving) return
    setSaving(true); setError(''); setFlash(false)
    try {
      const cleanRules = rules
        .filter(r => r.label?.trim() && parseFloat(r.pct) > 0)
        .map(({ id, trigger, label, pct }) => ({
          id, trigger,
          label: label.trim(),
          pct:   Math.round(parseFloat(pct) * 100) / 100,
        }))
      const { error: err } = await supabase
        .from('leagues')
        .update({ entry_fee: parsedFee, prize_rules: cleanRules })
        .eq('id', league.id)
      if (err) throw err
      setFlash(true)
      setTimeout(() => setFlash(false), 2500)
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-ink/20 px-4 sm:px-5 py-4 sm:py-5 space-y-4 sm:space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">💰</span>
        <h3 className="font-bold text-ink text-sm sm:text-base">Bote y premios</h3>
      </div>

      {/* Entry fee */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink/70 w-36 flex-shrink-0">Cuota por persona</label>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative w-28">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/50 text-sm pointer-events-none">€</span>
            <input
              type="number" min="0" step="1"
              value={entryFee}
              onChange={e => setEntryFee(e.target.value)}
              placeholder="20"
              className="input pl-7 text-center w-full"
            />
          </div>
          {totalPot != null ? (
            <span className="text-sm text-ink/70">
              Bote total: <strong className="text-ink">€{totalPot % 1 === 0 ? totalPot : totalPot.toFixed(2)}</strong>
              <span className="text-ink/40 text-xs ml-1.5">({memberCount} personas × €{parsedFee})</span>
            </span>
          ) : memberCount > 0 && (
            <span className="text-xs text-ink/40">{memberCount} personas</span>
          )}
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-ink/70">Reglas de reparto</p>
        {rules.length === 0 && (
          <p className="text-xs text-ink/40 italic py-1">Sin premios configurados todavía — pulsa "+ Añadir premio"</p>
        )}
        <div className="space-y-2">
          {rules.map(rule => {
            const info = getTriggerInfo(rule.trigger)
            const amt  = totalPot && parseFloat(rule.pct) > 0
                           ? Math.round(totalPot * parseFloat(rule.pct) / 100)
                           : null
            return (
              <div key={rule.id} className="flex gap-1.5 sm:gap-2 items-center">
                {/* Emoji */}
                <span className="text-base w-6 text-center flex-shrink-0 leading-none select-none">{info.emoji}</span>
                {/* Trigger select */}
                <select
                  value={rule.trigger}
                  onChange={e => updateRule(rule.id, { trigger: e.target.value })}
                  className="input text-xs flex-shrink-0 w-40 sm:w-48"
                >
                  {TRIGGER_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.label}>
                      {g.options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {/* Custom label */}
                <input
                  type="text"
                  value={rule.label}
                  onChange={e => updateRule(rule.id, { label: e.target.value })}
                  placeholder="Etiqueta del premio"
                  maxLength={80}
                  className="input text-xs flex-1 min-w-0"
                />
                {/* Percentage */}
                <div className="relative flex-shrink-0 w-[4.5rem]">
                  <input
                    type="number" min="0.1" max="100" step="1"
                    value={rule.pct}
                    onChange={e => updateRule(rule.id, { pct: e.target.value })}
                    placeholder="0"
                    className="input text-xs text-center w-full pr-5"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink/40 pointer-events-none">%</span>
                </div>
                {/* Amount */}
                {amt != null ? (
                  <span className="text-xs text-ink/50 flex-shrink-0 w-12 text-right tabular-nums">€{amt}</span>
                ) : (
                  <span className="w-12 flex-shrink-0" />
                )}
                {/* Delete */}
                <button
                  onClick={() => removeRule(rule.id)}
                  className="text-ink/30 hover:text-red-500 transition-colors flex-shrink-0 text-sm leading-none p-0.5"
                  title="Eliminar"
                >✕</button>
              </div>
            )
          })}
        </div>

        <button
          onClick={addRule}
          disabled={rules.length >= 20}
          className="btn-secondary text-xs gap-1.5 mt-1"
        >
          + Añadir premio
        </button>
      </div>

      {/* Summary bar */}
      {rules.length > 0 && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${overLimit ? 'text-red-600 font-medium' : 'text-ink/50'}`}>
          <span>Asignado: <strong className={overLimit ? 'text-red-600' : 'text-ink/80'}>{Math.round(totalPct * 10) / 10}%</strong></span>
          {totalPot != null && <span>€{Math.round(totalPot * totalPct / 100)} de €{totalPot}</span>}
          {overLimit && <span>⚠️ Los porcentajes superan el 100%</span>}
          {!overLimit && totalPct < 99.9 && totalPct > 0 && (
            <span className="text-ink/30">
              Sin asignar: {Math.round((100 - totalPct) * 10) / 10}%
              {totalPot ? ` (€${Math.round(totalPot * (100 - totalPct) / 100)})` : ''}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || overLimit}
          className="btn-primary text-sm flex items-center gap-2"
        >
          {saving && <Spinner size="sm" />}
          {flash ? '✓ Guardado' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  )
}

function LeaguePanel({ league, onSaved }) {
  const { t } = useLang()
  const [members, setMembers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 1) league_members.user_id FKs to auth.users(id), not public.profiles.
      // PostgREST cannot infer that join automatically — we query each side
      // separately and join client-side. The previous single-query join
      // returned null and crashed the page when rendered.
      const { data: memberRows, error: memberErr } = await supabase
        .from('league_members')
        .select('user_id, role, joined_at, prediction_mode')
        .eq('league_id', league.id)
        .order('joined_at')

      if (memberErr) throw memberErr
      if (!memberRows || memberRows.length === 0) { setMembers([]); return }

      const userIds = memberRows.map(m => m.user_id)

      // Each member chooses their own prediction_mode for this league:
      //  - 'per_league'  → submission row has league_id = league.id
      //  - 'global'      → submission row has league_id IS NULL
      // We fetch both candidate sets and resolve each member's submission
      // status against their own mode so global-mode members aren't
      // incorrectly marked as "pending".
      const [
        { data: profiles, error: profErr },
        { data: predSubs },
        { data: extrasSubs },
      ] = await Promise.all([
        supabase.from('profiles').select('id, username, company').in('id', userIds),
        supabase.from('prediction_submissions')
          .select('user_id, league_id').eq('source', 'matches').in('user_id', userIds)
          .or(`league_id.eq.${league.id},league_id.is.null`),
        supabase.from('prediction_submissions')
          .select('user_id, league_id').eq('source', 'extras').in('user_id', userIds)
          .or(`league_id.eq.${league.id},league_id.is.null`),
      ])

      if (profErr) throw profErr

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
      const modeByUser = Object.fromEntries(memberRows.map(m => [m.user_id, m.prediction_mode ?? 'global']))

      function submittedFor(rows) {
        const set = new Set()
        for (const r of (rows ?? [])) {
          const mode = modeByUser[r.user_id]
          const expected = mode === 'per_league' ? league.id : null
          if (r.league_id === expected) set.add(r.user_id)
        }
        return set
      }

      const predSet   = submittedFor(predSubs)
      const extrasSet = submittedFor(extrasSubs)

      setMembers(memberRows.map(m => {
        const p = profileMap[m.user_id] ?? {}
        return {
          user_id:               m.user_id,
          username:              p.username ?? '—',
          company:               p.company ?? null,
          role:                  m.role,
          predictions_submitted: predSet.has(m.user_id),
          extras_submitted:      extrasSet.has(m.user_id),
        }
      }))
    } catch (err) {
      console.error('AdminLeague loadMembers failed:', err)
      setError(t('adminLeague.loadError'))
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [league.id, t])

  useEffect(() => { loadMembers() }, [loadMembers])

  const totalSubmitted = members?.filter(m => m.predictions_submitted && m.extras_submitted).length ?? 0

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="bg-cream border-b border-ink/20 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink truncate">{league.name}</h2>
            <p className="text-xs text-ink/70 mt-0.5">{t('adminLeague.inviteCode', { code: league.invite_code })}</p>
          </div>
          {members && (
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-black text-ink">{totalSubmitted}/{members.length}</p>
              <p className="text-[10px] text-ink/70">{t('adminLeague.submitted')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : error ? (
        <div className="text-center py-8 space-y-2">
          <p className="text-red-600 text-sm">⚠️ {error}</p>
          <button onClick={loadMembers} className="btn-secondary text-sm">{t('common.retry')}</button>
        </div>
      ) : !members || members.length === 0 ? (
        <p className="text-center text-ink/50 text-sm py-8">{t('adminLeague.noMembers')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream border-b border-ink/15">
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-ink/60 uppercase tracking-wide">{t('adminLeague.members')}</th>
                <th className="py-2.5 px-4 text-center text-xs font-semibold text-ink/60 uppercase tracking-wide">{t('adminLeague.predictions')}</th>
                <th className="py-2.5 px-4 text-center text-xs font-semibold text-ink/60 uppercase tracking-wide">{t('adminLeague.extras')}</th>
                <th className="py-2.5 px-4 text-right text-xs font-semibold text-ink/60 uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  leagueId={league.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PrizeConfigPanel league={league} memberCount={members?.length ?? 0} onSaved={onSaved} />
    </div>
  )
}

export default function AdminLeague() {
  const { leagues, loading: leagueLoading, reloadLeagues } = useLeague()
  const { t } = useLang()

  const adminLeagues = leagues.filter(l => l.role === 'admin')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (adminLeagues.length > 0 && !selectedId) {
      setSelectedId(adminLeagues[0].id)
    }
  }, [adminLeagues.length])

  if (leagueLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }

  if (adminLeagues.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="text-4xl mb-3">🏆</div>
        <p className="text-ink/60 text-sm">{t('adminLeague.noAdminLeagues')}</p>
      </div>
    )
  }

  const activeLeague = adminLeagues.find(l => l.id === selectedId) ?? adminLeagues[0]

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* League picker (if multiple admin leagues) */}
      {adminLeagues.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {adminLeagues.map(l => (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                l.id === activeLeague.id
                  ? 'bg-ink text-cream'
                  : 'bg-paper text-ink/60 hover:bg-paper-200 border border-ink/30'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <LeaguePanel key={activeLeague.id} league={activeLeague} onSaved={reloadLeagues} />
    </div>
  )
}
