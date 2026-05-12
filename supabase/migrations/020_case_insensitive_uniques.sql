-- ============================================================
-- Unicidad case-insensitive para username y nombre de liga
-- ============================================================

-- Username: sustituir el UNIQUE estándar (case-sensitive) por un índice
-- funcional sobre lower(username) para que "Juan" y "juan" colisionen.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS uix_profiles_username_lower
  ON public.profiles (lower(username));

-- Liga: no había ninguna restricción de unicidad en el nombre.
-- Dos ligas no pueden llamarse igual (ignorando mayúsculas/espacios extremos).
CREATE UNIQUE INDEX IF NOT EXISTS uix_leagues_name_lower
  ON public.leagues (lower(trim(name)));
