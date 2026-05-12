-- Registra los recordatorios pre-Mundial enviados por usuario
-- para no reenviar el mismo tipo de aviso más de una vez.
CREATE TABLE IF NOT EXISTS public.mundial_reminders (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('2_days', '1_day')),
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.mundial_reminders ENABLE ROW LEVEL SECURITY;
