/**
 * seed-matches.js
 * Importa todos los partidos del Mundial 2026 desde football-data.org
 * Ejecutar UNA SOLA VEZ: npm run seed-matches
 *
 * Requiere en .env:
 *   FOOTBALL_API_KEY=tu_clave_de_football-data.org
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY
const SUPABASE_URL     = process.env.SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY

// ID del Mundial 2026 en football-data.org (WC = World Cup)
const WC_2026_ID = 'WC'

// Emojis de bandera por código de país (ISO 3166-1 alpha-2)
const FLAGS = {
  AR: '🇦🇷', AU: '🇦🇺', BE: '🇧🇪', BR: '🇧🇷', CA: '🇨🇦',
  CL: '🇨🇱', CO: '🇨🇴', CR: '🇨🇷', DE: '🇩🇪', DK: '🇩🇰',
  EC: '🇪🇨', EG: '🇪🇬', ES: '🇪🇸', FR: '🇫🇷', GB: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  GH: '🇬🇭', HR: '🇭🇷', HU: '🇭🇺', IR: '🇮🇷', IT: '🇮🇹',
  JM: '🇯🇲', JP: '🇯🇵', KR: '🇰🇷', MA: '🇲🇦', MX: '🇲🇽',
  NG: '🇳🇬', NL: '🇳🇱', PA: '🇵🇦', PE: '🇵🇪', PL: '🇵🇱',
  PT: '🇵🇹', QA: '🇶🇦', RS: '🇷🇸', SA: '🇸🇦', SN: '🇸🇳',
  TN: '🇹🇳', TR: '🇹🇷', US: '🇺🇸', UY: '🇺🇾', VE: '🇻🇪',
  HN: '🇭🇳', BO: '🇧🇴', PY: '🇵🇾', CM: '🇨🇲', CI: '🇨🇮',
  ML: '🇲🇱', SL: '🇸🇱', TZ: '🇹🇿', UZ: '🇺🇿', NZ: '🇳🇿',
  AT: '🇦🇹', PT: '🇵🇹', RO: '🇷🇴', SK: '🇸🇰', SI: '🇸🇮',
  UA: '🇺🇦', GE: '🇬🇪', AL: '🇦🇱', BA: '🇧🇦', ME: '🇲🇪',
  MK: '🇲🇰', DEFAULT: '🏳️',
}

function getFlag(countryCode) {
  return FLAGS[countryCode] ?? FLAGS.DEFAULT
}

function mapStage(stage) {
  const map = {
    'GROUP_STAGE':         'group',
    'ROUND_OF_32':         'round_of_32',
    'LAST_32':             'round_of_32',
    'ROUND_OF_16':         'round_of_16',
    'LAST_16':             'round_of_16',
    'QUARTER_FINALS':      'quarter_final',
    'SEMI_FINALS':         'semi_final',
    'THIRD_PLACE':         'third_place',
    'FINAL':               'final',
  }
  return map[stage] ?? 'group'
}

function mapStatus(status) {
  const map = {
    'SCHEDULED':  'scheduled',
    'TIMED':      'scheduled',
    'IN_PLAY':    'live',
    'PAUSED':     'live',
    'FINISHED':   'finished',
    'AWARDED':    'finished',
    'SUSPENDED':  'scheduled',
    'POSTPONED':  'scheduled',
    'CANCELLED':  'scheduled',
  }
  return map[status] ?? 'scheduled'
}

async function fetchMatches() {
  console.log('📡 Obteniendo partidos de football-data.org...')
  const res = await fetch(`https://api.football-data.org/v4/competitions/${WC_2026_ID}/matches`, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error API (${res.status}): ${body}`)
  }

  const { matches } = await res.json()
  console.log(`✅ ${matches.length} partidos obtenidos`)
  return matches
}

async function seedToSupabase(matches) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const rows = matches.map(m => ({
    external_id: m.id,
    home_team:   m.homeTeam.name ?? m.homeTeam.shortName ?? 'TBD',
    away_team:   m.awayTeam.name ?? m.awayTeam.shortName ?? 'TBD',
    home_flag:   getFlag(m.homeTeam.tla),
    away_flag:   getFlag(m.awayTeam.tla),
    match_date:  m.utcDate,
    stage:       mapStage(m.stage),
    group_name:  m.group?.replace('GROUP_', '') ?? null,
    venue:       m.venue ?? null,
    status:      mapStatus(m.status),
    home_score:  m.score?.fullTime?.home ?? null,
    away_score:  m.score?.fullTime?.away ?? null,
  }))

  console.log(`💾 Insertando ${rows.length} partidos en Supabase...`)

  // Upsert por external_id para idempotencia
  const { data, error } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'external_id', ignoreDuplicates: false })
    .select('id')

  if (error) throw error

  console.log(`✅ ${data.length} partidos guardados/actualizados`)
}

async function main() {
  if (!FOOTBALL_API_KEY) {
    console.error('❌ Falta FOOTBALL_API_KEY en .env')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
    process.exit(1)
  }

  try {
    const matches = await fetchMatches()
    await seedToSupabase(matches)
    console.log('🎉 Seed completado. ¡Los partidos están listos!')
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
