-- ============================================================
-- Límite de 40 miembros por liga
-- ============================================================

-- Función que comprueba el aforo antes de cada INSERT en league_members
CREATE OR REPLACE FUNCTION public.check_league_member_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.league_members WHERE league_id = NEW.league_id
  ) >= 40 THEN
    RAISE EXCEPTION 'league_full'
      USING DETAIL = 'Esta liga ya tiene el máximo de 40 participantes.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que ejecuta la función antes de cada inserción
DROP TRIGGER IF EXISTS trg_league_member_limit ON public.league_members;
CREATE TRIGGER trg_league_member_limit
  BEFORE INSERT ON public.league_members
  FOR EACH ROW EXECUTE FUNCTION public.check_league_member_limit();
