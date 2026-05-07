-- Cierra pronósticos 30 minutos antes del partido (antes era al inicio)
CREATE OR REPLACE FUNCTION check_prediction_deadline()
RETURNS TRIGGER AS $$
DECLARE
  match_record RECORD;
BEGIN
  SELECT status, match_date INTO match_record
  FROM matches WHERE id = NEW.match_id;

  IF (match_record.status IN ('live', 'finished')) OR
     (match_record.match_date <= NOW() + INTERVAL '30 minutes')
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos de un partido que empieza en menos de 30 minutos';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
