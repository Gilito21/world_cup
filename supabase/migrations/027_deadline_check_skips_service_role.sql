-- ============================================================
-- 027 — check_prediction_deadline solo bloquea a usuarios autenticados
--
-- BUG descubierto vía smoke test del flujo "partido finaliza":
-- update-results.js (cron) marca un partido como 'finished' con
-- service_role. Eso dispara el trigger AFTER UPDATE en matches
-- (on_match_finished), que internamente hace:
--
--     UPDATE predictions
--     SET points_earned = calculate_points(...), updated_at = NOW()
--     WHERE match_id = NEW.id;
--
-- Ese UPDATE dispara BEFORE UPDATE en predictions →
-- check_prediction_deadline lee matches.status (que es 'finished',
-- justo lo que acabamos de poner) y aborta con:
--
--   "No se pueden modificar pronósticos de un partido que
--    empieza en menos de 30 minutos"
--
-- La transacción se revierte → el partido nunca llega a quedar
-- finalizado → update-results.js fallaría una y otra vez durante
-- todo el Mundial. Lo habríamos descubierto el 11 jun a las 21:00.
--
-- FIX: el deadline-check fue pensado para escrituras de USUARIO
-- (modificar el pronóstico cuando el partido está a punto de
-- empezar). Las escrituras internas del sistema (service_role o
-- triggers en cascada) tienen auth.uid() IS NULL, así que cuando
-- detectamos ese caso saltamos el check. Los usuarios autenticados
-- siguen sometidos al cierre de 30 min.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_prediction_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  match_record RECORD;
BEGIN
  -- Saltamos para callers system-side (service_role, triggers internos).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, match_date INTO match_record
  FROM public.matches WHERE id = NEW.match_id;

  IF (match_record.status IN ('live', 'finished')) OR
     (match_record.match_date <= NOW() + INTERVAL '30 minutes')
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos de un partido que empieza en menos de 30 minutos';
  END IF;

  RETURN NEW;
END;
$$;
