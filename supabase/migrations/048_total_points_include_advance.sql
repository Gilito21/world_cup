-- ============================================================
-- 048 — total_points incluye el bonus de avance de ronda
--
-- Hasta ahora profiles.total_points = predictions + special_predictions
-- (ámbito global, league_id IS NULL). El bonus de avance (advance_points)
-- se sumaba SOLO en el cliente al pintar la clasificación, así que el "PTS"
-- de la cabecera (que lee profiles.total_points directo) quedaba por debajo
-- del total real del ranking.
--
-- Esta migración mete advance_points (ámbito global) dentro de total_points
-- en las dos rutas vivas que lo mantienen: el trigger on_match_finished y
-- recalc_total_points_for_users (que llama el job compute-advance-points.js).
-- Tras esto, el cliente (Clasificacion) deja de sumar el avance aparte para
-- no contarlo doble.
--
-- Las clasificaciones de LIGA (RPC league_standings, 040) calculan su total
-- con su propio JOIN a advance_points de ámbito liga y NO usan total_points,
-- así que no se ven afectadas.
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
$$;

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
  ) + (
    SELECT COALESCE(SUM(ap.points), 0)
    FROM public.advance_points ap
    WHERE ap.user_id = p.id AND ap.league_id IS NULL
  )
  WHERE p.id = ANY(user_ids);
END;
$$;
