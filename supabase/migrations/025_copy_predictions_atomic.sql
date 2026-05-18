-- ============================================================
-- 025 — copy_predictions_v1: copia atómica de pronósticos entre ligas
--
-- Antes el cliente hacía dos queries separadas:
--   1) DELETE FROM predictions WHERE league_id = dst (o IS NULL)
--   2) INSERT new rows
-- Si (2) fallaba (red, CHECK, FK, lo que sea), el usuario se quedaba
-- sin pronósticos en la liga de destino y sin manera fácil de
-- recuperarlos: los pronósticos de la liga de origen seguían intactos,
-- pero el frontend ya había setError() y dejaba el estado roto.
--
-- Esta RPC envuelve delete + insert en una sola transacción
-- (los functions de Postgres invocados vía PostgREST son atómicos),
-- así que si insert falla, el delete también se revierte y el usuario
-- conserva intactos los pronósticos de la liga de destino.
-- ============================================================

CREATE OR REPLACE FUNCTION public.copy_predictions_v1(
  p_dst_league_id UUID,         -- NULL → "global" (predictions con league_id IS NULL)
  p_rows          JSONB         -- [{match_id, home_score, away_score, tiebreaker?}]
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_count  INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF p_dst_league_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.league_members lm
    WHERE lm.league_id = p_dst_league_id AND lm.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  IF p_dst_league_id IS NULL THEN
    DELETE FROM public.predictions
    WHERE user_id = v_user AND league_id IS NULL;
  ELSE
    DELETE FROM public.predictions
    WHERE user_id = v_user AND league_id = p_dst_league_id;
  END IF;

  INSERT INTO public.predictions
    (user_id, match_id, home_score, away_score, tiebreaker, league_id)
  SELECT
    v_user,
    (elem->>'match_id')::uuid,
    (elem->>'home_score')::int,
    (elem->>'away_score')::int,
    NULLIF(elem->>'tiebreaker', ''),
    p_dst_league_id
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) elem;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.copy_predictions_v1(UUID, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.copy_predictions_v1(UUID, JSONB) TO authenticated;
