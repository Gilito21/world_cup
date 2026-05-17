-- ============================================================
-- 024 — Notificar al admin solo cuando el usuario confirma email
--
-- Antes: el cliente llamaba a `notify-new-user` justo después de
-- `auth.signUp()`. Resultado: cualquier signup (incluso con email fake
-- como accenturecarlos@gmailm.com) disparaba el aviso al admin.
--
-- Ahora: la notificación se invoca server-side desde el trigger
-- `sync_email_confirmed` (definido en migración 023) usando pg_net.
-- Solo cuando `auth.users.email_confirmed_at` pasa de NULL a NOT NULL,
-- es decir, cuando el usuario hace click en el enlace de confirmación.
--
-- El anon JWT se guarda en Supabase Vault para no incluirlo en el
-- código del trigger. Si la secret no existe (entornos nuevos sin
-- configurar) la llamada simplemente no se hace — no rompe el flujo
-- de confirmación.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Plantilla: en producción la secret se crea/actualiza con el anon JWT
-- real del proyecto. Este archivo solo deja el placeholder para que
-- una migración fresca sepa que hace falta crear la secret manualmente.
--
-- Ejemplo de comando equivalente (desde dashboard o psql con
-- service_role):
--
--   SELECT vault.create_secret(
--     'eyJhbGciOi...your-anon-jwt-here...',
--     'supabase_anon_key',
--     'Anon JWT used by triggers to call edge functions'
--   );

-- Reescribimos sync_email_confirmed: además de sincronizar la columna
-- `profiles.email_confirmed`, invoca `notify-new-user` cuando el email
-- se confirma por primera vez.
CREATE OR REPLACE FUNCTION public.sync_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, net, pg_catalog
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_anon_key TEXT;
  v_url      TEXT := 'https://jpbbxrlrkavuckghwzpz.supabase.co/functions/v1/notify-new-user';
BEGIN
  IF OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at THEN
    UPDATE public.profiles
    SET email_confirmed = (NEW.email_confirmed_at IS NOT NULL)
    WHERE id = NEW.id;
  END IF;

  -- Solo notificar la PRIMERA vez que el email se confirma (transición
  -- NULL → NOT NULL). Reintentos/edits posteriores no vuelven a notificar.
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = NEW.id;

    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_anon_key'
    LIMIT 1;

    IF v_anon_key IS NOT NULL THEN
      -- Fire-and-forget: pg_net es asíncrono. Si Brevo o el edge function
      -- fallan no afecta a la confirmación del usuario.
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body    := jsonb_build_object(
          'email',    NEW.email,
          'username', COALESCE(v_profile.username, ''),
          'company',  COALESCE(v_profile.company, '')
        ),
        timeout_milliseconds := 5000
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- sync_email_confirmed es función trigger; cerramos el endpoint REST por
-- coherencia para que /rest/v1/rpc/sync_email_confirmed no exista.
REVOKE EXECUTE ON FUNCTION public.sync_email_confirmed() FROM PUBLIC, anon, authenticated;
