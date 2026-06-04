-- ============================================================
-- 034 — Registro de recordatorios de "intent de liga abandonado"
--
-- El script `scripts/send-league-intent-reminders.js` corre cada
-- 30 min y manda un email a usuarios que iniciaron el flujo de
-- pago de liga (`league_payments`) pero nunca lo terminaron en
-- éxito. Esta tabla evita reenvíos: una fila por user_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.league_intent_reminders (
  user_id  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.league_intent_reminders ENABLE ROW LEVEL SECURITY;
