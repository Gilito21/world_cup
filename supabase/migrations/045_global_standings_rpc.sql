-- ============================================================
-- global_standings(): exactos/aciertos del ranking GLOBAL en servidor
-- ============================================================
-- Clasificacion.jsx (loadGlobal) construía el ranking global solo con
-- profiles.total_points (+ advance_points) y hardcodeaba el desglose a
-- { exact: 0, correct: 0 }. Por eso las columnas EXACTOS y CORRECT.
-- salían a 0 para todo el mundo aunque tuvieran puntos.
--
-- El ámbito global es el mismo que mantiene on_match_finished (026) y
-- compute_user_total_points: predicciones con league_id IS NULL,
-- contando points_earned = 3 (exacto) y = 1 (acierto).
--
-- Igual que league_standings (040), calculamos en servidor para no
-- traernos miles de predicciones al navegador: una fila por usuario.

CREATE OR REPLACE FUNCTION public.global_standings()
RETURNS TABLE (
  user_id  uuid,
  exact    integer,
  correct  integer,
  total    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    pr.user_id,
    COALESCE(SUM((pr.points_earned = 3)::int), 0)::int AS exact,
    COALESCE(SUM((pr.points_earned = 1)::int), 0)::int AS correct,
    COUNT(pr.id)::int                                  AS total
  FROM predictions pr
  WHERE pr.league_id IS NULL
  GROUP BY pr.user_id;
$$;

REVOKE ALL ON FUNCTION public.global_standings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_standings() TO authenticated;
