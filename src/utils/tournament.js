/**
 * FIFA World Cup 2026 – Tournament progression engine
 *
 * Pure functions only; no side-effects, no imports, fully testable in isolation.
 *
 * Format summary
 * ──────────────
 *   48 teams · 12 groups (A–L) · 4 teams each · round-robin (6 matches / group)
 *   Qualify:  top 2 from every group  →  24 teams
 *             best 8 third-placed     →   8 teams
 *                                        ────────
 *                                        32 teams → Round of 32
 *
 * Tiebreak order (group stage)
 * ────────────────────────────
 *   1. Points          2. Goal difference    3. Goals scored
 *   4. Head-to-head pts (todo: pass h2h flag)
 *   5. Alphabetical tie-breaker (deterministic placeholder)
 *
 * Round of 32 bracket (oficial FIFA 2026)
 * ─────────────────────────────────────────
 *   Segundos vs segundos (8 duelos fijos):  2A-2B, 2E-2I, 2K-2L, 2D-2G,
 *                                           1C-2F, 1F-2C, 1H-2J, 1J-2H.
 *   Primeros vs 3ºs (8 duelos dependientes de qué 3ºs clasifican):
 *     1E, 1I, 1A, 1L, 1D, 1G, 1B, 1K — cada uno contra un 3er clasificado.
 *   Terceros: asignados via BRACKET_SCENARIOS (Anexo C reglamento FIFA 2026).
 *   Fallback greedy cuando no hay escenario explícito.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

/** How many group-stage matches each team plays (round-robin in a group of 4) */
export const GROUP_MATCHES_PER_TEAM = 3

/** Number of third-placed teams that advance to the knockout stage */
export const THIRD_PLACE_QUALIFIERS = 8

// ─── STANDINGS COMPUTATION ───────────────────────────────────────────────────

function emptyStanding(team, group) {
  return { team, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }
}

/**
 * Compare two standing objects.
 * Returns negative if a ranks higher than b (suitable for Array.sort).
 * Tiebreak: points → GD → GF → alphabetical team name.
 */
export function compareStandings(a, b) {
  if (b.points !== a.points) return b.points - a.points
  if (b.gd     !== a.gd    ) return b.gd     - a.gd
  if (b.gf     !== a.gf    ) return b.gf     - a.gf
  return a.team.localeCompare(b.team)
}

/**
 * Compute the sorted standings table for a single group.
 *
 * @param {object[]} matches  – group-stage matches (may have null scores if unplayed)
 * @param {string}   group    – group letter, e.g. 'A'
 * @returns {object[]}        – standings sorted best → worst
 */
export function computeGroupStandings(matches, group) {
  const map = {}

  for (const m of matches) {
    if (!map[m.home_team]) map[m.home_team] = emptyStanding(m.home_team, group)
    if (!map[m.away_team]) map[m.away_team] = emptyStanding(m.away_team, group)

    // Skip unplayed matches
    if (m.home_score == null || m.away_score == null) continue

    const h = map[m.home_team]
    const a = map[m.away_team]

    h.played++; a.played++
    h.gf += m.home_score; h.ga += m.away_score
    a.gf += m.away_score; a.ga += m.home_score
    h.gd = h.gf - h.ga;   a.gd = a.gf - a.ga

    if      (m.home_score > m.away_score) { h.won++; h.points += 3; a.lost++ }
    else if (m.home_score < m.away_score) { a.won++; a.points += 3; h.lost++ }
    else                                  { h.drawn++; h.points++; a.drawn++; a.points++ }
  }

  return Object.values(map).sort(compareStandings)
}

/**
 * Compute standings for all 12 groups from a flat list of all group-stage matches.
 *
 * @param {object[]} allMatches  – all matches in the tournament (any stage)
 * @returns {{ [group: string]: object[] }}  – keyed by group letter
 */
export function computeAllStandings(allMatches) {
  const byGroup = {}
  for (const m of allMatches) {
    if (m.stage !== 'group' || !m.group_name) continue
    ;(byGroup[m.group_name] = byGroup[m.group_name] ?? []).push(m)
  }
  return Object.fromEntries(
    GROUPS.map(g => [g, computeGroupStandings(byGroup[g] ?? [], g)])
  )
}

// ─── THIRD-PLACE RANKING ─────────────────────────────────────────────────────

/**
 * Return the best THIRD_PLACE_QUALIFIERS (8) third-placed teams across all groups,
 * sorted best → worst by the same tiebreak criteria as the group table.
 *
 * @param {{ [group: string]: object[] }} allStandings
 * @returns {object[]}  – up to 8 standing objects, each carrying a `group` field
 */
export function rankThirdPlacedTeams(allStandings) {
  const thirds = GROUPS
    .map(g => allStandings[g]?.[2])
    .filter(Boolean)

  return thirds.sort(compareStandings).slice(0, THIRD_PLACE_QUALIFIERS)
}

/**
 * Derive all qualified teams from computed standings.
 *
 * @param {{ [group: string]: object[] }} allStandings
 * @returns {{
 *   winners:              { [group: string]: object|null },
 *   runnersUp:            { [group: string]: object|null },
 *   thirds:               object[],
 *   qualifyingThirdGroups: Set<string>
 * }}
 */
export function getQualifiers(allStandings) {
  const thirds = rankThirdPlacedTeams(allStandings)
  return {
    winners:              Object.fromEntries(GROUPS.map(g => [g, allStandings[g]?.[0] ?? null])),
    runnersUp:            Object.fromEntries(GROUPS.map(g => [g, allStandings[g]?.[1] ?? null])),
    thirds,
    qualifyingThirdGroups: new Set(thirds.map(t => t.group)),
  }
}

// ─── ROUND OF 32 BRACKET TEMPLATE ────────────────────────────────────────────
//
// Slot descriptor shapes:
//   { type: 'winner',  group: 'A' }   →  1st place, Group A
//   { type: 'runner',  group: 'B' }   →  2nd place, Group B
//   { type: 'third',   rank: 0   }    →  best qualifying 3rd-place team  (rank=0)
//
// nextMatch / nextSlot  describe where the winner of each R32 match goes.
//
// Bracket structure oficial FIFA 2026
// ─────────────────────────────────────
//   Upper half → SF1: QF1 (R16_M1/M2) + QF3 (R16_M3/M4)
//   Lower half → SF2: QF2 (R16_M5/M6) + QF4 (R16_M7/M8)
//
//   FIFA M73-M80 = R32 M1-M8  (upper half)
//   FIFA M81-M88 = R32 M9-M16 (lower half)

export const R32_TEMPLATE = [
  // ── Upper half ───────────────────────────────────────────────────────────
  // FIFA M73: 2A vs 2B  → R16_M2 (FIFA M90)
  { id:'R32_M1',  home:{type:'runner',group:'A'}, away:{type:'runner',group:'B'}, nextMatch:'R16_M2', nextSlot:'home' },
  // FIFA M74: 1E vs 3º  → R16_M1 (FIFA M89)
  { id:'R32_M2',  home:{type:'winner',group:'E'}, away:{type:'third',rank:0},     nextMatch:'R16_M1', nextSlot:'home' },
  // FIFA M75: 1F vs 2C  → R16_M2 (FIFA M90)
  { id:'R32_M3',  home:{type:'winner',group:'F'}, away:{type:'runner',group:'C'}, nextMatch:'R16_M2', nextSlot:'away' },
  // FIFA M76: 1C vs 2F  → R16_M3 (FIFA M91)
  { id:'R32_M4',  home:{type:'winner',group:'C'}, away:{type:'runner',group:'F'}, nextMatch:'R16_M3', nextSlot:'home' },
  // FIFA M77: 1I vs 3º  → R16_M1 (FIFA M89)
  { id:'R32_M5',  home:{type:'winner',group:'I'}, away:{type:'third',rank:1},     nextMatch:'R16_M1', nextSlot:'away' },
  // FIFA M78: 2E vs 2I  → R16_M3 (FIFA M91)
  { id:'R32_M6',  home:{type:'runner',group:'E'}, away:{type:'runner',group:'I'}, nextMatch:'R16_M3', nextSlot:'away' },
  // FIFA M79: 1A vs 3º  → R16_M4 (FIFA M92)
  { id:'R32_M7',  home:{type:'winner',group:'A'}, away:{type:'third',rank:2},     nextMatch:'R16_M4', nextSlot:'home' },
  // FIFA M80: 1L vs 3º  → R16_M4 (FIFA M92)
  { id:'R32_M8',  home:{type:'winner',group:'L'}, away:{type:'third',rank:3},     nextMatch:'R16_M4', nextSlot:'away' },
  // ── Lower half ───────────────────────────────────────────────────────────
  // FIFA M81: 1D vs 3º  → R16_M6 (FIFA M94)
  { id:'R32_M9',  home:{type:'winner',group:'D'}, away:{type:'third',rank:4},     nextMatch:'R16_M6', nextSlot:'home' },
  // FIFA M82: 1G vs 3º  → R16_M6 (FIFA M94)
  { id:'R32_M10', home:{type:'winner',group:'G'}, away:{type:'third',rank:5},     nextMatch:'R16_M6', nextSlot:'away' },
  // FIFA M83: 2K vs 2L  → R16_M5 (FIFA M93)
  { id:'R32_M11', home:{type:'runner',group:'K'}, away:{type:'runner',group:'L'}, nextMatch:'R16_M5', nextSlot:'home' },
  // FIFA M84: 1H vs 2J  → R16_M5 (FIFA M93)
  { id:'R32_M12', home:{type:'winner',group:'H'}, away:{type:'runner',group:'J'}, nextMatch:'R16_M5', nextSlot:'away' },
  // FIFA M85: 1B vs 3º  → R16_M8 (FIFA M96)
  { id:'R32_M13', home:{type:'winner',group:'B'}, away:{type:'third',rank:6},     nextMatch:'R16_M8', nextSlot:'home' },
  // FIFA M86: 1J vs 2H  → R16_M7 (FIFA M95)
  { id:'R32_M14', home:{type:'winner',group:'J'}, away:{type:'runner',group:'H'}, nextMatch:'R16_M7', nextSlot:'home' },
  // FIFA M87: 1K vs 3º  → R16_M8 (FIFA M96)
  { id:'R32_M15', home:{type:'winner',group:'K'}, away:{type:'third',rank:7},     nextMatch:'R16_M8', nextSlot:'away' },
  // FIFA M88: 2D vs 2G  → R16_M7 (FIFA M95)
  { id:'R32_M16', home:{type:'runner',group:'D'}, away:{type:'runner',group:'G'}, nextMatch:'R16_M7', nextSlot:'away' },
]

// Full bracket progression tree: maps each match id to where its winner advances.
// Numeración FIFA: R32=M73-M88, R16=M89-M96, QF=M97-M100, SF=M101-M102, Final=M104
export const BRACKET_PROGRESSION = {
  // R32 → R16
  R32_M1:  { nextMatch:'R16_M2', nextSlot:'home' },  // M73 → M90
  R32_M2:  { nextMatch:'R16_M1', nextSlot:'home' },  // M74 → M89
  R32_M3:  { nextMatch:'R16_M2', nextSlot:'away' },  // M75 → M90
  R32_M4:  { nextMatch:'R16_M3', nextSlot:'home' },  // M76 → M91
  R32_M5:  { nextMatch:'R16_M1', nextSlot:'away' },  // M77 → M89
  R32_M6:  { nextMatch:'R16_M3', nextSlot:'away' },  // M78 → M91
  R32_M7:  { nextMatch:'R16_M4', nextSlot:'home' },  // M79 → M92
  R32_M8:  { nextMatch:'R16_M4', nextSlot:'away' },  // M80 → M92
  R32_M9:  { nextMatch:'R16_M6', nextSlot:'home' },  // M81 → M94
  R32_M10: { nextMatch:'R16_M6', nextSlot:'away' },  // M82 → M94
  R32_M11: { nextMatch:'R16_M5', nextSlot:'home' },  // M83 → M93
  R32_M12: { nextMatch:'R16_M5', nextSlot:'away' },  // M84 → M93
  R32_M13: { nextMatch:'R16_M8', nextSlot:'home' },  // M85 → M96
  R32_M14: { nextMatch:'R16_M7', nextSlot:'home' },  // M86 → M95
  R32_M15: { nextMatch:'R16_M8', nextSlot:'away' },  // M87 → M96
  R32_M16: { nextMatch:'R16_M7', nextSlot:'away' },  // M88 → M95
  // R16 → QF
  R16_M1: { nextMatch:'QF_M1', nextSlot:'home' },  // M89 → M97
  R16_M2: { nextMatch:'QF_M1', nextSlot:'away' },  // M90 → M97
  R16_M3: { nextMatch:'QF_M3', nextSlot:'home' },  // M91 → M99
  R16_M4: { nextMatch:'QF_M3', nextSlot:'away' },  // M92 → M99
  R16_M5: { nextMatch:'QF_M2', nextSlot:'home' },  // M93 → M98
  R16_M6: { nextMatch:'QF_M2', nextSlot:'away' },  // M94 → M98
  R16_M7: { nextMatch:'QF_M4', nextSlot:'home' },  // M95 → M100
  R16_M8: { nextMatch:'QF_M4', nextSlot:'away' },  // M96 → M100
  // QF → SF
  QF_M1: { nextMatch:'SF_M1', nextSlot:'home' },  // M97 → M101
  QF_M2: { nextMatch:'SF_M1', nextSlot:'away' },  // M98 → M101
  QF_M3: { nextMatch:'SF_M2', nextSlot:'home' },  // M99 → M102
  QF_M4: { nextMatch:'SF_M2', nextSlot:'away' },  // M100 → M102
  // SF → Final / 3rd-place play-off
  SF_M1: { nextMatch:'FINAL',   nextSlot:'home', loserMatch:'THIRD_PLACE', loserSlot:'home' },
  SF_M2: { nextMatch:'FINAL',   nextSlot:'away', loserMatch:'THIRD_PLACE', loserSlot:'away' },
}

// ─── BRACKET SCENARIOS ───────────────────────────────────────────────────────
//
// Key:   8 qualifying group letters sorted and joined, e.g. 'ABCDFGHI'
// Value: 8-element array de letras de grupo que mapean al slot de rank [0..7]
//        en R32_TEMPLATE:
//          slot 0 → R32_M2  (vs 1E)   forbidden: E
//          slot 1 → R32_M5  (vs 1I)   forbidden: I
//          slot 2 → R32_M7  (vs 1A)   forbidden: A
//          slot 3 → R32_M8  (vs 1L)   forbidden: L
//          slot 4 → R32_M9  (vs 1D)   forbidden: D
//          slot 5 → R32_M10 (vs 1G)   forbidden: G
//          slot 6 → R32_M13 (vs 1B)   forbidden: B
//          slot 7 → R32_M15 (vs 1K)   forbidden: K
//
// Fuente: Anexo C del reglamento oficial FIFA World Cup 2026.
// Mientras no se poblen los 495 escenarios, el greedy fallback cubre todos.

export const BRACKET_SCENARIOS = {
  // TODO: poblar con los 495 escenarios del Anexo C FIFA 2026
}

// ─── THIRD-PLACE SLOT ASSIGNMENT ─────────────────────────────────────────────

/**
 * Derive which group is forbidden for each third-place rank slot
 * (the slot's fixed opponent must be from a different group).
 */
function buildSlotForbiddenGroups(r32Template) {
  return r32Template
    .filter(m => m.away.type === 'third' || m.home.type === 'third')
    .sort((a, b) => {
      const rankA = (a.home.type === 'third' ? a.home : a.away).rank
      const rankB = (b.home.type === 'third' ? b.home : b.away).rank
      return rankA - rankB
    })
    .map(m => {
      const opponent = m.home.type === 'third' ? m.away : m.home
      return opponent.group ?? null  // null = no restriction
    })
}

/**
 * Assign the 8 qualifying third-placed teams to the 8 rank slots in R32_TEMPLATE.
 *
 * Uses an explicit scenario table first; falls back to a greedy constraint-
 * satisfying algorithm that assigns the best team to the lowest available slot
 * it can legally fill (no same-group clash with the slot's fixed opponent).
 *
 * @param {object[]} thirds     – 8 standing objects sorted best → worst
 * @param {object[]} r32Template
 * @returns {string[]}          – 8 team names, index = rank slot
 */
export function assignThirdsToSlots(thirds, r32Template = R32_TEMPLATE) {
  const qualifyingKey = thirds.map(t => t.group).sort().join('')
  const explicit = BRACKET_SCENARIOS[qualifyingKey]

  if (explicit) {
    // Map the explicit scenario (array of group letters) to team names
    const groupToTeam = Object.fromEntries(thirds.map(t => [t.group, t.team]))
    return explicit.map(g => groupToTeam[g] ?? null)
  }

  // ── Greedy fallback ───────────────────────────────────────────────────────
  const forbidden = buildSlotForbiddenGroups(r32Template)
  const assigned  = new Array(8).fill(null)
  const usedSlots = new Set()

  for (const third of thirds) {
    for (let slot = 0; slot < 8; slot++) {
      if (usedSlots.has(slot)) continue
      if (forbidden[slot] === third.group) continue
      assigned[slot] = third.team
      usedSlots.add(slot)
      break
    }
  }

  return assigned
}

// ─── SLOT RESOLUTION ────────────────────────────────────────────────────────

function resolveSlot(slot, qualifiers, thirdAssignment) {
  if (slot.type === 'winner') return qualifiers.winners[slot.group]?.team  ?? null
  if (slot.type === 'runner') return qualifiers.runnersUp[slot.group]?.team ?? null
  if (slot.type === 'third')  return thirdAssignment[slot.rank]             ?? null
  return null
}

// ─── COMPLETE-GROUP FILTER ────────────────────────────────────────────────────

/**
 * Given computed standings and all DB matches, return a copy of the standings
 * where any group that has not yet had ALL its matches finished is replaced
 * with an empty array. This prevents alphabetical placeholders from appearing
 * in the bracket before real results are available.
 *
 * Use this instead of raw standings when resolving R32 slots or qualifying thirds.
 * Raw standings (with partial groups) are still useful for displaying group tables.
 */
export function filterCompleteGroups(allStandings, allMatches) {
  const matchCount    = {}
  const finishedCount = {}
  for (const m of allMatches) {
    if (m.stage !== 'group' || !m.group_name) continue
    matchCount[m.group_name]    = (matchCount[m.group_name]    ?? 0) + 1
    if (m.status === 'finished') finishedCount[m.group_name] = (finishedCount[m.group_name] ?? 0) + 1
  }
  return Object.fromEntries(
    Object.entries(allStandings).map(([g, s]) =>
      [g, matchCount[g] > 0 && matchCount[g] === (finishedCount[g] ?? 0) ? s : []]
    )
  )
}



/**
 * Build the 16 Round-of-32 matches with team names filled in where known.
 * If the group stage is incomplete, some team slots will be null.
 *
 * @param {{ [group: string]: object[] }} allStandings
 * @returns {object[]}  – 16 match objects with homeTeam / awayTeam resolved
 */
export function buildRoundOf32(allStandings) {
  const qualifiers     = getQualifiers(allStandings)
  const thirdAssignment = assignThirdsToSlots(qualifiers.thirds)

  return R32_TEMPLATE.map(tpl => ({
    id:        tpl.id,
    homeSlot:  tpl.home,
    awaySlot:  tpl.away,
    homeTeam:  resolveSlot(tpl.home, qualifiers, thirdAssignment),
    awayTeam:  resolveSlot(tpl.away, qualifiers, thirdAssignment),
    nextMatch: tpl.nextMatch,
    nextSlot:  tpl.nextSlot,
  }))
}

// ─── KNOCKOUT ROUND PROGRESSION ──────────────────────────────────────────────

/**
 * Given an array of finished knockout matches (with homeScore/awayScore),
 * return a map of which team has been placed in which slot of the next match.
 *
 * Draws are treated as "no winner yet" (null) — the caller handles
 * extra-time / penalty shoot-out separately.
 *
 * @param {object[]} finishedMatches
 * @returns {{ [matchId: string]: { home?: string, away?: string } }}
 */
export function advanceKnockoutRound(finishedMatches) {
  const nextRound = {}

  for (const m of finishedMatches) {
    if (m.home_score == null || m.away_score == null) continue

    // Prefer the explicit winner field (set by update-results.js, accounts for ET/penalties).
    // Fall back to score comparison for matches without the field (legacy data).
    const winner =
      m.winner === 'home' ? (m.homeTeam ?? m.home_team) :
      m.winner === 'away' ? (m.awayTeam ?? m.away_team) :
      m.home_score > m.away_score ? (m.homeTeam ?? m.home_team) :
      m.away_score > m.home_score ? (m.awayTeam ?? m.away_team) :
      null

    const loser =
      m.winner === 'home' ? (m.awayTeam ?? m.away_team) :
      m.winner === 'away' ? (m.homeTeam ?? m.home_team) :
      m.home_score > m.away_score ? (m.awayTeam ?? m.away_team) :
      m.away_score > m.home_score ? (m.homeTeam ?? m.home_team) :
      null

    const prog = BRACKET_PROGRESSION[m.id]
    if (!prog) continue

    if (winner) {
      if (!nextRound[prog.nextMatch]) nextRound[prog.nextMatch] = {}
      nextRound[prog.nextMatch][prog.nextSlot] = winner
    }

    if (loser && prog.loserMatch) {
      if (!nextRound[prog.loserMatch]) nextRound[prog.loserMatch] = {}
      nextRound[prog.loserMatch][prog.loserSlot] = loser
    }
  }

  return nextRound
}

// ─── FULL BRACKET STATE ──────────────────────────────────────────────────────

/**
 * Build the complete live bracket state from the full flat list of all matches.
 *
 * The returned object is a pure snapshot — safe to recalculate on every
 * result input without caching.
 *
 * @param {object[]} allMatches   – all matches from the DB (all stages)
 * @returns {{
 *   standings:    { [group: string]: object[] },
 *   qualifiers:   object,
 *   r32:          object[],
 *   knockoutSlots: { [matchId: string]: { home?: string, away?: string } },
 * }}
 */
export function buildFullBracket(allMatches) {
  // ── Group stage ────────────────────────────────────────────────────────────
  const standings         = computeAllStandings(allMatches)
  const resolvedStandings = filterCompleteGroups(standings, allMatches)
  const qualifiers        = getQualifiers(resolvedStandings)
  const r32               = buildRoundOf32(resolvedStandings)

  // ── Knockout progression ───────────────────────────────────────────────────
  // Collect all finished knockout matches in every stage
  const finishedKnockout = allMatches.filter(
    m => m.stage !== 'group' &&
         m.home_score != null &&
         m.away_score != null
  )

  const knockoutSlots = advanceKnockoutRound(finishedKnockout)

  return { standings, qualifiers, r32, knockoutSlots }
}

// ─── STAGE → BRACKET-ID LISTS ────────────────────────────────────────────────

export const STAGE_BRACKET_IDS = {
  round_of_32:   ['R32_M1','R32_M2','R32_M3','R32_M4','R32_M5','R32_M6','R32_M7','R32_M8',
                  'R32_M9','R32_M10','R32_M11','R32_M12','R32_M13','R32_M14','R32_M15','R32_M16'],
  round_of_16:   ['R16_M1','R16_M2','R16_M3','R16_M4','R16_M5','R16_M6','R16_M7','R16_M8'],
  quarter_final: ['QF_M1','QF_M2','QF_M3','QF_M4'],
  semi_final:    ['SF_M1','SF_M2'],
  third_place:   ['THIRD_PLACE'],
  final:         ['FINAL'],
}

// ─── PREDICTED-KNOCKOUT OVERLAY ───────────────────────────────────────────────

/**
 * Given all DB matches and the user's saved predictions (match_id → prediction),
 * compute which teams the user expects to appear in each knockout DB match.
 *
 * Cascade:
 *   user's group predictions   → predicted group standings
 *   predicted group standings  → predicted R32 teams
 *   user's R32 predictions     → predicted R16 teams
 *   user's R16 predictions     → predicted QF teams
 *   … and so on through the Final / 3rd-place match.
 *
 * DB knockout matches are paired with bracket template positions by sorting
 * each stage's matches by match_date (earliest = position 0 = first template slot).
 * This assumes football-data.org returns knockout matches in bracket order.
 *
 * @param {object[]} dbMatches     – all matches from the DB (any stage, any status)
 * @param {{ [matchId: string]: { home_score: number, away_score: number } }} userPredMap
 * @returns {{ [dbMatchId: string]: { homeTeam: string|null, awayTeam: string|null } }}
 */
export function computePredictedKnockout(dbMatches, userPredMap) {
  // ── Step 1: compute predicted group standings ─────────────────────────────
  const groupMatches = dbMatches.filter(m => m.stage === 'group')

  // Synthetic matches: prefer user's predicted scores; fall back to real scores
  const syntheticGroup = groupMatches.map(m => {
    const pred = userPredMap[m.id]
    return {
      ...m,
      home_score: pred != null ? pred.home_score : m.home_score,
      away_score: pred != null ? pred.away_score : m.away_score,
    }
  })

  const predictedStandings = computeAllStandings(syntheticGroup)

  // Only resolve bracket slots for groups where the user has predicted ALL matches.
  // Incomplete groups return [] so slots resolve to null (TBD) instead of
  // spurious alphabetical placeholders derived from 0-point ties.
  const groupMatchCount = {}
  const groupPredCount  = {}
  for (const m of groupMatches) {
    const g = m.group_name
    if (!g) continue
    groupMatchCount[g] = (groupMatchCount[g] ?? 0) + 1
    if (userPredMap[m.id] != null) groupPredCount[g] = (groupPredCount[g] ?? 0) + 1
  }
  const resolvedStandings = Object.fromEntries(
    Object.entries(predictedStandings).map(([g, s]) =>
      [g, groupMatchCount[g] > 0 && groupMatchCount[g] === (groupPredCount[g] ?? 0) ? s : []]
    )
  )

  // ── Step 2: build predicted R32 bracket ───────────────────────────────────
  const r32Bracket = buildRoundOf32(resolvedStandings)  // 16 items in template order

  // ── Step 3: pair DB knockout matches with bracket positions ───────────────
  // For each knockout stage, sort DB matches by date → index = bracket position
  const dbByStage = {}
  for (const m of dbMatches) {
    if (m.stage === 'group') continue
    ;(dbByStage[m.stage] = dbByStage[m.stage] ?? []).push(m)
  }
  for (const stage of Object.keys(dbByStage)) {
    dbByStage[stage].sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
  }

  const result = {}  // dbMatchId → { homeTeam, awayTeam }

  // ── Step 4: propagate teams round by round ────────────────────────────────
  // bracketSlots: bracketMatchId → { home: teamName, away: teamName }
  const bracketSlots = {}

  // Seed R32 from the template
  for (const bm of r32Bracket) {
    bracketSlots[bm.id] = { home: bm.homeTeam, away: bm.awayTeam }
  }

  // Process stages in order
  const KNOCKOUT_STAGES = ['round_of_32','round_of_16','quarter_final','semi_final','third_place','final']

  for (const stage of KNOCKOUT_STAGES) {
    const bracketIds = STAGE_BRACKET_IDS[stage] ?? []
    const dbMatches_ = dbByStage[stage] ?? []

    // Pair DB match ↔ bracket position by index
    bracketIds.forEach((bracketId, idx) => {
      const dbMatch = dbMatches_[idx]
      if (!dbMatch) return

      const teams = bracketSlots[bracketId] ?? { home: null, away: null }
      result[dbMatch.id] = { homeTeam: teams.home ?? null, awayTeam: teams.away ?? null }

      // Now resolve the winner of this DB match (from user's prediction)
      // and push it into the next bracket slot
      const pred   = userPredMap[dbMatch.id]
      const prog   = BRACKET_PROGRESSION[bracketId]
      if (!pred || !prog || teams.home == null || teams.away == null) return

      // For knockout draws, use the user's tiebreaker to determine who advances.
      const winner =
        pred.home_score > pred.away_score ? teams.home :
        pred.away_score > pred.home_score ? teams.away :
        pred.tiebreaker === 'home'        ? teams.home :
        pred.tiebreaker === 'away'        ? teams.away :
        null

      const loser =
        pred.home_score > pred.away_score ? teams.away :
        pred.away_score > pred.home_score ? teams.home :
        pred.tiebreaker === 'home'        ? teams.away :
        pred.tiebreaker === 'away'        ? teams.home :
        null

      if (winner) {
        if (!bracketSlots[prog.nextMatch]) bracketSlots[prog.nextMatch] = {}
        bracketSlots[prog.nextMatch][prog.nextSlot] = winner
      }
      if (loser && prog.loserMatch) {
        if (!bracketSlots[prog.loserMatch]) bracketSlots[prog.loserMatch] = {}
        bracketSlots[prog.loserMatch][prog.loserSlot] = loser
      }
    })
  }

  return result
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Human-readable label for a bracket match ID */
export function matchLabel(id) {
  const labels = {
    R32_M1:'R32 M1', R32_M2:'R32 M2', R32_M3:'R32 M3', R32_M4:'R32 M4',
    R32_M5:'R32 M5', R32_M6:'R32 M6', R32_M7:'R32 M7', R32_M8:'R32 M8',
    R32_M9:'R32 M9', R32_M10:'R32 M10', R32_M11:'R32 M11', R32_M12:'R32 M12',
    R32_M13:'R32 M13', R32_M14:'R32 M14', R32_M15:'R32 M15', R32_M16:'R32 M16',
    R16_M1:'R16 M1', R16_M2:'R16 M2', R16_M3:'R16 M3', R16_M4:'R16 M4',
    R16_M5:'R16 M5', R16_M6:'R16 M6', R16_M7:'R16 M7', R16_M8:'R16 M8',
    QF_M1:'QF 1', QF_M2:'QF 2', QF_M3:'QF 3', QF_M4:'QF 4',
    SF_M1:'Semifinal 1', SF_M2:'Semifinal 2',
    THIRD_PLACE:'3er Puesto', FINAL:'Gran Final',
  }
  return labels[id] ?? id
}

/**
 * Given a bracket match ID, return its stage key (matches the DB `stage` column).
 */
export function matchIdToStage(id) {
  if (id.startsWith('R32'))        return 'round_of_32'
  if (id.startsWith('R16'))        return 'round_of_16'
  if (id.startsWith('QF'))         return 'quarter_final'
  if (id.startsWith('SF'))         return 'semi_final'
  if (id === 'THIRD_PLACE')        return 'third_place'
  if (id === 'FINAL')              return 'final'
  return 'round_of_32'
}

/**
 * Returns a slot descriptor label for display ("1A", "2B", "3rd best", …).
 */
export function slotLabel(slot) {
  if (slot.type === 'winner') return `1º ${slot.group}`
  if (slot.type === 'runner') return `2º ${slot.group}`
  if (slot.type === 'third')  return `3º #${slot.rank + 1}`
  return '?'
}
