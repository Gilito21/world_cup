-- ============================================================
-- 047 — on_match_finished: no puntuar eliminatorias en tiempo real
--
-- El trigger actual puntúa TODOS los pronósticos al terminar un partido,
-- solo comprobando el marcador. Para partidos de eliminatoria esto es
-- incorrecto: si el usuario predijo España-Francia en ese cruce pero
-- en realidad juegan Rep.Checa-Suiza, no debe obtener puntos aunque
-- acierte el marcador 0-1.
--
-- La BD no sabe qué equipos predijo cada usuario para cada cruce (ese
-- dato solo existe en el cascade JS de computePredictedKnockout).
--
-- Solución: el trigger solo puntúa los partidos de fase de grupos
-- (donde los equipos son fijos). Los partidos de eliminatoria los
-- puntúa el job de GitHub Actions (compute-advance-points.js), que
-- calcula qué equipos predijo cada usuario para ese cruce mediante el
-- cascade del cuadro y solo da puntos si los equipos coinciden.
--
-- También añade recalc_total_points_for_users para que el job pueda
-- recalcular total_points en bulk tras puntuar eliminatorias.
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
    -- Solo fase de grupos: el equipo es conocido y la puntuación es directa.
    -- Eliminatorias: las puntúa compute-advance-points.js (GitHub Actions)
    -- porque necesita el cascade del cuadro para saber qué equipos predijo
    -- cada usuario para ese cruce.
    IF NEW.stage = 'group' THEN
      UPDATE public.predictions
      SET
        points_earned = public.calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
        updated_at    = NOW()
      WHERE match_id = NEW.id;
    END IF;

    -- Recalcula total_points (usa los points_earned actuales, incluidos los que
    -- fijó el script para eliminatorias en pasadas anteriores).
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

-- Función auxiliar: recalcula total_points para una lista de usuarios.
-- Llamada desde compute-advance-points.js tras puntuar eliminatorias.
CREATE OR REPLACE FUNCTION public.recalc_total_points_for_users(user_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.profiles p
  SET total_points = (
    SELECT COALESCE(SUM(pts.points_earned), 0)
    FROM public.predictions pts
    WHERE pts.user_id = p.id AND pts.league_id IS NULL
  ) + (
    SELECT COALESCE(SUM(sp.points_earned), 0)
    FROM public.special_predictions sp
    WHERE sp.user_id = p.id AND sp.league_id IS NULL
  )
  WHERE p.id = ANY(user_ids);
END;
$$;
