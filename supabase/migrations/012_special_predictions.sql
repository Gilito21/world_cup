-- ============================================================
-- Porra Mundial 2026 — Pronósticos especiales (preguntas extra)
--
-- Se cierran al mismo cutoff que los pronósticos normales (1h antes
-- del primer partido). El admin marca las respuestas correctas al
-- final del torneo y se llama a resolve_special_question().
-- ============================================================

-- ─── 1. Catálogo de preguntas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.special_questions (
  key            TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('choice','player','number')),
  prompt         TEXT NOT NULL,
  description    TEXT,
  options        JSONB,         -- para kind='choice': [{value,label,emoji?}]
  points         INTEGER NOT NULL CHECK (points > 0),
  -- respuesta correcta (admin la rellena al final)
  correct_choice TEXT,
  correct_player TEXT,
  correct_number INTEGER,
  resolved_at    TIMESTAMPTZ,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Tabla de pronósticos especiales ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.special_predictions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id     UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  question_key  TEXT NOT NULL REFERENCES public.special_questions(key) ON DELETE CASCADE,
  answer_choice TEXT,
  answer_player TEXT,
  answer_number INTEGER,
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mismo patrón de unicidad que predictions: parcial por NULL vs valor.
CREATE UNIQUE INDEX IF NOT EXISTS uix_special_pred_global
  ON public.special_predictions (user_id, question_key)
  WHERE league_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uix_special_pred_per_league
  ON public.special_predictions (user_id, league_id, question_key)
  WHERE league_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_special_pred_user     ON public.special_predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_special_pred_league   ON public.special_predictions (league_id);
CREATE INDEX IF NOT EXISTS idx_special_pred_question ON public.special_predictions (question_key);

-- ─── 3. Row Level Security ────────────────────────────────────────────────
ALTER TABLE public.special_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_predictions ENABLE ROW LEVEL SECURITY;

-- special_questions: lectura pública, escritura solo service_role.
DROP POLICY IF EXISTS "sq_lectura" ON public.special_questions;
CREATE POLICY "sq_lectura" ON public.special_questions FOR SELECT USING (true);

-- special_predictions: lectura pública (para clasificación cruzada),
-- escritura solo del propio usuario, respetando pertenencia a liga.
DROP POLICY IF EXISTS "sp_lectura"        ON public.special_predictions;
DROP POLICY IF EXISTS "sp_insercion"      ON public.special_predictions;
DROP POLICY IF EXISTS "sp_actualizacion"  ON public.special_predictions;

CREATE POLICY "sp_lectura"
  ON public.special_predictions FOR SELECT USING (true);

CREATE POLICY "sp_insercion"
  ON public.special_predictions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND (
      league_id IS NULL OR EXISTS (
        SELECT 1 FROM public.league_members lm
        WHERE lm.league_id = special_predictions.league_id
          AND lm.user_id   = auth.uid()
      )
    )
  );

CREATE POLICY "sp_actualizacion"
  ON public.special_predictions FOR UPDATE USING (auth.uid() = user_id);

-- ─── 4. Triggers updated_at ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_special_pred_updated ON public.special_predictions;
CREATE TRIGGER trg_special_pred_updated
  BEFORE UPDATE ON public.special_predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_special_q_updated ON public.special_questions;
CREATE TRIGGER trg_special_q_updated
  BEFORE UPDATE ON public.special_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5. Función para resolver una pregunta al final del torneo ─────────────
-- Recalcula points_earned para todos los pronósticos de la pregunta y
-- añade los puntos al total_points en profiles (solo pronósticos globales).
CREATE OR REPLACE FUNCTION public.resolve_special_question(p_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  q       public.special_questions%ROWTYPE;
  updated INTEGER;
BEGIN
  SELECT * INTO q FROM public.special_questions WHERE key = p_key;
  IF q.key IS NULL THEN
    RAISE EXCEPTION 'Unknown special question: %', p_key;
  END IF;

  UPDATE public.special_predictions sp
  SET points_earned = CASE
    WHEN q.kind = 'choice'
      AND q.correct_choice IS NOT NULL
      AND sp.answer_choice = q.correct_choice
      THEN q.points
    WHEN q.kind = 'player'
      AND q.correct_player IS NOT NULL
      AND LOWER(TRIM(sp.answer_player)) = LOWER(TRIM(q.correct_player))
      THEN q.points
    WHEN q.kind = 'number'
      AND q.correct_number IS NOT NULL
      AND sp.answer_number = q.correct_number
      THEN q.points
    ELSE 0
  END,
  updated_at = NOW()
  WHERE sp.question_key = p_key;

  GET DIAGNOSTICS updated = ROW_COUNT;

  UPDATE public.special_questions
  SET resolved_at = NOW()
  WHERE key = p_key;

  -- Recalcular total_points sumando partidos + preguntas especiales (globales).
  UPDATE public.profiles p
  SET total_points = (
    SELECT COALESCE(SUM(points_earned),0) FROM public.predictions
       WHERE user_id = p.id AND league_id IS NULL
  ) + (
    SELECT COALESCE(SUM(points_earned),0) FROM public.special_predictions
       WHERE user_id = p.id AND league_id IS NULL
  )
  WHERE p.id IN (
    SELECT DISTINCT user_id FROM public.special_predictions
    WHERE question_key = p_key AND league_id IS NULL
  );

  RETURN updated;
END $$;

-- ─── 6. Seed inicial: las 3 preguntas pedidas ─────────────────────────────
INSERT INTO public.special_questions (key, kind, prompt, description, options, points, display_order)
VALUES
  (
    'mbappe_vs_lamine',
    'choice',
    '¿Quién marcará más goles, Mbappé o Lamine?',
    'Solo se cuentan los goles oficialmente registrados por la FIFA en el Mundial 2026.',
    '[
      {"value":"mbappe","label":"Kylian Mbappé","emoji":"🇫🇷","team":"Francia"},
      {"value":"lamine","label":"Lamine Yamal","emoji":"🇪🇸","team":"España"}
    ]'::jsonb,
    2,
    1
  ),
  (
    'top_scorer',
    'player',
    'Pichichi del Mundial',
    'El jugador con más goles del torneo. Empate → mismo desempate que FIFA (asistencias, después minutos jugados).',
    NULL,
    3,
    2
  ),
  (
    'total_cards_weighted',
    'number',
    'Número total de tarjetas en el Mundial',
    'Suma de tarjetas amarillas más el doble de las rojas en todo el torneo (amarillas + 2 × rojas).',
    NULL,
    4,
    3
  )
ON CONFLICT (key) DO NOTHING;
