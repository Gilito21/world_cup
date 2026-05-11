-- ============================================================
-- 014 — Founder bypass
--
-- Permite crear ligas sin pasar por el paywall a usuarios marcados
-- como founder. La edge function `create-league-free` valida el flag
-- antes de crear la liga; ningún cliente puede activarlo sin pasar
-- por service_role.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT false;

-- Bootstrap: el creador del producto crea ligas gratis.
UPDATE public.profiles
SET is_founder = true
WHERE id IN (
  SELECT id FROM auth.users
  WHERE LOWER(email) = LOWER('Jpelaez@bluebullpartners.com')
);

-- RLS: is_founder es de solo lectura para los propios usuarios
-- (la policy existente "perfiles_actualizacion" permite UPDATE del
-- propio perfil, pero el cliente no debe poder elevarse a founder).
-- Bloqueamos vía trigger: cualquier UPDATE que cambie is_founder
-- desde una sesión no service_role lo revierte silenciosamente.
CREATE OR REPLACE FUNCTION public.prevent_founder_self_promotion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_founder IS DISTINCT FROM OLD.is_founder
     AND auth.role() <> 'service_role' THEN
    NEW.is_founder := OLD.is_founder;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_lock_founder ON public.profiles;
CREATE TRIGGER trg_profiles_lock_founder
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_founder_self_promotion();
