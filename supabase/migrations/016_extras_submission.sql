-- ============================================================
-- Distingue envíos de partidos vs. extras en prediction_submissions.
-- Antes existía un único registro por usuario+liga; ahora puede haber
-- uno para 'matches' y otro para 'extras'.
-- ============================================================

-- 1. Añadir columna source (default 'matches' para registros existentes)
ALTER TABLE public.prediction_submissions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'matches'
  CHECK (source IN ('matches', 'extras'));

-- 2. Reemplazar índices únicos para incluir source
DROP INDEX IF EXISTS idx_sub_user_league;
DROP INDEX IF EXISTS idx_sub_user_global;

CREATE UNIQUE INDEX idx_sub_user_league
  ON public.prediction_submissions (user_id, league_id, source)
  WHERE league_id IS NOT NULL;

CREATE UNIQUE INDEX idx_sub_user_global
  ON public.prediction_submissions (user_id, source)
  WHERE league_id IS NULL;
