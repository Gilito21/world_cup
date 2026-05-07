-- ============================================================
-- Porra Mundial 2026 - Sistema de ligas
-- Ejecutar después de 001_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leagues (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  invite_code  TEXT UNIQUE NOT NULL,
  created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.league_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_members_user  ON public.league_members (user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league ON public.league_members (league_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.leagues        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

-- Ligas: cualquier usuario autenticado puede leer (necesario para buscar por código)
CREATE POLICY "ligas_lectura"
  ON public.leagues FOR SELECT TO authenticated USING (true);

CREATE POLICY "ligas_insercion"
  ON public.leagues FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "ligas_actualizacion"
  ON public.leagues FOR UPDATE USING (auth.uid() = created_by);

-- Miembros: lectura pública autenticada (necesario para clasificación cruzada)
CREATE POLICY "miembros_lectura"
  ON public.league_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "miembros_insercion"
  ON public.league_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "miembros_baja"
  ON public.league_members FOR DELETE USING (auth.uid() = user_id);
