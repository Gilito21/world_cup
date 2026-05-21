-- Añade configuración de bote y premios a las ligas
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS entry_fee   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS prize_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
