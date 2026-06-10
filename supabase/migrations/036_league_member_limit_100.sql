-- ============================================================
-- Subir el límite de miembros por liga de 40 → 100
-- ============================================================
-- Reemplaza la función del trigger creado en 019_league_member_limit.sql.
-- El trigger trg_league_member_limit sigue apuntando a esta función, así que
-- no hace falta recrearlo.

CREATE OR REPLACE FUNCTION public.check_league_member_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.league_members WHERE league_id = NEW.league_id
  ) >= 100 THEN
    RAISE EXCEPTION 'league_full'
      USING DETAIL = 'Esta liga ya tiene el máximo de 100 participantes.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
