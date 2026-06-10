-- ============================================================
-- Los nuevos miembros se unen en modo GLOBAL (pronóstico compartido)
-- ============================================================
-- El flujo de alta (Auth.jsx / LeagueContext) inserta en league_members sin
-- especificar prediction_mode, así que toma el DEFAULT de la columna. Cambiamos
-- ese default de 'per_league' a 'global' para que quien se une nuevo comparta
-- su pronóstico global por defecto. No afecta a los miembros existentes.

ALTER TABLE public.league_members
  ALTER COLUMN prediction_mode SET DEFAULT 'global';
