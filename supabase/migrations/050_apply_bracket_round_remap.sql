-- ============================================================
-- 050 — apply_bracket_round_remap(p_map): remapeo atómico de una ronda KO
--
-- Recibe el mapeo ya calculado en JS (motor del bracket) para UNA ronda:
--   p_map = [{ "slot":"R16_M1", "target":"<uuid>", "source":"<uuid>", "swap":false }, ...]
-- y, en una sola transacción:
--   1) fija matches.bracket_match_id = slot en cada target (el partido real),
--   2) recoloca las predicciones: el pick que el usuario metió en `source`
--      (el partido que veía por orden de fecha) pasa al `target` (su hueco real),
--      invirtiendo home/away + tiebreaker si swap=true (orientación distinta).
--
-- Idempotencia: la decide el llamador (solo invoca para rondas cuyo
-- bracket_match_id aún es NULL). 'source' se fotografía antes de escribir
-- para que la permutación no se pise a sí misma.
--
-- Solo service_role lo ejecuta (lo llama el job de reconciliación); se revoca
-- a anon/authenticated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_bracket_round_remap(p_map jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- 1) Fijar el hueco del cuadro en cada partido real de la ronda.
  UPDATE public.matches m
  SET bracket_match_id = e.slot
  FROM jsonb_to_recordset(p_map) AS e(slot text, target uuid, source uuid, swap boolean)
  WHERE m.id = e.target;

  -- Foto de los picks de origen (antes de escribir, para no pisar la permutación).
  CREATE TEMP TABLE _src_snap ON COMMIT DROP AS
  SELECT pr.user_id, pr.league_id, pr.match_id, pr.home_score, pr.away_score, pr.tiebreaker
  FROM public.predictions pr
  WHERE pr.match_id IN (SELECT (e->>'source')::uuid FROM jsonb_array_elements(p_map) e);

  -- 2a) Actualizar targets que ya tienen fila.
  UPDATE public.predictions p
  SET home_score = CASE WHEN e.swap THEN s.away_score ELSE s.home_score END,
      away_score = CASE WHEN e.swap THEN s.home_score ELSE s.away_score END,
      tiebreaker = CASE WHEN e.swap
                        THEN (CASE s.tiebreaker WHEN 'home' THEN 'away' WHEN 'away' THEN 'home' ELSE s.tiebreaker END)
                        ELSE s.tiebreaker END,
      points_earned = NULL,
      updated_at = now()
  FROM jsonb_to_recordset(p_map) AS e(slot text, target uuid, source uuid, swap boolean)
  JOIN _src_snap s ON s.match_id = e.source
  WHERE p.match_id = e.target AND p.user_id = s.user_id AND p.league_id IS NOT DISTINCT FROM s.league_id;

  -- 2b) Insertar targets para (usuario, ámbito) con pick de origen pero sin fila destino.
  INSERT INTO public.predictions (user_id, match_id, league_id, home_score, away_score, tiebreaker)
  SELECT s.user_id, e.target, s.league_id,
         CASE WHEN e.swap THEN s.away_score ELSE s.home_score END,
         CASE WHEN e.swap THEN s.home_score ELSE s.away_score END,
         CASE WHEN e.swap
              THEN (CASE s.tiebreaker WHEN 'home' THEN 'away' WHEN 'away' THEN 'home' ELSE s.tiebreaker END)
              ELSE s.tiebreaker END
  FROM jsonb_to_recordset(p_map) AS e(slot text, target uuid, source uuid, swap boolean)
  JOIN _src_snap s ON s.match_id = e.source
  WHERE NOT EXISTS (
    SELECT 1 FROM public.predictions p
    WHERE p.match_id = e.target AND p.user_id = s.user_id AND p.league_id IS NOT DISTINCT FROM s.league_id
  );

  -- 2c) Borrar targets cuyo origen no tenía pick (el hueco debe quedar vacío).
  DELETE FROM public.predictions p
  USING jsonb_to_recordset(p_map) AS e(slot text, target uuid, source uuid, swap boolean)
  WHERE p.match_id = e.target
    AND NOT EXISTS (
      SELECT 1 FROM _src_snap s
      WHERE s.match_id = e.source AND s.user_id = p.user_id AND s.league_id IS NOT DISTINCT FROM p.league_id
    );

  DROP TABLE IF EXISTS _src_snap;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_bracket_round_remap(jsonb) FROM PUBLIC, anon, authenticated;
