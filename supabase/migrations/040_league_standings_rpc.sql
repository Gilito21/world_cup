-- ============================================================
-- league_standings(p_league_id): ranking de una liga calculado en el servidor
-- ============================================================
-- Antes el cliente (Clasificacion.jsx) se traía TODAS las predicciones de
-- TODOS los miembros (≈2800 filas en ligas grandes) y sumaba en el navegador.
-- En móvil, con el refresco de token de auth en cola al abrir la app, esa
-- query superaba el timeout de 15s de sq() y el ranking se quedaba a 0 para
-- todo el mundo (e incluso cacheaba esos ceros). Movemos el cálculo al
-- servidor: devuelve una fila por miembro (~26) en vez de miles.
--
-- Regla de ámbito (idéntica a compute_user_total_points y al fix del cliente):
--   * miembro per_league CON predicciones en la liga  → puntúa en ámbito liga
--   * resto (global, o per_league sin copiar)          → puntúa en ámbito global
-- Así nunca se duplican puntos: cada miembro se cuenta en un único ámbito.

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
    GROUP BY s.user_id
  ),
  advance_pts AS (
    SELECT s.user_id, COALESCE(SUM(ap.points), 0) AS pts
    FROM scope s
    LEFT JOIN advance_points ap
      ON ap.user_id = s.user_id
     AND ap.league_id IS NOT DISTINCT FROM s.scope_league_id
    GROUP BY s.user_id
  )
  SELECT
    m.user_id,
    (COALESCE(pp.pts, 0) + COALESCE(spp.pts, 0) + COALESCE(adv.pts, 0))::int AS points,
    COALESCE(pp.exact, 0)::int   AS exact,
    COALESCE(pp.correct, 0)::int AS correct,
    COALESCE(pp.total, 0)::int   AS total
  FROM members m
  LEFT JOIN pred_pts    pp  ON pp.user_id  = m.user_id
  LEFT JOIN special_pts spp ON spp.user_id = m.user_id
  LEFT JOIN advance_pts adv ON adv.user_id = m.user_id;
$$;

REVOKE ALL ON FUNCTION public.league_standings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.league_standings(uuid) TO authenticated;
