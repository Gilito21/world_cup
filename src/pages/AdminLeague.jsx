import { useState, useEffect, useCallback } from 'react'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

const COOLDOWN_MS = 24 * 60 * 60 * 1000

function StatusBadge({ submitted }) {
  const { t } = useLang()
  return submitted ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
      ✅ {t('adminLeague.submitted')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-500 bg-stone-100 rounded-full px-2 py-0.5">
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
    <tr className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {member.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900 truncate">{member.username}</p>
            {member.company && <p className="text-[11px] text-stone-400 truncate">{member.company}</p>}
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
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
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
          <span className="text-xs text-stone-300">—</span>
        )}
      </td>
    </tr>
  )
}

function LeaguePanel({ league }) {
  const { t } = useLang()
  const [members, setMembers] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch league members with profile data
      const { data: memberRows } = await supabase
        .from('league_members')
        .select('user_id, role, joined_at, profiles(username, company)')
        .eq('league_id', league.id)
        .order('joined_at')

      if (!memberRows) return

      // Fetch submission statuses for all members
      const userIds = memberRows.map(m => m.user_id)

      const [{ data: predSubs }, { data: extrasSubs }] = await Promise.all([
        supabase
          .from('prediction_submissions')
          .select('user_id')
          .eq('league_id', league.id)
          .eq('source', 'matches')
          .in('user_id', userIds),
        supabase
          .from('prediction_submissions')
          .select('user_id')
          .eq('league_id', league.id)
          .eq('source', 'extras')
          .in('user_id', userIds),
      ])

      const predSet   = new Set((predSubs   ?? []).map(r => r.user_id))
      const extrasSet = new Set((extrasSubs ?? []).map(r => r.user_id))

      setMembers(memberRows.map(m => ({
        user_id:               m.user_id,
        username:              m.profiles?.username ?? '—',
        company:               m.profiles?.company,
        role:                  m.role,
        predictions_submitted: predSet.has(m.user_id),
        extras_submitted:      extrasSet.has(m.user_id),
      })))
    } finally {
      setLoading(false)
    }
  }, [league.id])

  useEffect(() => { loadMembers() }, [loadMembers])

  const totalSubmitted = members?.filter(m => m.predictions_submitted && m.extras_submitted).length ?? 0

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-400 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-950 truncate">{league.name}</h2>
            <p className="text-xs text-stone-800/70 mt-0.5">{t('adminLeague.inviteCode', { code: league.invite_code })}</p>
          </div>
          {members && (
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-black text-stone-950">{totalSubmitted}/{members.length}</p>
              <p className="text-[10px] text-stone-800/70">{t('adminLeague.submitted')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Members table */}
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : members?.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-8">{t('adminLeague.noMembers')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="py-2.5 px-4 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">{t('adminLeague.members')}</th>
                <th className="py-2.5 px-4 text-center text-xs font-semibold text-stone-500 uppercase tracking-wide">{t('adminLeague.predictions')}</th>
                <th className="py-2.5 px-4 text-center text-xs font-semibold text-stone-500 uppercase tracking-wide">{t('adminLeague.extras')}</th>
                <th className="py-2.5 px-4 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide"></th>
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
    </div>
  )
}

export default function AdminLeague() {
  const { leagues, loading: leagueLoading } = useLeague()
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
        <p className="text-stone-500 text-sm">{t('adminLeague.noAdminLeagues')}</p>
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
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200 border border-stone-300'
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      <LeaguePanel key={activeLeague.id} league={activeLeague} />
    </div>
  )
}
