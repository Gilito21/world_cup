-- ============================================================
-- 054 — Guarda anti-cache-vacía en la puntuación KO del trigger
-- ============================================================
-- La 053 puntúa las eliminatorias en on_match_finished usando la cache
-- predicted_ko_cruces. Si esa cache aún no está poblada para un partido
-- (p.ej. justo tras desplegar, antes de que el job Node la rellene, o para un
-- usuario nuevo), el trigger pondría 0 a todos por no encontrar cruce.
--
-- Guarda: solo puntúa el KO si existe AL MENOS un cruce cacheado para ese
-- partido. Si no hay ninguno, no toca nada y lo deja a la Action horaria
-- (compute-advance-points.js), que puntúa con su propia lógica y refresca la
-- cache. Así nunca se ponen 0 por una cache vacía.

CREATE OR REPLACE FUNCTION public.on_match_finished()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.status = 'finished'
     AND NEW.home_score IS NOT NULL
     AND NEW.away_score IS NOT NULL
     AND (
       OLD.status <> 'finished'
       OR OLD.home_score IS DISTINCT FROM NEW.home_score
       OR OLD.away_score IS DISTINCT FROM NEW.away_score
     )
  THEN
    IF NEW.stage = 'group' THEN
      UPDATE public.predictions
      SET
        points_earned = public.calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
        updated_at    = NOW()
      WHERE match_id = NEW.id;
    ELSIF EXISTS (SELECT 1 FROM public.predicted_ko_cruces WHERE match_id = NEW.id) THEN
      -- Eliminatorias: puntúa solo si el cruce pronosticado coincide con el real.
      UPDATE public.predictions p
      SET points_earned = CASE
            WHEN c.home_team = NEW.home_team AND c.away_team = NEW.away_team
              THEN public.calculate_points(p.home_score, p.away_score, NEW.home_score, NEW.away_score)
            ELSE 0 END,
          updated_at = NOW()
      FROM public.predicted_ko_cruces c
      WHERE p.match_id = NEW.id
        AND c.match_id = NEW.id
        AND c.user_id = p.user_id
        AND c.league_id IS NOT DISTINCT FROM p.league_id;

      -- Pronósticos sin cruce cacheado (no se puede verificar el cruce) → 0.
      UPDATE public.predictions p
      SET points_earned = 0, updated_at = NOW()
      WHERE p.match_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM public.predicted_ko_cruces c
          WHERE c.match_id = NEW.id
            AND c.user_id = p.user_id
            AND c.league_id IS NOT DISTINCT FROM p.league_id
        );
    END IF;

    -- Recalcula total_points = predicciones + extras + bonus de avance (ámbito
    -- global, league_id IS NULL).
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
    )
    WHERE p.id IN (
      SELECT DISTINCT user_id FROM public.predictions
      WHERE match_id = NEW.id AND league_id IS NULL
    );
  END IF;

  RETURN NEW;
END;
$function$;
