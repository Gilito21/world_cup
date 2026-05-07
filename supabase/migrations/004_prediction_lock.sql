-- ============================================================
-- Porra Mundial 2026 - Bloqueo de pronósticos a nivel de BD
-- Ejecutar después de 001, 002, 003
-- ============================================================
-- El frontend ya bloquea la UI, pero cualquiera podría hacer
-- un INSERT/UPDATE directo contra la API de Supabase.
-- Este trigger lo impide a nivel de base de datos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_prediction_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match_date  TIMESTAMPTZ;
  v_status      TEXT;
BEGIN
  SELECT match_date, status
  INTO v_match_date, v_status
  FROM public.matches
  WHERE id = NEW.match_id;

  -- Bloquear si el partido ya empezó o está en juego/finalizado
  IF v_status IN ('live', 'finished') THEN
    RAISE EXCEPTION 'No se puede pronosticar: el partido ya ha comenzado o finalizado.';
  END IF;

  IF v_match_date <= NOW() THEN
    RAISE EXCEPTION 'No se puede pronosticar: el partido ya ha comenzado.';
  END IF;

  RETURN NEW;
END;
$$;

-- Aplicar tanto en INSERT como en UPDATE
DROP TRIGGER IF EXISTS trg_prediction_deadline_insert ON public.predictions;
CREATE TRIGGER trg_prediction_deadline_insert
  BEFORE INSERT ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_prediction_deadline();

DROP TRIGGER IF EXISTS trg_prediction_deadline_update ON public.predictions;
CREATE TRIGGER trg_prediction_deadline_update
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_prediction_deadline();
