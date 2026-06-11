-- ============================================================
-- 039 — Ampliar el cutoff de envío/edición a 30 min antes
--
-- Antes: el cierre global (pronósticos de partido y extras) estaba
-- fijado a 1 hora antes del primer partido de grupos, tanto en el
-- frontend como en los triggers BEFORE INSERT/UPDATE en BD
-- (`check_prediction_global_cutoff` mig. 035 y
-- `check_special_prediction_deadline` mig. 028).
--
-- Ahora: se amplía a 30 minutos antes para dar más margen. Solo
-- cambia el INTERVAL; el resto de la lógica (escape para
-- auth.uid() IS NULL = service_role/triggers internos) se mantiene.
-- ============================================================

-- Pronósticos de partido
CREATE OR REPLACE FUNCTION public.check_prediction_global_cutoff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_first_match TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MIN(match_date) INTO v_first_match
  FROM public.matches
  WHERE stage = 'group';

  IF v_first_match IS NOT NULL
     AND v_first_match - INTERVAL '30 minutes' <= NOW()
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos: el plazo ha cerrado (30 min antes del primer partido)';
  END IF;

  RETURN NEW;
END;
$$;

-- Pronósticos especiales (extras)
CREATE OR REPLACE FUNCTION public.check_special_prediction_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_first_match TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MIN(match_date) INTO v_first_match
  FROM public.matches
  WHERE stage = 'group';

  IF v_first_match IS NOT NULL
     AND v_first_match - INTERVAL '30 minutes' <= NOW()
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos especiales: el plazo ha cerrado';
  END IF;

  RETURN NEW;
END;
$$;
