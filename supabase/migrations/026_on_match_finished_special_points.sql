-- ============================================================
-- 026 — on_match_finished: no borrar los puntos de extras
--
-- BUG: cuando un partido se actualiza a 'finished' (y cada corrección
-- posterior del marcador), el trigger recalculaba:
--     profiles.total_points = SUM(predictions.points_earned)
-- ignorando special_predictions. Pero resolve_special_question SÍ
-- añade los extras al total (predictions + special_predictions).
--
-- Escenario que rompe:
--   1) Termina el Mundial → admin resuelve el MVP
--      → user X gana +3 pts de extras (profiles.total_points incluye 3)
--   2) Admin corrige el marcador de un partido de cuartos a posteriori
--   3) Trigger on_match_finished dispara → recalcula total_points
--      = SUM(predictions) sin sumar special_predictions
--   4) User X pierde los 3 puntos de extras para siempre
--
-- Fix: el trigger ahora suma predictions GLOBALES + special_predictions
-- GLOBALES, idéntico a lo que hace resolve_special_question. Ambos
-- caminos convergen al mismo total.
-- ============================================================

CREATE OR REPLACE FUNCTION public.on_match_finished()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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
    UPDATE public.predictions
    SET
      points_earned = public.calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
      updated_at    = NOW()
    WHERE match_id = NEW.id;

    UPDATE public.profiles p
    SET total_points = (
      SELECT COALESCE(SUM(points_earned), 0)
      FROM public.predictions
      WHERE user_id = p.id AND league_id IS NULL
    ) + (
      SELECT COALESCE(SUM(points_earned), 0)
      FROM public.special_predictions
      WHERE user_id = p.id AND league_id IS NULL
    )
    WHERE p.id IN (
      SELECT DISTINCT user_id FROM public.predictions
      WHERE match_id = NEW.id AND league_id IS NULL
    );
  END IF;

  RETURN NEW;
END;
$$;
