-- ============================================================
-- Porra Mundial 2026 - Recordatorios por email
-- ============================================================

-- Opt-out por usuario
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_reminders BOOLEAN NOT NULL DEFAULT true;

-- Registro de recordatorios enviados (evita duplicados)
CREATE TABLE IF NOT EXISTS public.prediction_reminders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id   UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_reminders_user  ON public.prediction_reminders (user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_match ON public.prediction_reminders (match_id);

-- RLS: solo el propio usuario y service_role pueden leer/escribir
ALTER TABLE public.prediction_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminders_lectura_propia"
  ON public.prediction_reminders FOR SELECT
  USING (auth.uid() = user_id);

-- El script de cron usa service_role key, que bypasea RLS automáticamente
