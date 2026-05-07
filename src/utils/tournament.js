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
 * Round of 32 bracket
 * ───────────────────
 *   Groups A–H supply fixed 1st-vs-2nd cross-group matchups (8 matches).
 *   Groups I–L plus the 8 qualifying 3rd-place teams fill the remaining
 *   8 matches (1st or 2nd vs 3rd-place).  Third-place slots are assigned
 *   by the BRACKET_SCENARIOS table keyed on the sorted combination of the
 *   8 qualifying groups (e.g. "ABCDEFGH").  When no explicit scenario exists
 *   the fallback greedy algorithm respects the no-same-group constraint.
 *
 *   NOTE: Replace BRACKET_SCENARIOS with official FIFA WC 2026 scenario
 *   tables once they are published.
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
// Bracket structure
// ─────────────────
//   Upper half  → SF1:  QF1 (R16_M1/M2) + QF2 (R16_M3/M4)
//   Lower half  → SF2:  QF3 (R16_M5/M6) + QF4 (R16_M7/M8)
//
//   Groups A–H supply fixed 1st-vs-2nd cross-group pairings (R32 M1–M8).
//   Groups I–L + the 8 3rd-place teams fill R32 M9–M16.

export const R32_TEMPLATE = [
  // ── Upper half ───────────────────────────────────────────────────────────
  // QF1 branch
  { id:'R32_M1',  home:{type:'winner',group:'A'}, away:{type:'runner',group:'B'}, nextMatch:'R16_M1', nextSlot:'home' },
  { id:'R32_M2',  home:{type:'winner',group:'C'}, away:{type:'runner',group:'D'}, nextMatch:'R16_M1', nextSlot:'away' },
  { id:'R32_M3',  home:{type:'winner',group:'B'}, away:{type:'runner',group:'A'}, nextMatch:'R16_M2', nextSlot:'home' },
  { id:'R32_M4',  home:{type:'winner',group:'D'}, away:{type:'runner',group:'C'}, nextMatch:'R16_M2', nextSlot:'away' },
  // QF2 branch
  { id:'R32_M5',  home:{type:'winner',group:'E'}, away:{type:'runner',group:'F'}, nextMatch:'R16_M3', nextSlot:'home' },
  { id:'R32_M6',  home:{type:'winner',group:'G'}, away:{type:'runner',group:'H'}, nextMatch:'R16_M3', nextSlot:'away' },
  { id:'R32_M7',  home:{type:'winner',group:'F'}, away:{type:'runner',group:'E'}, nextMatch:'R16_M4', nextSlot:'home' },
  { id:'R32_M8',  home:{type:'winner',group:'H'}, away:{type:'runner',group:'G'}, nextMatch:'R16_M4', nextSlot:'away' },
  // ── Lower half ───────────────────────────────────────────────────────────
  // QF3 branch
  { id:'R32_M9',  home:{type:'winner',group:'I'}, away:{type:'third',rank:0},     nextMatch:'R16_M5', nextSlot:'home' },
  { id:'R32_M10', home:{type:'winner',group:'J'}, away:{type:'third',rank:1},     nextMatch:'R16_M5', nextSlot:'away' },
  { id:'R32_M11', home:{type:'runner',group:'I'}, away:{type:'third',rank:2},     nextMatch:'R16_M6', nextSlot:'home' },
  { id:'R32_M12', home:{type:'runner',group:'J'}, away:{type:'third',rank:3},     nextMatch:'R16_M6', nextSlot:'away' },
  // QF4 branch
  { id:'R32_M13', home:{type:'winner',group:'K'}, away:{type:'third',rank:4},     nextMatch:'R16_M7', nextSlot:'home' },
  { id:'R32_M14', home:{type:'winner',group:'L'}, away:{type:'third',rank:5},     nextMatch:'R16_M7', nextSlot:'away' },
  { id:'R32_M15', home:{type:'runner',group:'K'}, away:{type:'third',rank:6},     nextMatch:'R16_M8', nextSlot:'home' },
  { id:'R32_M16', home:{type:'runner',group:'L'}, away:{type:'third',rank:7},     nextMatch:'R16_M8', nextSlot:'away' },
]

// Full bracket progression tree: maps each match id to where its winner advances.
export const BRACKET_PROGRESSION = {
  // R32 → R16
  R32_M1:  { nextMatch:'R16_M1', nextSlot:'home' },
  R32_M2:  { nextMatch:'R16_M1', nextSlot:'away' },
  R32_M3:  { nextMatch:'R16_M2', nextSlot:'home' },
  R32_M4:  { nextMatch:'R16_M2', nextSlot:'away' },
  R32_M5:  { nextMatch:'R16_M3', nextSlot:'home' },
  R32_M6:  { nextMatch:'R16_M3', nextSlot:'away' },
  R32_M7:  { nextMatch:'R16_M4', nextSlot:'home' },
  R32_M8:  { nextMatch:'R16_M4', nextSlot:'away' },
  R32_M9:  { nextMatch:'R16_M5', nextSlot:'home' },
  R32_M10: { nextMatch:'R16_M5', nextSlot:'away' },
  R32_M11: { nextMatch:'R16_M6', nextSlot:'home' },
  R32_M12: { nextMatch:'R16_M6', nextSlot:'away' },
  R32_M13: { nextMatch:'R16_M7', nextSlot:'home' },
  R32_M14: { nextMatch:'R16_M7', nextSlot:'away' },
  R32_M15: { nextMatch:'R16_M8', nextSlot:'home' },
  R32_M16: { nextMatch:'R16_M8', nextSlot:'away' },
  // R16 → QF
  R16_M1: { nextMatch:'QF_M1', nextSlot:'home' },
  R16_M2: { nextMatch:'QF_M1', nextSlot:'away' },
  R16_M3: { nextMatch:'QF_M2', nextSlot:'home' },
  R16_M4: { nextMatch:'QF_M2', nextSlot:'away' },
  R16_M5: { nextMatch:'QF_M3', nextSlot:'home' },
  R16_M6: { nextMatch:'QF_M3', nextSlot:'away' },
  R16_M7: { nextMatch:'QF_M4', nextSlot:'home' },
  R16_M8: { nextMatch:'QF_M4', nextSlot:'away' },
  // QF → SF
  QF_M1: { nextMatch:'SF_M1', nextSlot:'home' },
  QF_M2: { nextMatch:'SF_M1', nextSlot:'away' },
  QF_M3: { nextMatch:'SF_M2', nextSlot:'home' },
  QF_M4: { nextMatch:'SF_M2', nextSlot:'away' },
  // SF → Final / 3rd-place play-off
  SF_M1: { nextMatch:'FINAL',   nextSlot:'home', loserMatch:'THIRD_PLACE', loserSlot:'home' },
  SF_M2: { nextMatch:'FINAL',   nextSlot:'away', loserMatch:'THIRD_PLACE', loserSlot:'away' },
}

// ─── BRACKET SCENARIOS ───────────────────────────────────────────────────────
//
// Key:   8 qualifying group letters sorted and joined, e.g. 'ABCDEFGH'
// Value: 8-element array of group letters whose 3rd-place team fills
//        rank slots [0..7] in R32_TEMPLATE (slot 0 = best opponent, etc.)
//
// The rank-0 team (best 3rd) always goes to the first available slot it can
// legally fill (no same-group clash).
//
// NOTE: Replace with official FIFA WC 2026 scenario table once published.
//       The fallback greedy algorithm (assignThirdsToSlots) is used when
//       the combination is not in this explicit table.

export const BRACKET_SCENARIOS = {
  // Example scenarios for common combinations (add all 495 once official):
  // All thirds from groups A–H → no same-group conflicts with I–L opponents
  'ABCDEFGH': ['A','B','C','D','E','F','G','H'],
  'ABCDEFGI': ['A','B','C','D','E','F','G','I'],
  'ABCDEFGJ': ['A','B','C','D','E','F','G','J'],
  // Add more scenarios here as needed …
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

// ─── BUILD ROUND OF 32 ───────────────────────────────────────────────────────

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

    const winner =
      m.home_score > m.away_score ? (m.homeTeam ?? m.home_team) :
      m.away_score > m.home_score ? (m.awayTeam ?? m.away_team) :
      null  // draw / not yet decided

    const loser =
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
  const standings  = computeAllStandings(allMatches)
  const qualifiers = getQualifiers(standings)
  const r32        = buildRoundOf32(standings)

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
