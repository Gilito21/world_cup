ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company TEXT;

-- Actualiza el trigger para incluir company desde los metadatos
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, company)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'company'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
