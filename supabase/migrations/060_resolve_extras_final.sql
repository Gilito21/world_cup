-- ============================================================
-- 060 — Cierre del torneo: resolución final de los 3 extras (20-jul-2026)
-- ============================================================
-- El Mundial 2026 ha terminado (campeón: España 1-0 a Argentina). Resolvemos
-- las tres preguntas especiales con los datos finales de las actas de ESPN
-- (FIFA.WORLD, 104 partidos jugados):
--
--   • mbappe_vs_lamine (2 pts, exacto): Mbappé 9 goles vs Lamine 1 → gana MBAPPÉ.
--   • top_scorer / MVP (3 pts, exacto): premio oficial al mejor jugador → RODRI.
--   • total_cards_weighted (4 pts): 267🟨 + 15🟥 → 267 + 2×15 = 297 ponderadas.
--
-- REGLA DE TARJETAS — distinta a las otras dos: no es acierto exacto sino
-- "el que más se acerca gana", y decidido POR LIGA (petición del organizador).
-- Como un mismo usuario puede acabar más cerca en una liga y no en otra, el
-- premio de tarjetas NO puede vivir en el único points_earned global de la fila.
-- Solución en dos planos, sin doble conteo:
--   1) Clasificación de LIGA: league_standings calcula el bonus de tarjetas
--      inline, por liga (más cercano entre los miembros de esa liga), y EXCLUYE
--      total_cards_weighted de su suma de special_predictions.
--   2) Total GLOBAL (profiles.total_points / ranking global): el bonus va al más
--      cercano a nivel global vía special_predictions.points_earned.
-- ============================================================

-- ─── 1. Respuestas correctas + marcador final en la descripción ───────────────
UPDATE public.special_questions
SET correct_choice = 'mbappe',
    resolved_at    = NOW(),
    description     = 'Solo se cuentan los goles oficialmente registrados por la FIFA en el Mundial 2026. Final: 🇫🇷 Mbappé 9 · 🇪🇸 Lamine 1 → gana Mbappé.',
    updated_at      = NOW()
WHERE key = 'mbappe_vs_lamine';

UPDATE public.special_questions
SET correct_player = 'Rodri',
    resolved_at    = NOW(),
    updated_at     = NOW()
WHERE key = 'top_scorer';

UPDATE public.special_questions
SET correct_number = 297,
    resolved_at    = NOW(),
    description     = 'Suma de tarjetas amarillas más el doble de las rojas en todo el torneo (amarillas + 2 × rojas). Final: 🟨 267 · 🟥 15 → 297. Gana quien más se acerque en cada liga.',
    updated_at      = NOW()
WHERE key = 'total_cards_weighted';

-- ─── 2. points_earned de mbappe_vs_lamine (exacto, 2 pts) ─────────────────────
UPDATE public.special_predictions
SET points_earned = CASE WHEN answer_choice = 'mbappe' THEN 2 ELSE 0 END,
    updated_at    = NOW()
WHERE question_key = 'mbappe_vs_lamine';

-- ─── 3. points_earned de top_scorer / MVP (exacto, 3 pts) ─────────────────────
UPDATE public.special_predictions
SET points_earned = CASE
      WHEN LOWER(TRIM(answer_player)) = 'rodri' THEN 3 ELSE 0 END,
    updated_at    = NOW()
WHERE question_key = 'top_scorer';

-- ─── 4. points_earned de tarjetas — ÁMBITO GLOBAL (más cercano global) ────────
-- Solo alimenta profiles.total_points / ranking global. La clasificación de liga
-- lo recalcula aparte en league_standings (ver 6) y NO lee este valor.
WITH gmin AS (
  SELECT MIN(ABS(answer_number - 297)) AS d
  FROM public.special_predictions
  WHERE question_key = 'total_cards_weighted'
    AND league_id IS NULL
    AND answer_number IS NOT NULL
)
UPDATE public.special_predictions
SET points_earned = CASE
      WHEN answer_number IS NOT NULL
       AND ABS(answer_number - 297) = (SELECT d FROM gmin)
      THEN 4 ELSE 0 END,
    updated_at    = NOW()
WHERE question_key = 'total_cards_weighted'
  AND league_id IS NULL;

-- ─── 5. Recalcula total_points global = predicciones + extras + avance ────────
-- Misma fórmula que on_match_finished / recalc_total_points_for_users (048).
UPDATE public.profiles p
SET total_points = (
  SELECT COALESCE(SUM(points_earned), 0)
  FROM public.predictions
  WHERE user_id = p.id AND league_id IS NULL
) + (
  SELECT COALESCE(SUM(points_earned), 0)
  FROM public.special_predictions
  WHERE user_id = p.id AND league_id IS NULL
) + (
  SELECT COALESCE(SUM(points), 0)
  FROM public.advance_points
  WHERE user_id = p.id AND league_id IS NULL
);

-- ─── 6. league_standings: bonus de tarjetas por liga (más cercano de la liga) ──
-- Idéntica a 040 salvo: (a) special_pts excluye total_cards_weighted;
-- (b) nuevo CTE cards_pts que da los puntos de la pregunta al/los miembro(s) de
-- la liga con la predicción más cercana a correct_number. Si la pregunta no está
-- resuelta (correct_number IS NULL) nadie recibe bonus.
CREATE OR REPLACE FUNCTION public.league_standings(p_league_id uuid)
RETURNS TABLE (
  user_id  uuid,
  points   integer,
  exact    integer,
  correct  integer,
  total    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH members AS (
    SELECT lm.user_id,
           COALESCE(lm.prediction_mode, 'global') AS mode
    FROM league_members lm
    WHERE lm.league_id = p_league_id
  ),
  has_perliga AS (
    SELECT DISTINCT pr.user_id
    FROM predictions pr
    JOIN members m ON m.user_id = pr.user_id
    WHERE pr.league_id = p_league_id
  ),
  scope AS (
    SELECT m.user_id,
           CASE
             WHEN m.mode = 'per_league' AND hp.user_id IS NOT NULL THEN p_league_id
             ELSE NULL
           END AS scope_league_id
    FROM members m
    LEFT JOIN has_perliga hp ON hp.user_id = m.user_id
  ),
  pred_pts AS (
    SELECT s.user_id,
           COALESCE(SUM(pr.points_earned), 0)          AS pts,
           COALESCE(SUM((pr.points_earned = 3)::int), 0) AS exact,
           COALESCE(SUM((pr.points_earned = 1)::int), 0) AS correct,
           COUNT(pr.id)                                 AS total
    FROM scope s
    LEFT JOIN predictions pr
      ON pr.user_id = s.user_id
     AND pr.league_id IS NOT DISTINCT FROM s.scope_league_id
    GROUP BY s.user_id
  ),
  special_pts AS (
    SELECT s.user_id, COALESCE(SUM(sp.points_earned), 0) AS pts
    FROM scope s
    LEFT JOIN special_predictions sp
      ON sp.user_id = s.user_id
     AND sp.league_id IS NOT DISTINCT FROM s.scope_league_id
     AND sp.question_key <> 'total_cards_weighted'
    GROUP BY s.user_id
  ),
  advance_pts AS (
    SELECT s.user_id, COALESCE(SUM(ap.points), 0) AS pts
    FROM scope s
    LEFT JOIN advance_points ap
      ON ap.user_id = s.user_id
     AND ap.league_id IS NOT DISTINCT FROM s.scope_league_id
    GROUP BY s.user_id
  ),
  cards_q AS (
    SELECT correct_number, points
    FROM special_questions
    WHERE key = 'total_cards_weighted'
  ),
  cards_ans AS (
    SELECT s.user_id,
           ABS(sp.answer_number - (SELECT correct_number FROM cards_q)) AS dist
    FROM scope s
    JOIN special_predictions sp
      ON sp.user_id = s.user_id
     AND sp.league_id IS NOT DISTINCT FROM s.scope_league_id
     AND sp.question_key = 'total_cards_weighted'
     AND sp.answer_number IS NOT NULL
    WHERE (SELECT correct_number FROM cards_q) IS NOT NULL
  ),
  cards_pts AS (
    SELECT ca.user_id,
           CASE WHEN ca.dist = (SELECT MIN(dist) FROM cards_ans)
                THEN (SELECT points FROM cards_q) ELSE 0 END AS pts
    FROM cards_ans ca
  )
  SELECT
    m.user_id,
    (COALESCE(pp.pts, 0) + COALESCE(spp.pts, 0) + COALESCE(adv.pts, 0) + COALESCE(cp.pts, 0))::int AS points,
    COALESCE(pp.exact, 0)::int   AS exact,
    COALESCE(pp.correct, 0)::int AS correct,
    COALESCE(pp.total, 0)::int   AS total
  FROM members m
  LEFT JOIN pred_pts    pp  ON pp.user_id  = m.user_id
  LEFT JOIN special_pts spp ON spp.user_id = m.user_id
  LEFT JOIN advance_pts adv ON adv.user_id = m.user_id
  LEFT JOIN cards_pts   cp  ON cp.user_id  = m.user_id;
$$;

REVOKE ALL ON FUNCTION public.league_standings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.league_standings(uuid) TO authenticated;
