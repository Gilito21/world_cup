-- ============================================================
-- 023 — Solo mostrar usuarios con email confirmado
--
-- El trigger `on_auth_user_created` crea un row en `public.profiles`
-- en el momento del registro (AFTER INSERT ON auth.users), antes de
-- que el usuario haya confirmado el email. Esto significaba que
-- registros con email inventado/typo (ej. accenturecarlos@gmailm.com)
-- aparecían en la clasificación pública.
--
-- En vez de modificar el flujo (lo que rompería contadores y FK),
-- añadimos una columna `email_confirmed` en `profiles` sincronizada
-- con `auth.users.email_confirmed_at` vía dos triggers (INSERT y
-- UPDATE). Las queries del frontend filtran por `email_confirmed=true`.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: marca como confirmados a los usuarios cuyo email_confirmed_at
-- ya está populado en auth.users.
UPDATE public.profiles p
SET email_confirmed = (u.email_confirmed_at IS NOT NULL)
FROM auth.users u
WHERE u.id = p.id;

-- Trigger en INSERT (signup): el perfil entra con email_confirmed
-- según el estado del auth.users en ese momento. La mayoría de
-- signups llegan con email_confirmed_at NULL → entra como false.
-- Excepción: admin auto-confirma → entra como true directamente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, company, email_confirmed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'company'), ''),
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger en UPDATE de auth.users: cuando el email_confirmed_at pasa
-- de NULL a NOT NULL, marcamos el profile como confirmado. La función
-- final (con la llamada a notify-new-user) está en la migración 024.
CREATE OR REPLACE FUNCTION public.sync_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at THEN
    UPDATE public.profiles
    SET email_confirmed = (NEW.email_confirmed_at IS NOT NULL)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_email_confirmed ON auth.users;
CREATE TRIGGER trg_sync_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at)
  EXECUTE FUNCTION public.sync_email_confirmed();

-- Índice parcial: las queries de clasificación filtran por TRUE,
-- así que el índice solo necesita confirmar.
CREATE INDEX IF NOT EXISTS idx_profiles_email_confirmed_true
  ON public.profiles (id)
  WHERE email_confirmed = TRUE;
