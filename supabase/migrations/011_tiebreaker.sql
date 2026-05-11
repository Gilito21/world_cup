-- ============================================================
-- Porra Mundial 2026 – Tiebreaker en eliminatorias
-- ============================================================

-- Quién avanzó/ganó realmente el partido (lo rellena update-results.js).
-- En fase de grupos: ganador al 90min (o null si empate/no jugado).
-- En eliminatorias: el equipo que avanzó (puede incluir prórroga/penaltis).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS winner TEXT CHECK (winner IN ('home', 'away'));

-- Quién pronostica el usuario que avanzará en caso de empate a 90min.
-- Solo relevante para partidos de fase eliminatoria.
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS tiebreaker TEXT CHECK (tiebreaker IN ('home', 'away'));
