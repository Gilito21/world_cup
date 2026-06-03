-- ============================================================
-- 031 — Empresas: matching case-insensitive (VISA = Visa = visa)
--
-- Estrategia "merge inteligente":
--   1. Para cada grupo de empresas con el mismo nombre en minúsculas,
--      elegimos como variante canónica la más usada (desempate por
--      orden alfabético) y normalizamos las filas que no la tengan.
--      Hoy esto solo afecta a `VISA` (1 user) → `Visa` (7 users).
--   2. Función `canonical_company_name(text)`: dado un input, busca
--      en profiles si ya existe una empresa con el mismo nombre en
--      minúsculas y devuelve el casing existente. Si no existe,
--      devuelve el input trimeado. Así, futuros usuarios que escriban
--      "visa" o "VISA" se guardarán como "Visa".
--   3. Trigger BEFORE INSERT OR UPDATE en `profiles.company` que
--      aplica la canonicalización automáticamente.
-- ============================================================

-- 1. Backfill: unificar duplicados case-insensitive existentes.
WITH counts AS (
  SELECT company, count(*)::int AS cnt
  FROM public.profiles
  WHERE company IS NOT NULL AND trim(company) <> ''
  GROUP BY company
),
winners AS (
  SELECT lower(company) AS key,
         (array_agg(company ORDER BY cnt DESC, company ASC))[1] AS winner
  FROM counts
  GROUP BY lower(company)
)
UPDATE public.profiles p
SET company = w.winner
FROM winners w
WHERE p.company IS NOT NULL
  AND lower(p.company) = w.key
  AND p.company IS DISTINCT FROM w.winner;

-- 2. Función canonical_company_name.
CREATE OR REPLACE FUNCTION public.canonical_company_name(input text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH trimmed AS (
    SELECT NULLIF(TRIM(input), '') AS v
  )
  SELECT COALESCE(
    (
      SELECT p.company
      FROM public.profiles p, trimmed t
      WHERE t.v IS NOT NULL
        AND p.company IS NOT NULL
        AND lower(p.company) = lower(t.v)
      GROUP BY p.company
      ORDER BY count(*) DESC, p.company ASC
      LIMIT 1
    ),
    (SELECT v FROM trimmed)
  );
$$;

-- 3. Trigger BEFORE INSERT OR UPDATE en profiles.
CREATE OR REPLACE FUNCTION public.normalize_profile_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.company IS NOT NULL THEN
    NEW.company := public.canonical_company_name(NEW.company);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profile_company ON public.profiles;
CREATE TRIGGER trg_normalize_profile_company
  BEFORE INSERT OR UPDATE OF company ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_company();
