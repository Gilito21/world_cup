-- ============================================================
-- 033 — mundial_reminders: swap '5_days' → '7_days'
--
-- Cambio de criterio: el primer recordatorio se dispara 7 días
-- antes del kickoff (no 5). Reescribimos el CHECK. No hay filas
-- con '5_days' en producción (la ventana aún no se habría disparado).
-- ============================================================

ALTER TABLE public.mundial_reminders
  DROP CONSTRAINT IF EXISTS mundial_reminders_type_check;

ALTER TABLE public.mundial_reminders
  ADD CONSTRAINT mundial_reminders_type_check
  CHECK (type IN ('7_days', '2_days', '1_day'));
