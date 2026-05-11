-- ============================================================
-- 013 — Pago para crear liga
--
-- Crear una liga pasa a costar €7,99 mediante Stripe. Las ligas
-- existentes se mantienen gratis (grandfathered).
-- ============================================================

-- ─── 1. Columnas en leagues ───────────────────────────────────────────────
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uix_leagues_payment_intent
  ON public.leagues (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- Grandfather las ligas ya creadas (las 2 actuales): se consideran pagadas
-- en el momento en que se crearon (sin payment_intent_id).
UPDATE public.leagues
SET paid_at = COALESCE(paid_at, created_at)
WHERE paid_at IS NULL;

-- ─── 2. Tabla de pagos pendientes / confirmados ────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_intent_id TEXT UNIQUE NOT NULL,
  league_name       TEXT NOT NULL,
  amount_cents      INTEGER NOT NULL,
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','succeeded','failed','canceled')),
  league_id         UUID REFERENCES public.leagues(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_league_payments_user   ON public.league_payments (user_id);
CREATE INDEX IF NOT EXISTS idx_league_payments_status ON public.league_payments (status);

ALTER TABLE public.league_payments ENABLE ROW LEVEL SECURITY;

-- Solo el dueño puede leer sus pagos. La escritura es exclusiva del
-- service_role (las edge functions).
DROP POLICY IF EXISTS "lp_lectura" ON public.league_payments;
CREATE POLICY "lp_lectura" ON public.league_payments
  FOR SELECT USING (auth.uid() = user_id);

-- updated_at automático
DROP TRIGGER IF EXISTS trg_league_payments_updated ON public.league_payments;
CREATE TRIGGER trg_league_payments_updated
  BEFORE UPDATE ON public.league_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. RLS en leagues: prohibir INSERT directo ──────────────────────────
-- A partir de ahora las ligas nuevas se crean exclusivamente desde la
-- edge function "confirm-league-payment" usando service_role, que
-- bypasea RLS. Cualquier intento desde el cliente con anon/auth key
-- falla. Esto evita que un usuario ponga payment_intent_id falso.
DROP POLICY IF EXISTS "ligas_insercion" ON public.leagues;
CREATE POLICY "ligas_insercion" ON public.leagues
  FOR INSERT WITH CHECK (false);

-- (La policy de SELECT y UPDATE quedan como estaban.)
