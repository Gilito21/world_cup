-- ============================================================
-- Porra Mundial 2026 - Pronósticos globales vs por liga
-- Ejecutar después de 001 y 002
-- ============================================================

-- 1. Añadir league_id a predictions (nullable = pronóstico global)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE;

-- 2. Eliminar la restricción UNIQUE anterior (era sobre user_id, match_id)
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_user_id_match_id_key;

-- 3. Índice único parcial para pronósticos GLOBALES (league_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uix_predictions_global
  ON public.predictions (user_id, match_id)
  WHERE league_id IS NULL;

-- 4. Índice único parcial para pronósticos POR LIGA
CREATE UNIQUE INDEX IF NOT EXISTS uix_predictions_per_league
  ON public.predictions (user_id, match_id, league_id)
  WHERE league_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_predictions_league ON public.predictions (league_id);

-- 5. Añadir prediction_mode a league_members
ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS prediction_mode TEXT NOT NULL DEFAULT 'global'
  CHECK (prediction_mode IN ('global', 'per_league'));

-- ============================================================
-- Actualizar políticas RLS de predictions
-- ============================================================
DROP POLICY IF EXISTS "pronosticos_insercion"     ON public.predictions;
DROP POLICY IF EXISTS "pronosticos_actualizacion" ON public.predictions;

-- Insertar: global siempre OK, por-liga solo si es miembro
CREATE POLICY "pronosticos_insercion" ON public.predictions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (
      league_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.league_members lm
        WHERE lm.league_id = predictions.league_id
          AND lm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "pronosticos_actualizacion" ON public.predictions
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- Actualizar trigger: total_points solo cuenta pronósticos globales
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_match_finished()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    -- Recalcular points_earned en todos los pronósticos del partido
    UPDATE public.predictions
    SET
      points_earned = public.calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
      updated_at    = NOW()
    WHERE match_id = NEW.id;

    -- Actualizar total_points en profiles (SOLO pronósticos globales, league_id IS NULL)
    UPDATE public.profiles p
    SET total_points = (
      SELECT COALESCE(SUM(points_earned), 0)
      FROM public.predictions
      WHERE user_id = p.id AND league_id IS NULL
    )
    WHERE p.id IN (
      SELECT DISTINCT user_id
      FROM public.predictions
      WHERE match_id = NEW.id AND league_id IS NULL
    );
  END IF;

  RETURN NEW;
END;
$$;
