-- ============================================================
-- Tabla: prediction_submissions
-- Registra el envío definitivo de pronósticos por usuario/liga.
-- Una vez creado el registro, los pronósticos quedan bloqueados.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prediction_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id    UUID        REFERENCES public.leagues(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un único envío por usuario en cada liga
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_user_league
  ON public.prediction_submissions (user_id, league_id)
  WHERE league_id IS NOT NULL;

-- Un único envío por usuario para pronósticos globales (sin liga)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_user_global
  ON public.prediction_submissions (user_id)
  WHERE league_id IS NULL;

-- ─── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.prediction_submissions ENABLE ROW LEVEL SECURITY;

-- Sólo el propio usuario puede ver su envío
CREATE POLICY "sub_lectura"
  ON public.prediction_submissions FOR SELECT
  USING (auth.uid() = user_id);

-- Sólo el propio usuario puede crear su envío (una vez)
CREATE POLICY "sub_insercion"
  ON public.prediction_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No se permite modificar ni eliminar envíos
-- (no UPDATE / DELETE policies)
