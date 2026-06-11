-- ============================================================
-- Bonus de avance: puntos por acertar que un equipo pasa de ronda
-- ============================================================
-- Se calcula fuera de la BD (job Node `compute-advance-points.js`, que reusa el
-- bracket predicho en JS) y se persiste aquí. Ámbito = igual que predictions:
--   league_id NULL  → pronósticos globales (cuentan en global + ligas en modo global)
--   league_id = X   → pronósticos de esa liga (modo per_league)
-- Una fila por (usuario, ámbito, equipo, ronda) conseguida.

CREATE TABLE IF NOT EXISTS public.advance_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  league_id   UUID          REFERENCES public.leagues(id) ON DELETE CASCADE,  -- NULL = global
  team        TEXT    NOT NULL,
  stage       TEXT    NOT NULL CHECK (stage IN (
                'round_of_32','round_of_16','quarter_final','semi_final','final','champion'
              )),
  points      INTEGER NOT NULL,
  decided_on  TIMESTAMPTZ,           -- fecha del partido que confirmó esa ronda (para el digest diario)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advance_points_scope    ON public.advance_points (user_id, league_id);
CREATE INDEX IF NOT EXISTS idx_advance_points_league   ON public.advance_points (league_id);
CREATE INDEX IF NOT EXISTS idx_advance_points_decided  ON public.advance_points (decided_on);

ALTER TABLE public.advance_points ENABLE ROW LEVEL SECURITY;

-- Lectura abierta (como predictions) para poder pintar clasificaciones.
-- La escritura la hace solo el job con service_role (que salta RLS); no hay
-- políticas de INSERT/UPDATE/DELETE para clientes a propósito.
DROP POLICY IF EXISTS advance_points_lectura ON public.advance_points;
CREATE POLICY advance_points_lectura ON public.advance_points FOR SELECT USING (true);
