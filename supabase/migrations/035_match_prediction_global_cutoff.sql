-- ============================================================
-- 035 — Cierre global para pronósticos de partido
--
-- Modelo nuevo de la porra: se puede editar (y reenviar) hasta el
-- cutoff global = 1 hora antes del primer partido de grupos. A partir
-- de ahí no se edita ni se crean pronósticos nuevos. "Enviar" pasa a
-- ser una marca de "he terminado" que ya NO bloquea; el único cierre
-- duro es este cutoff.
--
-- Hasta ahora la BD solo tenía `check_prediction_deadline` (cierre
-- per-match a 30 min). El cierre global solo se aplicaba en el frontend
-- (Pronosticos.jsx: isPastCutoff), saltable vía la API REST con la anon
-- key + un JWT. Añadimos el trigger server-side, mismo patrón que el de
-- extras (mig. 028 `check_special_prediction_deadline`).
--
-- Escape para auth.uid() IS NULL: las escrituras del sistema
-- (service_role en update-results, triggers internos como
-- on_match_finished) no quedan atrapadas por el cierre. Igual que
-- mig. 027 / 028.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_prediction_global_cutoff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_first_match TIMESTAMPTZ;
BEGIN
  -- Triggers internos y service_role (auth.uid() IS NULL) no quedan
  -- atrapados por el cierre.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MIN(match_date) INTO v_first_match
  FROM public.matches
  WHERE stage = 'group';

  IF v_first_match IS NOT NULL
     AND v_first_match - INTERVAL '1 hour' <= NOW()
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos: el plazo ha cerrado (1h antes del primer partido)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pred_global_cutoff_insert ON public.predictions;
CREATE TRIGGER trg_pred_global_cutoff_insert
  BEFORE INSERT ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_prediction_global_cutoff();

DROP TRIGGER IF EXISTS trg_pred_global_cutoff_update ON public.predictions;
CREATE TRIGGER trg_pred_global_cutoff_update
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_prediction_global_cutoff();
