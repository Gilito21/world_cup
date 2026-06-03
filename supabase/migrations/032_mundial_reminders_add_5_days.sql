-- ============================================================
-- 032 — mundial_reminders: añadir tipo '5_days'
--
-- El script `scripts/send-reminders.js` ahora dispara una tercera
-- ventana 5 días antes del pitido inicial. Esta migración:
--   1. Garantiza la existencia de la tabla (la 018 nunca llegó a
--      aplicarse en remoto, así que es defensiva).
--   2. Refresca el CHECK de `type` para permitir 5_days/2_days/1_day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mundial_reminders (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.mundial_reminders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mundial_reminders
  DROP CONSTRAINT IF EXISTS mundial_reminders_type_check;

ALTER TABLE public.mundial_reminders
  ADD CONSTRAINT mundial_reminders_type_check
  CHECK (type IN ('5_days', '2_days', '1_day'));
