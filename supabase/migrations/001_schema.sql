-- ============================================================
-- Porra Mundial 2026 - Schema inicial
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Tabla de perfiles (extiende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username       TEXT UNIQUE NOT NULL,
  total_points   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de partidos
CREATE TABLE IF NOT EXISTS public.matches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id    INTEGER UNIQUE,                -- ID en football-data.org
  home_team      TEXT NOT NULL,
  away_team      TEXT NOT NULL,
  home_flag      TEXT DEFAULT '🏳️',            -- Emoji de bandera
  away_flag      TEXT DEFAULT '🏳️',
  match_date     TIMESTAMPTZ NOT NULL,
  stage          TEXT NOT NULL CHECK (stage IN (
                   'group','round_of_32','round_of_16',
                   'quarter_final','semi_final','third_place','final'
                 )),
  group_name     TEXT,                          -- 'A','B'... solo en group stage
  venue          TEXT,
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished')),
  home_score     INTEGER,
  away_score     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de pronósticos
CREATE TABLE IF NOT EXISTS public.predictions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id       UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_score     INTEGER NOT NULL CHECK (home_score >= 0),
  away_score     INTEGER NOT NULL CHECK (away_score >= 0),
  points_earned  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_matches_date      ON public.matches (match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status    ON public.matches (status);
CREATE INDEX IF NOT EXISTS idx_predictions_user  ON public.predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON public.predictions (match_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- profiles: todo el mundo puede leer, solo tú modificas el tuyo
CREATE POLICY "perfiles_lectura"    ON public.profiles FOR SELECT USING (true);
CREATE POLICY "perfiles_insercion"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "perfiles_actualizacion" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- matches: lectura pública, escritura solo service_role (scripts)
CREATE POLICY "partidos_lectura"    ON public.matches FOR SELECT USING (true);

-- predictions: lectura pública (para clasificación), escritura propia
CREATE POLICY "pronosticos_lectura"    ON public.predictions FOR SELECT USING (true);
CREATE POLICY "pronosticos_insercion"  ON public.predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pronosticos_actualizacion" ON public.predictions FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- Función: calcular puntos de un pronóstico
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_points(
  pred_home INTEGER,
  pred_away INTEGER,
  real_home INTEGER,
  real_away INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Resultado exacto → 3 puntos
  IF pred_home = real_home AND pred_away = real_away THEN
    RETURN 3;
  -- Ganador/empate correcto → 1 punto
  ELSIF
    (pred_home > pred_away AND real_home > real_away) OR
    (pred_home < pred_away AND real_home < real_away) OR
    (pred_home = pred_away AND real_home = real_away)
  THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- ============================================================
-- Trigger: actualizar puntos cuando un partido termina
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_match_finished()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo actuar cuando el partido pasa a 'finished' con resultado
  IF NEW.status = 'finished'
     AND NEW.home_score IS NOT NULL
     AND NEW.away_score IS NOT NULL
     AND (OLD.status <> 'finished' OR OLD.home_score IS DISTINCT FROM NEW.home_score OR OLD.away_score IS DISTINCT FROM NEW.away_score)
  THEN
    -- Recalcular puntos de todos los pronósticos de este partido
    UPDATE public.predictions
    SET
      points_earned = public.calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
      updated_at    = NOW()
    WHERE match_id = NEW.id;

    -- Recalcular total de puntos en perfiles afectados
    UPDATE public.profiles p
    SET
      total_points = (
        SELECT COALESCE(SUM(points_earned), 0)
        FROM public.predictions
        WHERE user_id = p.id
      )
    WHERE p.id IN (
      SELECT user_id FROM public.predictions WHERE match_id = NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_finished ON public.matches;
CREATE TRIGGER trg_match_finished
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.on_match_finished();

-- Trigger: updated_at automático en predictions
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_predictions_updated ON public.predictions;
CREATE TRIGGER trg_predictions_updated
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_matches_updated ON public.matches;
CREATE TRIGGER trg_matches_updated
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
