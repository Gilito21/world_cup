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
// Fuente: Anexo C del reglamento oficial FIFA World Cup 2026 (las 495 combinaciones).
// Tabla completa: el reparto coincide con el oficial FIFA. El greedy de abajo
// queda como salvaguarda defensiva (no se alcanza con 8 terceros válidos).

export const BRACKET_SCENARIOS = {
  ABCDEFGH: ['C','F','H','E','B','A','G','D'],
  ABCDEFGI: ['D','F','C','I','B','A','G','E'],
  ABCDEFGJ: ['D','F','C','J','B','A','G','E'],
  ABCDEFGK: ['D','F','C','K','B','A','G','E'],
  ABCDEFGL: ['D','F','C','E','B','A','G','L'],
  ABCDEFHI: ['C','F','H','I','B','A','E','D'],
  ABCDEFHJ: ['C','F','H','E','B','A','J','D'],
  ABCDEFHK: ['C','F','H','K','B','A','E','D'],
  ABCDEFHL: ['C','D','H','E','B','A','F','L'],
  ABCDEFIJ: ['D','F','C','I','B','A','J','E'],
  ABCDEFIK: ['D','F','C','K','B','A','E','I'],
  ABCDEFIL: ['D','F','C','I','B','A','E','L'],
  ABCDEFJK: ['D','F','C','K','B','A','J','E'],
  ABCDEFJL: ['D','F','C','E','B','A','J','L'],
  ABCDEFKL: ['D','F','C','K','B','A','E','L'],
  ABCDEGHI: ['C','D','H','I','B','A','G','E'],
  ABCDEGHJ: ['C','D','H','J','B','A','G','E'],
  ABCDEGHK: ['C','D','H','K','B','A','G','E'],
  ABCDEGHL: ['C','D','H','E','B','A','G','L'],
  ABCDEGIJ: ['C','D','E','J','B','A','G','I'],
  ABCDEGIK: ['C','D','E','K','B','A','G','I'],
  ABCDEGIL: ['C','D','E','I','B','A','G','L'],
  ABCDEGJK: ['C','D','E','K','B','A','G','J'],
  ABCDEGJL: ['C','D','E','J','B','A','G','L'],
  ABCDEGKL: ['C','D','E','K','B','A','G','L'],
  ABCDEHIJ: ['C','D','H','I','B','A','J','E'],
  ABCDEHIK: ['C','D','H','K','B','A','E','I'],
  ABCDEHIL: ['C','D','H','I','B','A','E','L'],
  ABCDEHJK: ['C','D','H','K','B','A','J','E'],
  ABCDEHJL: ['C','D','H','E','B','A','J','L'],
  ABCDEHKL: ['C','D','H','K','B','A','E','L'],
  ABCDEIJK: ['C','D','E','K','B','A','J','I'],
  ABCDEIJL: ['C','D','E','I','B','A','J','L'],
  ABCDEIKL: ['C','D','E','K','B','A','I','L'],
  ABCDEJKL: ['C','D','E','K','B','A','J','L'],
  ABCDFGHI: ['C','F','H','I','B','A','G','D'],
  ABCDFGHJ: ['C','F','H','J','B','A','G','D'],
  ABCDFGHK: ['C','F','H','K','B','A','G','D'],
  ABCDFGHL: ['D','F','C','H','B','A','G','L'],
  ABCDFGIJ: ['D','F','C','J','B','A','G','I'],
  ABCDFGIK: ['D','F','C','K','B','A','G','I'],
  ABCDFGIL: ['D','F','C','I','B','A','G','L'],
  ABCDFGJK: ['D','F','C','K','B','A','G','J'],
  ABCDFGJL: ['D','F','C','J','B','A','G','L'],
  ABCDFGKL: ['D','F','C','K','B','A','G','L'],
  ABCDFHIJ: ['C','F','H','I','B','A','J','D'],
  ABCDFHIK: ['C','D','H','K','B','A','F','I'],
  ABCDFHIL: ['C','D','H','I','B','A','F','L'],
  ABCDFHJK: ['C','F','H','K','B','A','J','D'],
  ABCDFHJL: ['D','F','C','H','B','A','J','L'],
  ABCDFHKL: ['C','D','H','K','B','A','F','L'],
  ABCDFIJK: ['D','F','C','K','B','A','J','I'],
  ABCDFIJL: ['D','F','C','I','B','A','J','L'],
  ABCDFIKL: ['D','F','C','K','B','A','I','L'],
  ABCDFJKL: ['D','F','C','K','B','A','J','L'],
  ABCDGHIJ: ['C','D','H','J','B','A','G','I'],
  ABCDGHIK: ['C','D','H','K','B','A','G','I'],
  ABCDGHIL: ['C','D','H','I','B','A','G','L'],
  ABCDGHJK: ['C','D','H','K','B','A','G','J'],
  ABCDGHJL: ['C','D','H','J','B','A','G','L'],
  ABCDGHKL: ['C','D','H','K','B','A','G','L'],
  ABCDGIJK: ['D','G','C','K','B','A','J','I'],
  ABCDGIJL: ['D','G','C','I','B','A','J','L'],
  ABCDGIKL: ['C','D','I','K','B','A','G','L'],
  ABCDGJKL: ['D','G','C','K','B','A','J','L'],
  ABCDHIJK: ['C','D','H','K','B','A','J','I'],
  ABCDHIJL: ['C','D','H','I','B','A','J','L'],
  ABCDHIKL: ['C','D','H','K','B','A','I','L'],
  ABCDHJKL: ['C','D','H','K','B','A','J','L'],
  ABCDIJKL: ['C','D','I','K','B','A','J','L'],
  ABCEFGHI: ['C','F','H','I','B','A','G','E'],
  ABCEFGHJ: ['C','F','H','J','B','A','G','E'],
  ABCEFGHK: ['C','F','H','K','B','A','G','E'],
  ABCEFGHL: ['C','F','H','E','B','A','G','L'],
  ABCEFGIJ: ['C','F','E','J','B','A','G','I'],
  ABCEFGIK: ['C','F','E','K','B','A','G','I'],
  ABCEFGIL: ['C','F','E','I','B','A','G','L'],
  ABCEFGJK: ['C','F','E','K','B','A','G','J'],
  ABCEFGJL: ['C','F','E','J','B','A','G','L'],
  ABCEFGKL: ['C','F','E','K','B','A','G','L'],
  ABCEFHIJ: ['C','F','H','I','B','A','J','E'],
  ABCEFHIK: ['C','F','H','K','B','A','E','I'],
  ABCEFHIL: ['C','F','H','I','B','A','E','L'],
  ABCEFHJK: ['C','F','H','K','B','A','J','E'],
  ABCEFHJL: ['C','F','H','E','B','A','J','L'],
  ABCEFHKL: ['C','F','H','K','B','A','E','L'],
  ABCEFIJK: ['C','F','E','K','B','A','J','I'],
  ABCEFIJL: ['C','F','E','I','B','A','J','L'],
  ABCEFIKL: ['C','F','E','K','B','A','I','L'],
  ABCEFJKL: ['C','F','E','K','B','A','J','L'],
  ABCEGHIJ: ['C','G','H','I','B','A','J','E'],
  ABCEGHIK: ['C','H','E','K','B','A','G','I'],
  ABCEGHIL: ['C','H','E','I','B','A','G','L'],
  ABCEGHJK: ['C','G','H','K','B','A','J','E'],
  ABCEGHJL: ['C','G','H','E','B','A','J','L'],
  ABCEGHKL: ['C','H','E','K','B','A','G','L'],
  ABCEGIJK: ['C','G','E','K','B','A','J','I'],
  ABCEGIJL: ['C','G','E','I','B','A','J','L'],
  ABCEGIKL: ['A','C','E','K','B','I','G','L'],
  ABCEGJKL: ['C','G','E','K','B','A','J','L'],
  ABCEHIJK: ['C','H','E','K','B','A','J','I'],
  ABCEHIJL: ['C','H','E','I','B','A','J','L'],
  ABCEHIKL: ['C','H','E','K','B','A','I','L'],
  ABCEHJKL: ['C','H','E','K','B','A','J','L'],
  ABCEIJKL: ['A','C','E','K','B','I','J','L'],
  ABCFGHIJ: ['C','F','H','J','B','A','G','I'],
  ABCFGHIK: ['C','F','H','K','B','A','G','I'],
  ABCFGHIL: ['C','F','H','I','B','A','G','L'],
  ABCFGHJK: ['C','F','H','K','B','A','G','J'],
  ABCFGHJL: ['C','F','H','J','B','A','G','L'],
  ABCFGHKL: ['C','F','H','K','B','A','G','L'],
  ABCFGIJK: ['F','G','C','K','B','A','J','I'],
  ABCFGIJL: ['F','G','C','I','B','A','J','L'],
  ABCFGIKL: ['C','F','I','K','B','A','G','L'],
  ABCFGJKL: ['F','G','C','K','B','A','J','L'],
  ABCFHIJK: ['C','F','H','K','B','A','J','I'],
  ABCFHIJL: ['C','F','H','I','B','A','J','L'],
  ABCFHIKL: ['C','F','H','K','B','A','I','L'],
  ABCFHJKL: ['C','F','H','K','B','A','J','L'],
  ABCFIJKL: ['C','F','I','K','B','A','J','L'],
  ABCGHIJK: ['C','G','H','K','B','A','J','I'],
  ABCGHIJL: ['C','G','H','I','B','A','J','L'],
  ABCGHIKL: ['C','H','I','K','B','A','G','L'],
  ABCGHJKL: ['C','G','H','K','B','A','J','L'],
  ABCGIJKL: ['C','G','I','K','B','A','J','L'],
  ABCHIJKL: ['C','H','I','K','B','A','J','L'],
  ABDEFGHI: ['D','F','H','I','B','A','G','E'],
  ABDEFGHJ: ['D','F','H','J','B','A','G','E'],
  ABDEFGHK: ['D','F','H','K','B','A','G','E'],
  ABDEFGHL: ['D','F','H','E','B','A','G','L'],
  ABDEFGIJ: ['D','F','E','J','B','A','G','I'],
  ABDEFGIK: ['D','F','E','K','B','A','G','I'],
  ABDEFGIL: ['D','F','E','I','B','A','G','L'],
  ABDEFGJK: ['D','F','E','K','B','A','G','J'],
  ABDEFGJL: ['D','F','E','J','B','A','G','L'],
  ABDEFGKL: ['D','F','E','K','B','A','G','L'],
  ABDEFHIJ: ['D','F','H','I','B','A','J','E'],
  ABDEFHIK: ['D','F','H','K','B','A','E','I'],
  ABDEFHIL: ['D','F','H','I','B','A','E','L'],
  ABDEFHJK: ['D','F','H','K','B','A','J','E'],
  ABDEFHJL: ['D','F','H','E','B','A','J','L'],
  ABDEFHKL: ['D','F','H','K','B','A','E','L'],
  ABDEFIJK: ['D','F','E','K','B','A','J','I'],
  ABDEFIJL: ['D','F','E','I','B','A','J','L'],
  ABDEFIKL: ['D','F','E','K','B','A','I','L'],
  ABDEFJKL: ['D','F','E','K','B','A','J','L'],
  ABDEGHIJ: ['D','G','H','I','B','A','J','E'],
  ABDEGHIK: ['D','H','E','K','B','A','G','I'],
  ABDEGHIL: ['D','H','E','I','B','A','G','L'],
  ABDEGHJK: ['D','G','H','K','B','A','J','E'],
  ABDEGHJL: ['D','G','H','E','B','A','J','L'],
  ABDEGHKL: ['D','H','E','K','B','A','G','L'],
  ABDEGIJK: ['D','G','E','K','B','A','J','I'],
  ABDEGIJL: ['D','G','E','I','B','A','J','L'],
  ABDEGIKL: ['A','D','E','K','B','I','G','L'],
  ABDEGJKL: ['D','G','E','K','B','A','J','L'],
  ABDEHIJK: ['D','H','E','K','B','A','J','I'],
  ABDEHIJL: ['D','H','E','I','B','A','J','L'],
  ABDEHIKL: ['D','H','E','K','B','A','I','L'],
  ABDEHJKL: ['D','H','E','K','B','A','J','L'],
  ABDEIJKL: ['A','D','E','K','B','I','J','L'],
  ABDFGHIJ: ['D','F','H','J','B','A','G','I'],
  ABDFGHIK: ['D','F','H','K','B','A','G','I'],
  ABDFGHIL: ['D','F','H','I','B','A','G','L'],
  ABDFGHJK: ['D','F','H','K','B','A','G','J'],
  ABDFGHJL: ['D','F','H','J','B','A','G','L'],
  ABDFGHKL: ['D','F','H','K','B','A','G','L'],
  ABDFGIJK: ['D','G','F','K','B','A','J','I'],
  ABDFGIJL: ['D','G','F','I','B','A','J','L'],
  ABDFGIKL: ['D','F','I','K','B','A','G','L'],
  ABDFGJKL: ['D','G','F','K','B','A','J','L'],
  ABDFHIJK: ['D','F','H','K','B','A','J','I'],
  ABDFHIJL: ['D','F','H','I','B','A','J','L'],
  ABDFHIKL: ['D','F','H','K','B','A','I','L'],
  ABDFHJKL: ['D','F','H','K','B','A','J','L'],
  ABDFIJKL: ['D','F','I','K','B','A','J','L'],
  ABDGHIJK: ['D','G','H','K','B','A','J','I'],
  ABDGHIJL: ['D','G','H','I','B','A','J','L'],
  ABDGHIKL: ['D','H','I','K','B','A','G','L'],
  ABDGHJKL: ['D','G','H','K','B','A','J','L'],
  ABDGIJKL: ['D','G','I','K','B','A','J','L'],
  ABDHIJKL: ['D','H','I','K','B','A','J','L'],
  ABEFGHIJ: ['F','G','H','I','B','A','J','E'],
  ABEFGHIK: ['F','H','E','K','B','A','G','I'],
  ABEFGHIL: ['F','H','E','I','B','A','G','L'],
  ABEFGHJK: ['F','G','H','K','B','A','J','E'],
  ABEFGHJL: ['F','G','H','E','B','A','J','L'],
  ABEFGHKL: ['F','H','E','K','B','A','G','L'],
  ABEFGIJK: ['F','G','E','K','B','A','J','I'],
  ABEFGIJL: ['F','G','E','I','B','A','J','L'],
  ABEFGIKL: ['A','F','E','K','B','I','G','L'],
  ABEFGJKL: ['F','G','E','K','B','A','J','L'],
  ABEFHIJK: ['F','H','E','K','B','A','J','I'],
  ABEFHIJL: ['F','H','E','I','B','A','J','L'],
  ABEFHIKL: ['F','H','E','K','B','A','I','L'],
  ABEFHJKL: ['F','H','E','K','B','A','J','L'],
  ABEFIJKL: ['A','F','E','K','B','I','J','L'],
  ABEGHIJK: ['A','G','E','K','B','H','J','I'],
  ABEGHIJL: ['A','G','E','I','B','H','J','L'],
  ABEGHIKL: ['A','H','E','K','B','I','G','L'],
  ABEGHJKL: ['A','G','E','K','B','H','J','L'],
  ABEGIJKL: ['A','G','E','K','B','I','J','L'],
  ABEHIJKL: ['A','H','E','K','B','I','J','L'],
  ABFGHIJK: ['F','G','H','K','B','A','J','I'],
  ABFGHIJL: ['F','G','H','I','B','A','J','L'],
  ABFGHIKL: ['A','F','H','K','B','I','G','L'],
  ABFGHJKL: ['F','G','H','K','B','A','J','L'],
  ABFGIJKL: ['F','G','I','K','B','A','J','L'],
  ABFHIJKL: ['A','F','H','K','B','I','J','L'],
  ABGHIJKL: ['A','G','H','K','B','I','J','L'],
  ACDEFGHI: ['C','F','H','I','E','A','G','D'],
  ACDEFGHJ: ['C','F','H','E','J','A','G','D'],
  ACDEFGHK: ['C','F','H','K','E','A','G','D'],
  ACDEFGHL: ['C','D','H','E','F','A','G','L'],
  ACDEFGIJ: ['D','F','C','I','J','A','G','E'],
  ACDEFGIK: ['D','F','C','K','E','A','G','I'],
  ACDEFGIL: ['D','F','C','I','E','A','G','L'],
  ACDEFGJK: ['D','F','C','K','J','A','G','E'],
  ACDEFGJL: ['D','F','C','E','J','A','G','L'],
  ACDEFGKL: ['D','F','C','K','E','A','G','L'],
  ACDEFHIJ: ['C','F','H','I','E','A','J','D'],
  ACDEFHIK: ['C','D','H','K','F','A','E','I'],
  ACDEFHIL: ['C','D','H','I','F','A','E','L'],
  ACDEFHJK: ['C','F','H','K','E','A','J','D'],
  ACDEFHJL: ['C','D','H','E','F','A','J','L'],
  ACDEFHKL: ['C','D','H','K','F','A','E','L'],
  ACDEFIJK: ['D','F','C','K','E','A','J','I'],
  ACDEFIJL: ['D','F','C','I','E','A','J','L'],
  ACDEFIKL: ['D','F','C','K','I','A','E','L'],
  ACDEFJKL: ['D','F','C','K','E','A','J','L'],
  ACDEGHIJ: ['C','D','H','I','J','A','G','E'],
  ACDEGHIK: ['C','D','H','K','E','A','G','I'],
  ACDEGHIL: ['C','D','H','I','E','A','G','L'],
  ACDEGHJK: ['C','D','H','K','J','A','G','E'],
  ACDEGHJL: ['C','D','H','E','J','A','G','L'],
  ACDEGHKL: ['C','D','H','K','E','A','G','L'],
  ACDEGIJK: ['C','D','E','K','J','A','G','I'],
  ACDEGIJL: ['C','D','E','I','J','A','G','L'],
  ACDEGIKL: ['C','D','E','K','I','A','G','L'],
  ACDEGJKL: ['C','D','E','K','J','A','G','L'],
  ACDEHIJK: ['C','D','H','K','E','A','J','I'],
  ACDEHIJL: ['C','D','H','I','E','A','J','L'],
  ACDEHIKL: ['C','D','H','K','I','A','E','L'],
  ACDEHJKL: ['C','D','H','K','E','A','J','L'],
  ACDEIJKL: ['C','D','E','K','I','A','J','L'],
  ACDFGHIJ: ['C','F','H','I','J','A','G','D'],
  ACDFGHIK: ['C','D','H','K','F','A','G','I'],
  ACDFGHIL: ['C','D','H','I','F','A','G','L'],
  ACDFGHJK: ['C','F','H','K','J','A','G','D'],
  ACDFGHJL: ['D','F','C','H','J','A','G','L'],
  ACDFGHKL: ['C','D','H','K','F','A','G','L'],
  ACDFGIJK: ['D','F','C','K','J','A','G','I'],
  ACDFGIJL: ['D','F','C','I','J','A','G','L'],
  ACDFGIKL: ['D','F','C','K','I','A','G','L'],
  ACDFGJKL: ['D','F','C','K','J','A','G','L'],
  ACDFHIJK: ['C','D','H','K','F','A','J','I'],
  ACDFHIJL: ['C','D','H','I','F','A','J','L'],
  ACDFHIKL: ['C','D','H','K','I','A','F','L'],
  ACDFHJKL: ['C','D','H','K','F','A','J','L'],
  ACDFIJKL: ['D','F','C','K','I','A','J','L'],
  ACDGHIJK: ['C','D','H','K','J','A','G','I'],
  ACDGHIJL: ['C','D','H','I','J','A','G','L'],
  ACDGHIKL: ['C','D','H','K','I','A','G','L'],
  ACDGHJKL: ['C','D','H','K','J','A','G','L'],
  ACDGIJKL: ['C','D','I','K','J','A','G','L'],
  ACDHIJKL: ['C','D','H','K','I','A','J','L'],
  ACEFGHIJ: ['C','F','H','I','J','A','G','E'],
  ACEFGHIK: ['C','F','H','K','E','A','G','I'],
  ACEFGHIL: ['C','F','H','I','E','A','G','L'],
  ACEFGHJK: ['C','F','H','K','J','A','G','E'],
  ACEFGHJL: ['C','F','H','E','J','A','G','L'],
  ACEFGHKL: ['C','F','H','K','E','A','G','L'],
  ACEFGIJK: ['C','F','E','K','J','A','G','I'],
  ACEFGIJL: ['C','F','E','I','J','A','G','L'],
  ACEFGIKL: ['C','F','E','K','I','A','G','L'],
  ACEFGJKL: ['C','F','E','K','J','A','G','L'],
  ACEFHIJK: ['C','F','H','K','E','A','J','I'],
  ACEFHIJL: ['C','F','H','I','E','A','J','L'],
  ACEFHIKL: ['C','F','H','K','I','A','E','L'],
  ACEFHJKL: ['C','F','H','K','E','A','J','L'],
  ACEFIJKL: ['C','F','E','K','I','A','J','L'],
  ACEGHIJK: ['C','H','E','K','J','A','G','I'],
  ACEGHIJL: ['C','H','E','I','J','A','G','L'],
  ACEGHIKL: ['C','H','E','K','I','A','G','L'],
  ACEGHJKL: ['C','H','E','K','J','A','G','L'],
  ACEGIJKL: ['C','G','E','K','I','A','J','L'],
  ACEHIJKL: ['C','H','E','K','I','A','J','L'],
  ACFGHIJK: ['C','F','H','K','J','A','G','I'],
  ACFGHIJL: ['C','F','H','I','J','A','G','L'],
  ACFGHIKL: ['C','F','H','K','I','A','G','L'],
  ACFGHJKL: ['C','F','H','K','J','A','G','L'],
  ACFGIJKL: ['C','F','I','K','J','A','G','L'],
  ACFHIJKL: ['C','F','H','K','I','A','J','L'],
  ACGHIJKL: ['C','G','H','K','I','A','J','L'],
  ADEFGHIJ: ['D','F','H','I','J','A','G','E'],
  ADEFGHIK: ['D','F','H','K','E','A','G','I'],
  ADEFGHIL: ['D','F','H','I','E','A','G','L'],
  ADEFGHJK: ['D','F','H','K','J','A','G','E'],
  ADEFGHJL: ['D','F','H','E','J','A','G','L'],
  ADEFGHKL: ['D','F','H','K','E','A','G','L'],
  ADEFGIJK: ['D','F','E','K','J','A','G','I'],
  ADEFGIJL: ['D','F','E','I','J','A','G','L'],
  ADEFGIKL: ['D','F','E','K','I','A','G','L'],
  ADEFGJKL: ['D','F','E','K','J','A','G','L'],
  ADEFHIJK: ['D','F','H','K','E','A','J','I'],
  ADEFHIJL: ['D','F','H','I','E','A','J','L'],
  ADEFHIKL: ['D','F','H','K','I','A','E','L'],
  ADEFHJKL: ['D','F','H','K','E','A','J','L'],
  ADEFIJKL: ['D','F','E','K','I','A','J','L'],
  ADEGHIJK: ['D','H','E','K','J','A','G','I'],
  ADEGHIJL: ['D','H','E','I','J','A','G','L'],
  ADEGHIKL: ['D','H','E','K','I','A','G','L'],
  ADEGHJKL: ['D','H','E','K','J','A','G','L'],
  ADEGIJKL: ['D','G','E','K','I','A','J','L'],
  ADEHIJKL: ['D','H','E','K','I','A','J','L'],
  ADFGHIJK: ['D','F','H','K','J','A','G','I'],
  ADFGHIJL: ['D','F','H','I','J','A','G','L'],
  ADFGHIKL: ['D','F','H','K','I','A','G','L'],
  ADFGHJKL: ['D','F','H','K','J','A','G','L'],
  ADFGIJKL: ['D','F','I','K','J','A','G','L'],
  ADFHIJKL: ['D','F','H','K','I','A','J','L'],
  ADGHIJKL: ['D','G','H','K','I','A','J','L'],
  AEFGHIJK: ['F','H','E','K','J','A','G','I'],
  AEFGHIJL: ['F','H','E','I','J','A','G','L'],
  AEFGHIKL: ['F','H','E','K','I','A','G','L'],
  AEFGHJKL: ['F','H','E','K','J','A','G','L'],
  AEFGIJKL: ['F','G','E','K','I','A','J','L'],
  AEFHIJKL: ['F','H','E','K','I','A','J','L'],
  AEGHIJKL: ['A','G','E','K','I','H','J','L'],
  AFGHIJKL: ['F','G','H','K','I','A','J','L'],
  BCDEFGHI: ['D','F','C','I','B','H','G','E'],
  BCDEFGHJ: ['C','F','H','E','B','J','G','D'],
  BCDEFGHK: ['D','F','C','K','B','H','G','E'],
  BCDEFGHL: ['D','F','C','E','B','H','G','L'],
  BCDEFGIJ: ['D','F','C','I','B','J','G','E'],
  BCDEFGIK: ['D','F','C','K','B','E','G','I'],
  BCDEFGIL: ['D','F','C','I','B','E','G','L'],
  BCDEFGJK: ['D','F','C','K','B','J','G','E'],
  BCDEFGJL: ['D','F','C','E','B','J','G','L'],
  BCDEFGKL: ['D','F','C','K','B','E','G','L'],
  BCDEFHIJ: ['D','F','C','I','B','H','J','E'],
  BCDEFHIK: ['D','F','C','K','B','H','E','I'],
  BCDEFHIL: ['D','F','C','I','B','H','E','L'],
  BCDEFHJK: ['D','F','C','K','B','H','J','E'],
  BCDEFHJL: ['D','F','C','E','B','H','J','L'],
  BCDEFHKL: ['D','F','C','K','B','H','E','L'],
  BCDEFIJK: ['D','F','C','K','B','E','J','I'],
  BCDEFIJL: ['D','F','C','I','B','E','J','L'],
  BCDEFIKL: ['D','F','C','K','B','I','E','L'],
  BCDEFJKL: ['D','F','C','K','B','E','J','L'],
  BCDEGHIJ: ['C','D','H','I','B','J','G','E'],
  BCDEGHIK: ['C','D','E','K','B','H','G','I'],
  BCDEGHIL: ['C','D','E','I','B','H','G','L'],
  BCDEGHJK: ['C','D','H','K','B','J','G','E'],
  BCDEGHJL: ['C','D','H','E','B','J','G','L'],
  BCDEGHKL: ['C','D','E','K','B','H','G','L'],
  BCDEGIJK: ['C','D','E','K','B','J','G','I'],
  BCDEGIJL: ['C','D','E','I','B','J','G','L'],
  BCDEGIKL: ['C','D','E','K','B','I','G','L'],
  BCDEGJKL: ['C','D','E','K','B','J','G','L'],
  BCDEHIJK: ['C','D','E','K','B','H','J','I'],
  BCDEHIJL: ['C','D','E','I','B','H','J','L'],
  BCDEHIKL: ['C','D','E','K','B','H','I','L'],
  BCDEHJKL: ['C','D','E','K','B','H','J','L'],
  BCDEIJKL: ['C','D','E','K','B','I','J','L'],
  BCDFGHIJ: ['C','F','H','I','B','J','G','D'],
  BCDFGHIK: ['D','F','C','K','B','H','G','I'],
  BCDFGHIL: ['D','F','C','I','B','H','G','L'],
  BCDFGHJK: ['C','F','H','K','B','J','G','D'],
  BCDFGHJL: ['D','F','C','J','B','H','G','L'],
  BCDFGHKL: ['D','F','C','K','B','H','G','L'],
  BCDFGIJK: ['D','F','C','K','B','J','G','I'],
  BCDFGIJL: ['D','F','C','I','B','J','G','L'],
  BCDFGIKL: ['D','F','C','K','B','I','G','L'],
  BCDFGJKL: ['D','F','C','K','B','J','G','L'],
  BCDFHIJK: ['D','F','C','K','B','H','J','I'],
  BCDFHIJL: ['D','F','C','I','B','H','J','L'],
  BCDFHIKL: ['D','F','C','K','B','H','I','L'],
  BCDFHJKL: ['D','F','C','K','B','H','J','L'],
  BCDFIJKL: ['D','F','C','K','B','I','J','L'],
  BCDGHIJK: ['C','D','H','K','B','J','G','I'],
  BCDGHIJL: ['C','D','H','I','B','J','G','L'],
  BCDGHIKL: ['C','D','H','K','B','I','G','L'],
  BCDGHJKL: ['C','D','H','K','B','J','G','L'],
  BCDGIJKL: ['C','D','I','K','B','J','G','L'],
  BCDHIJKL: ['C','D','H','K','B','I','J','L'],
  BCEFGHIJ: ['C','F','H','I','B','J','G','E'],
  BCEFGHIK: ['C','F','E','K','B','H','G','I'],
  BCEFGHIL: ['C','F','E','I','B','H','G','L'],
  BCEFGHJK: ['C','F','H','K','B','J','G','E'],
  BCEFGHJL: ['C','F','H','E','B','J','G','L'],
  BCEFGHKL: ['C','F','E','K','B','H','G','L'],
  BCEFGIJK: ['C','F','E','K','B','J','G','I'],
  BCEFGIJL: ['C','F','E','I','B','J','G','L'],
  BCEFGIKL: ['C','F','E','K','B','I','G','L'],
  BCEFGJKL: ['C','F','E','K','B','J','G','L'],
  BCEFHIJK: ['C','F','E','K','B','H','J','I'],
  BCEFHIJL: ['C','F','E','I','B','H','J','L'],
  BCEFHIKL: ['C','F','E','K','B','H','I','L'],
  BCEFHJKL: ['C','F','E','K','B','H','J','L'],
  BCEFIJKL: ['C','F','E','K','B','I','J','L'],
  BCEGHIJK: ['C','G','E','K','B','H','J','I'],
  BCEGHIJL: ['C','G','E','I','B','H','J','L'],
  BCEGHIKL: ['C','H','E','K','B','I','G','L'],
  BCEGHJKL: ['C','G','E','K','B','H','J','L'],
  BCEGIJKL: ['C','G','E','K','B','I','J','L'],
  BCEHIJKL: ['C','H','E','K','B','I','J','L'],
  BCFGHIJK: ['C','F','H','K','B','J','G','I'],
  BCFGHIJL: ['C','F','H','I','B','J','G','L'],
  BCFGHIKL: ['C','F','H','K','B','I','G','L'],
  BCFGHJKL: ['C','F','H','K','B','J','G','L'],
  BCFGIJKL: ['C','F','I','K','B','J','G','L'],
  BCFHIJKL: ['C','F','H','K','B','I','J','L'],
  BCGHIJKL: ['C','G','H','K','B','I','J','L'],
  BDEFGHIJ: ['D','F','H','I','B','J','G','E'],
  BDEFGHIK: ['D','F','E','K','B','H','G','I'],
  BDEFGHIL: ['D','F','E','I','B','H','G','L'],
  BDEFGHJK: ['D','F','H','K','B','J','G','E'],
  BDEFGHJL: ['D','F','H','E','B','J','G','L'],
  BDEFGHKL: ['D','F','E','K','B','H','G','L'],
  BDEFGIJK: ['D','F','E','K','B','J','G','I'],
  BDEFGIJL: ['D','F','E','I','B','J','G','L'],
  BDEFGIKL: ['D','F','E','K','B','I','G','L'],
  BDEFGJKL: ['D','F','E','K','B','J','G','L'],
  BDEFHIJK: ['D','F','E','K','B','H','J','I'],
  BDEFHIJL: ['D','F','E','I','B','H','J','L'],
  BDEFHIKL: ['D','F','E','K','B','H','I','L'],
  BDEFHJKL: ['D','F','E','K','B','H','J','L'],
  BDEFIJKL: ['D','F','E','K','B','I','J','L'],
  BDEGHIJK: ['D','G','E','K','B','H','J','I'],
  BDEGHIJL: ['D','G','E','I','B','H','J','L'],
  BDEGHIKL: ['D','H','E','K','B','I','G','L'],
  BDEGHJKL: ['D','G','E','K','B','H','J','L'],
  BDEGIJKL: ['D','G','E','K','B','I','J','L'],
  BDEHIJKL: ['D','H','E','K','B','I','J','L'],
  BDFGHIJK: ['D','F','H','K','B','J','G','I'],
  BDFGHIJL: ['D','F','H','I','B','J','G','L'],
  BDFGHIKL: ['D','F','H','K','B','I','G','L'],
  BDFGHJKL: ['D','F','H','K','B','J','G','L'],
  BDFGIJKL: ['D','F','I','K','B','J','G','L'],
  BDFHIJKL: ['D','F','H','K','B','I','J','L'],
  BDGHIJKL: ['D','G','H','K','B','I','J','L'],
  BEFGHIJK: ['F','G','E','K','B','H','J','I'],
  BEFGHIJL: ['F','G','E','I','B','H','J','L'],
  BEFGHIKL: ['F','H','E','K','B','I','G','L'],
  BEFGHJKL: ['F','G','E','K','B','H','J','L'],
  BEFGIJKL: ['F','G','E','K','B','I','J','L'],
  BEFHIJKL: ['F','H','E','K','B','I','J','L'],
  BEGHIJKL: ['B','G','E','K','I','H','J','L'],
  BFGHIJKL: ['F','G','H','K','B','I','J','L'],
  CDEFGHIJ: ['D','F','C','I','J','H','G','E'],
  CDEFGHIK: ['D','F','C','K','E','H','G','I'],
  CDEFGHIL: ['D','F','C','I','E','H','G','L'],
  CDEFGHJK: ['D','F','C','K','J','H','G','E'],
  CDEFGHJL: ['D','F','C','E','J','H','G','L'],
  CDEFGHKL: ['D','F','C','K','E','H','G','L'],
  CDEFGIJK: ['D','F','C','K','E','J','G','I'],
  CDEFGIJL: ['D','F','C','I','E','J','G','L'],
  CDEFGIKL: ['D','F','C','K','E','I','G','L'],
  CDEFGJKL: ['D','F','C','K','E','J','G','L'],
  CDEFHIJK: ['D','F','C','K','E','H','J','I'],
  CDEFHIJL: ['D','F','C','I','E','H','J','L'],
  CDEFHIKL: ['D','F','C','K','I','H','E','L'],
  CDEFHJKL: ['D','F','C','K','E','H','J','L'],
  CDEFIJKL: ['D','F','C','K','E','I','J','L'],
  CDEGHIJK: ['C','D','E','K','J','H','G','I'],
  CDEGHIJL: ['C','D','E','I','J','H','G','L'],
  CDEGHIKL: ['C','D','E','K','I','H','G','L'],
  CDEGHJKL: ['C','D','E','K','J','H','G','L'],
  CDEGIJKL: ['C','D','E','K','I','J','G','L'],
  CDEHIJKL: ['C','D','E','K','I','H','J','L'],
  CDFGHIJK: ['D','F','C','K','J','H','G','I'],
  CDFGHIJL: ['D','F','C','I','J','H','G','L'],
  CDFGHIKL: ['D','F','C','K','I','H','G','L'],
  CDFGHJKL: ['D','F','C','K','J','H','G','L'],
  CDFGIJKL: ['D','F','C','K','I','J','G','L'],
  CDFHIJKL: ['D','F','C','K','I','H','J','L'],
  CDGHIJKL: ['C','D','H','K','I','J','G','L'],
  CEFGHIJK: ['C','F','E','K','J','H','G','I'],
  CEFGHIJL: ['C','F','E','I','J','H','G','L'],
  CEFGHIKL: ['C','F','E','K','I','H','G','L'],
  CEFGHJKL: ['C','F','E','K','J','H','G','L'],
  CEFGIJKL: ['C','F','E','K','I','J','G','L'],
  CEFHIJKL: ['C','F','E','K','I','H','J','L'],
  CEGHIJKL: ['C','G','E','K','I','H','J','L'],
  CFGHIJKL: ['C','F','H','K','I','J','G','L'],
  DEFGHIJK: ['D','F','E','K','J','H','G','I'],
  DEFGHIJL: ['D','F','E','I','J','H','G','L'],
  DEFGHIKL: ['D','F','E','K','I','H','G','L'],
  DEFGHJKL: ['D','F','E','K','J','H','G','L'],
  DEFGIJKL: ['D','F','E','K','I','J','G','L'],
  DEFHIJKL: ['D','F','E','K','I','H','J','L'],
  DEGHIJKL: ['D','G','E','K','I','H','J','L'],
  DFGHIJKL: ['D','F','H','K','I','J','G','L'],
  EFGHIJKL: ['F','G','E','K','I','H','J','L'],
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
 * each stage's matches by external_id (the football-data fixture id, which is
 * assigned in FIFA match-number order: R32 = M73…M88 → R32_M1…R32_M16, etc.).
 * Sorting by match_date was wrong: the chronological kickoff order does NOT
 * match the bracket/template order, so it pinned the wrong matchup onto each
 * slot (e.g. showing "1E vs 3rd" as the next match instead of the real fixture).
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

  // ── Step 3: link each DB knockout match to its bracket slot ───────────────
  // The robust key is the REAL teams: once a fixture has actual teams, we know
  // which template slot it is (e.g. España–Austria = 1H vs 2J = R32_M12) by
  // matching against the bracket built from the REAL standings. football-data
  // does NOT order knockout fixtures by bracket/date, so positional pairing
  // pinned the wrong slot onto each match. Positional (by external_id) is kept
  // only as a fallback for fixtures whose real teams aren't known yet (TBD).
  const dbByStage = {}
  for (const m of dbMatches) {
    if (m.stage === 'group') continue
    ;(dbByStage[m.stage] = dbByStage[m.stage] ?? []).push(m)
  }
  // Orden por fecha = fallback posicional para rondas cuyos equipos reales aún
  // no se conocen (R16+). Coincide con el orden con el que los usuarios metieron
  // sus picks (la app siempre mostró los cruces ordenados por fecha), así que
  // leer sus predicciones por fecha las interpreta en el hueco correcto. Las
  // rondas con equipos reales (R32) se emparejan por equipos, no por aquí.
  for (const stage of Object.keys(dbByStage)) {
    dbByStage[stage].sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
  }

  // Real R32 occupants (from actual results) → identify each real fixture's slot.
  const realStandings = filterCompleteGroups(computeAllStandings(dbMatches), dbMatches)
  const realR32       = buildRoundOf32(realStandings)

  // slotToDb: bracketMatchId → { dbMatch, sameOrient }
  // sameOrient = DB home_team is the slot's home seed (else home/away are flipped).
  const slotToDb = {}
  const matchedDbIds = new Set()
  const r32Db = dbByStage['round_of_32'] ?? []

  // 0) Autoridad explícita: si el partido ya tiene bracket_match_id fijado en BD
  // (migración 049 en adelante), ese es su hueco y manda sobre cualquier
  // heurístico. Inmune a que cambie el orden de fechas o los nombres de equipo.
  for (const m of dbMatches) {
    if (m.stage === 'group' || !m.bracket_match_id || slotToDb[m.bracket_match_id]) continue
    const rs = realR32.find(s => s.id === m.bracket_match_id)
    slotToDb[m.bracket_match_id] = { dbMatch: m, sameOrient: rs ? m.home_team === rs.homeTeam : true }
    matchedDbIds.add(m.id)
  }

  for (const slot of realR32) {
    if (slotToDb[slot.id]) continue
    if (!slot.homeTeam || !slot.awayTeam) continue
    const dbMatch = r32Db.find(m =>
      !matchedDbIds.has(m.id) &&
      ((m.home_team === slot.homeTeam && m.away_team === slot.awayTeam) ||
       (m.home_team === slot.awayTeam && m.away_team === slot.homeTeam)))
    if (dbMatch) {
      matchedDbIds.add(dbMatch.id)
      slotToDb[slot.id] = { dbMatch, sameOrient: dbMatch.home_team === slot.homeTeam }
    }
  }
  // Rondas posteriores (R16+) por equipos reales, antes del fallback posicional.
  // football-data va rellenando los equipos reales de cada cruce según se
  // resuelve la ronda anterior, PERO el orden por fecha de esos partidos NO
  // coincide con el orden de huecos del cuadro (p.ej. Canadá-Marruecos es R16_M2
  // aunque sea el primer octavo por fecha). Propagamos los resultados reales por
  // el árbol y casamos cada partido de BD con el hueco cuyos equipos coinciden.
  // Soporta emparejado parcial (un equipo conocido + un TBD); el fallback
  // posicional de abajo solo cubre los cruces aún totalmente TBD. Cuando la ronda
  // se resuelve del todo, reconcile-bracket fija bracket_match_id y manda el paso 0.
  const realFinishedAssigned = dbMatches
    .filter(m => m.stage !== 'group' && m.bracket_match_id && m.home_score != null && m.away_score != null)
    .map(m => ({ ...m, id: m.bracket_match_id }))
  const realLaterSlots = advanceKnockoutRound(realFinishedAssigned)  // { R16_M2:{home,away}, … }

  const slotIsTbd = t => !t || t === 'TBD' || t === 'TBA' || t === 'Por determinar'
  for (const stage of ['round_of_16','quarter_final','semi_final','third_place','final']) {
    for (const bracketId of (STAGE_BRACKET_IDS[stage] ?? [])) {
      if (slotToDb[bracketId]) continue
      const occ = realLaterSlots[bracketId]
      if (!occ || (slotIsTbd(occ.home) && slotIsTbd(occ.away))) continue
      const sh = occ.home, sa = occ.away
      let best = null
      for (const m of (dbByStage[stage] ?? [])) {
        if (matchedDbIds.has(m.id)) continue
        const h = m.home_team, a = m.away_team
        // Misma orientación: home↔home, away↔away (al menos un equipo conocido coincide).
        const sameOk = (slotIsTbd(h) || slotIsTbd(sh) || h === sh) &&
                       (slotIsTbd(a) || slotIsTbd(sa) || a === sa) &&
                       ((!slotIsTbd(h) && h === sh) || (!slotIsTbd(a) && a === sa))
        // Orientación invertida: home↔away.
        const flipOk = (slotIsTbd(h) || slotIsTbd(sa) || h === sa) &&
                       (slotIsTbd(a) || slotIsTbd(sh) || a === sh) &&
                       ((!slotIsTbd(h) && h === sa) || (!slotIsTbd(a) && a === sh))
        if (sameOk) { best = { dbMatch: m, sameOrient: true };  break }
        if (flipOk) { best = { dbMatch: m, sameOrient: false }; break }
      }
      if (best) {
        matchedDbIds.add(best.dbMatch.id)
        slotToDb[bracketId] = best
      }
    }
  }

  // Fallback (posicional, por fecha) SOLO para cruces aún con algún TBD. Un
  // partido con AMBOS equipos reales debe casarse por equipos (arriba) o
  // quedarse sin mapear; nunca por fecha, porque el orden por fecha no coincide
  // con el del cuadro y cruzaría los huecos (bug de octavos: Canadá-Marruecos y
  // Paraguay-Francia se intercambiaron al asignarlos por fecha). Preferimos no
  // mapear (0 / lo resuelve la siguiente pasada) antes que mapear a un hueco
  // equivocado.
  for (const stage of ['round_of_32','round_of_16','quarter_final','semi_final','third_place','final']) {
    const ids       = STAGE_BRACKET_IDS[stage] ?? []
    const remaining = (dbByStage[stage] ?? []).filter(m =>
      !matchedDbIds.has(m.id) && (slotIsTbd(m.home_team) || slotIsTbd(m.away_team)))
    let qi = 0
    for (const bracketId of ids) {
      if (slotToDb[bracketId]) continue
      const dbMatch = remaining[qi++]
      if (!dbMatch) break
      matchedDbIds.add(dbMatch.id)
      slotToDb[bracketId] = { dbMatch, sameOrient: true }
    }
  }

  const result = {}  // dbMatchId → { homeTeam, awayTeam }

  // ── Step 4: propagate teams round by round ────────────────────────────────
  // bracketSlots: bracketMatchId → { home: teamName, away: teamName }
  const bracketSlots = {}

  // Seed R32 from the template (PREDICTED occupants)
  for (const bm of r32Bracket) {
    bracketSlots[bm.id] = { home: bm.homeTeam, away: bm.awayTeam }
  }

  // Process stages in order so each round's winners seed the next round's slots.
  const KNOCKOUT_STAGES = ['round_of_32','round_of_16','quarter_final','semi_final','third_place','final']

  for (const stage of KNOCKOUT_STAGES) {
    for (const bracketId of (STAGE_BRACKET_IDS[stage] ?? [])) {
      const link = slotToDb[bracketId]
      if (!link) continue
      const { dbMatch, sameOrient } = link

      const teams = bracketSlots[bracketId] ?? { home: null, away: null }
      // Orient predicted teams to match the DB row's home/away so "Tu cuadro"
      // lines up with the real fixture shown above it.
      const dbHomeTeam = sameOrient ? teams.home : teams.away
      const dbAwayTeam = sameOrient ? teams.away : teams.home
      result[dbMatch.id] = { homeTeam: dbHomeTeam ?? null, awayTeam: dbAwayTeam ?? null }

      // Resolve the winner of this DB match (from the user's prediction, in DB
      // orientation) and push it into the next bracket slot.
      const pred = userPredMap[dbMatch.id]
      const prog = BRACKET_PROGRESSION[bracketId]
      if (!pred || !prog || teams.home == null || teams.away == null) continue

      const winner =
        pred.home_score > pred.away_score ? dbHomeTeam :
        pred.away_score > pred.home_score ? dbAwayTeam :
        pred.tiebreaker === 'home'        ? dbHomeTeam :
        pred.tiebreaker === 'away'        ? dbAwayTeam :
        null

      const loser =
        pred.home_score > pred.away_score ? dbAwayTeam :
        pred.away_score > pred.home_score ? dbHomeTeam :
        pred.tiebreaker === 'home'        ? dbAwayTeam :
        pred.tiebreaker === 'away'        ? dbHomeTeam :
        null

      if (winner) {
        if (!bracketSlots[prog.nextMatch]) bracketSlots[prog.nextMatch] = {}
        bracketSlots[prog.nextMatch][prog.nextSlot] = winner
      }
      if (loser && prog.loserMatch) {
        if (!bracketSlots[prog.loserMatch]) bracketSlots[prog.loserMatch] = {}
        bracketSlots[prog.loserMatch][prog.loserSlot] = loser
      }
    }
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

// ─── ADVANCEMENT BONUS (puntos por acertar que un equipo pasa de ronda) ───────
//
// Reglas (acumulativo, "por profundidad"):
//   Por cada equipo ganas los puntos de cada ronda alcanzada SIEMPRE que en tu
//   pronóstico ese equipo llegase AL MENOS a esa ronda Y en la realidad la
//   alcance. Cuenta el mínimo entre la profundidad predicha y la real. El lugar
//   del cuadro (rama / rival) es IRRELEVANTE: solo importa hasta qué ronda llega.
//
//   Ronda → +pts (incremental):   R32 +1 · octavos +2 · cuartos +3 · semis +4
//                                 · final +5 · campeón +6   (acumulado campeón = 21)

export const ADVANCE_STAGES = ['round_of_32','round_of_16','quarter_final','semi_final','final','champion']
// rank = índice + 1 ; puntos incrementales por ronda alcanzada
export const ADVANCE_POINTS = [1, 2, 3, 4, 5, 6]
const ADVANCE_RANK = { round_of_32:1, round_of_16:2, quarter_final:3, semi_final:4, final:5 }

function advIsTbd(name) {
  return !name || name === 'TBD' || name === 'TBA' || name === 'Por determinar'
}

/**
 * Profundidad REAL alcanzada por cada equipo, a partir de los resultados.
 * Devuelve { reach: {team: rank}, decided: {team: {rank: ISOdate}} }.
 *   rank 1=R32 (clasificó de grupos) … 5=final, 6=campeón.
 * "Decided" = fecha del partido que confirmó esa ronda (R32 = fin de la fase de
 * grupos; rondas siguientes = el partido de la ronda anterior que ganó).
 */
export function actualTeamReach(allMatches) {
  const reach = {}, decided = {}
  const set = (team, rank, dateISO) => {
    if (advIsTbd(team)) return
    if (!reach[team] || rank > reach[team]) reach[team] = rank
    decided[team] = decided[team] || {}
    if (!decided[team][rank]) decided[team][rank] = dateISO ?? null
  }

  // rank 1 (clasificar a R32): ser participante real de un partido de R32.
  const groupDates = allMatches
    .filter(m => m.stage === 'group' && m.status === 'finished')
    .map(m => m.match_date).sort()
  const r32Decided = groupDates.length ? groupDates[groupDates.length - 1] : null
  for (const m of allMatches) {
    if (m.stage !== 'round_of_32') continue
    set(m.home_team, 1, r32Decided ?? m.match_date)
    set(m.away_team, 1, r32Decided ?? m.match_date)
  }

  // ranks 2..6: el ganador de un partido de rango r alcanza el rango r+1.
  for (const m of allMatches) {
    const r = ADVANCE_RANK[m.stage]
    if (!r) continue
    if (m.status !== 'finished' || m.home_score == null || m.away_score == null) continue
    const w = m.winner === 'home' ? m.home_team
            : m.winner === 'away' ? m.away_team
            : m.home_score > m.away_score ? m.home_team
            : m.away_score > m.home_score ? m.away_team
            : null
    set(w, r + 1, m.match_date)
  }
  return { reach, decided }
}

/**
 * Profundidad PREDICHA por el usuario para cada equipo, a partir de su bracket
 * (reusa computePredictedKnockout). Devuelve { team: rank }.
 */
export function predictedTeamReach(allMatches, userPredMap) {
  const ko = computePredictedKnockout(allMatches, userPredMap)
  const byId = Object.fromEntries(allMatches.map(m => [m.id, m]))
  const reach = {}
  for (const [mid, teams] of Object.entries(ko)) {
    const r = ADVANCE_RANK[byId[mid]?.stage]
    if (!r) continue
    for (const tm of [teams.homeTeam, teams.awayTeam]) {
      if (!advIsTbd(tm) && (!reach[tm] || r > reach[tm])) reach[tm] = r
    }
  }
  // Campeón predicho = ganador predicho de la final.
  const finalMatch = allMatches.find(m => m.stage === 'final')
  if (finalMatch) {
    const t = ko[finalMatch.id], p = userPredMap[finalMatch.id]
    if (t && p && !advIsTbd(t.homeTeam) && !advIsTbd(t.awayTeam)) {
      const champ = p.home_score > p.away_score ? t.homeTeam
                  : p.away_score > p.home_score ? t.awayTeam
                  : p.tiebreaker === 'home' ? t.homeTeam
                  : p.tiebreaker === 'away' ? t.awayTeam
                  : null
      if (!advIsTbd(champ)) reach[champ] = 6
    }
  }
  return reach
}

/**
 * Filas de bonus de avance para UN ámbito (un conjunto de pronósticos).
 * Una fila por (equipo, ronda) conseguida = min(predicho, real) acumulado.
 * Devuelve [{ team, stage, points, decided_on }].
 */
export function computeAdvanceRows(allMatches, userPredMap) {
  const pred = predictedTeamReach(allMatches, userPredMap)
  const { reach: actual, decided } = actualTeamReach(allMatches)
  const rows = []
  for (const team of Object.keys(actual)) {
    const credited = Math.min(pred[team] ?? 0, actual[team] ?? 0)
    for (let r = 1; r <= credited; r++) {
      rows.push({
        team,
        stage: ADVANCE_STAGES[r - 1],
        points: ADVANCE_POINTS[r - 1],
        decided_on: decided[team]?.[r] ?? null,
      })
    }
  }
  return rows
}
