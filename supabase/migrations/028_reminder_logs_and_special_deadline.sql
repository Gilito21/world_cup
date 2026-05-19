-- ============================================================
-- 028 — reminder_logs + deadline check para extras
--
-- Dos cosas:
--
-- 1) Tabla `reminder_logs` que el edge function `send-reminder`
--    ya leía/escribía pero que nunca tuvo migración. Si en prod
--    fue creada a mano, el `CREATE TABLE IF NOT EXISTS` la deja
--    intacta; si no, esto la deja al fin versionada.
--
-- 2) Trigger BEFORE INSERT/UPDATE en `special_predictions` que
--    rechaza escrituras de usuarios autenticados pasada la hora
--    de cierre (1h antes del primer partido). La UI ya lo bloquea
--    en `Extras.jsx`, pero la API de Supabase es accesible con la
--    anon key y un JWT, así que sin trigger un usuario puede saltarse
--    el lock vía REST/SDK. Mismo patrón defensivo que `predictions`
--    (migraciones 004/006/027). Service-role y triggers internos
--    (auth.uid() IS NULL) saltan el check.
-- ============================================================

-- ─── 1. reminder_logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES public.leagues(id)   ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  sent_by         UUID NOT NULL REFERENCES auth.users(id)       ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup
  ON public.reminder_logs (league_id, target_user_id, sent_at DESC);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

-- El cooldown se consulta desde el edge function con el JWT del admin;
-- damos lectura a admins de la liga y al propio target_user_id.
DROP POLICY IF EXISTS "reminder_logs_lectura" ON public.reminder_logs;
CREATE POLICY "reminder_logs_lectura"
  ON public.reminder_logs FOR SELECT
  USING (
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = reminder_logs.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role      = 'admin'
    )
  );

-- INSERT solo desde admin de la liga (service_role bypasea RLS).
DROP POLICY IF EXISTS "reminder_logs_insercion" ON public.reminder_logs;
CREATE POLICY "reminder_logs_insercion"
  ON public.reminder_logs FOR INSERT
  WITH CHECK (
    auth.uid() = sent_by
    AND EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = reminder_logs.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role      = 'admin'
    )
  );

-- ─── 2. Deadline check para special_predictions ──────────────────────────
CREATE OR REPLACE FUNCTION public.check_special_prediction_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_first_match TIMESTAMPTZ;
BEGIN
  -- Mismo escape hatch que predictions: triggers internos y service_role
  -- (auth.uid() IS NULL) no quedan atrapados por el cierre.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MIN(match_date) INTO v_first_match
  FROM public.matches
  WHERE stage = 'group';

  IF v_first_match IS NOT NULL
     AND v_first_match - INTERVAL '1 hour' <= NOW()
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos especiales: el plazo ha cerrado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_special_pred_deadline_insert ON public.special_predictions;
CREATE TRIGGER trg_special_pred_deadline_insert
  BEFORE INSERT ON public.special_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_special_prediction_deadline();

DROP TRIGGER IF EXISTS trg_special_pred_deadline_update ON public.special_predictions;
CREATE TRIGGER trg_special_pred_deadline_update
  BEFORE UPDATE ON public.special_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_special_prediction_deadline();
