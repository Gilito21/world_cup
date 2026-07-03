-- ============================================================
-- 053 — Puntuación de eliminatorias en tiempo real (trigger)
-- ============================================================
-- Hasta ahora el marcador de los partidos KO solo se puntuaba en la Action
-- horaria (compute-advance-points.js), dejando hasta ~1-3h sin puntos tras
-- acabar un partido. Movemos ese cálculo al trigger on_match_finished para que
-- sea instantáneo, sin meter el motor JS (tournament.js) en la edge function.
--
-- Cómo: el cruce que CADA usuario pronosticó para cada partido KO (qué dos
-- equipos esperaba en ese hueco del cuadro) solo depende de sus predicciones
-- (bloqueadas), no de la realidad → se puede precomputar. El job Node lo
-- calcula con tournament.js y lo cachea en `predicted_ko_cruces`. El trigger,
-- al terminar un KO, compara ese cruce con los equipos reales del partido y,
-- si coinciden, puntúa con calculate_points (misma regla team-aware).
--
-- La Action horaria (compute-advance-points) sigue como red de seguridad y es
-- quien refresca esta tabla y los advance_points.

-- ── Tabla cache de cruces pronosticados ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.predicted_ko_cruces (
  user_id    uuid NOT NULL,
  match_id   uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  league_id  uuid,
  home_team  text,
  away_team  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un cruce por (usuario, partido, ámbito). NULLS NOT DISTINCT trata league_id
-- NULL (global) como un único valor para el upsert (Postgres 15+).
CREATE UNIQUE INDEX IF NOT EXISTS predicted_ko_cruces_uniq
  ON public.predicted_ko_cruces (user_id, match_id, league_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS predicted_ko_cruces_match_idx
  ON public.predicted_ko_cruces (match_id);

-- Tabla interna: solo la usan el trigger (SECURITY DEFINER) y el job (service
-- role). El frontend calcula el cuadro en cliente, no la necesita. RLS activada
-- sin políticas ⇒ nadie autenticado/anon la lee; service_role la salta.
ALTER TABLE public.predicted_ko_cruces ENABLE ROW LEVEL SECURITY;

-- ── Trigger: añade puntuación de eliminatorias ────────────────────────────────
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
      -- Grupos: el equipo es conocido y la puntuación es directa.
      UPDATE public.predictions
      SET
        points_earned = public.calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
        updated_at    = NOW()
      WHERE match_id = NEW.id;
    ELSE
      -- Eliminatorias: puntúa solo si el cruce pronosticado (equipos que el
      -- usuario esperaba en este hueco, cacheados en predicted_ko_cruces)
      -- coincide con los equipos reales del partido. Misma regla team-aware
      -- que compute-advance-points.js.
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
