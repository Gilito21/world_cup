-- ============================================================
-- Porra Mundial 2026 — Reset de pronósticos + pregunta MVP
--
-- 1. Añade políticas DELETE para que cada usuario pueda borrar
--    sus propios pronósticos antes del cierre.
-- 2. Cambia la pregunta "Pichichi del Mundial" por "MVP del Mundial"
--    (no el máximo goleador sino el mejor jugador del torneo).
-- ============================================================

-- ─── 1. DELETE policies ───────────────────────────────────────────────────

-- predictions: el propio usuario puede borrar sus pronósticos
DROP POLICY IF EXISTS "pronosticos_borrado" ON public.predictions;
CREATE POLICY "pronosticos_borrado"
  ON public.predictions FOR DELETE
  USING (auth.uid() = user_id);

-- special_predictions: el propio usuario puede borrar sus respuestas extra
DROP POLICY IF EXISTS "sp_borrado" ON public.special_predictions;
CREATE POLICY "sp_borrado"
  ON public.special_predictions FOR DELETE
  USING (auth.uid() = user_id);

-- prediction_submissions: el propio usuario puede borrar su registro de envío
DROP POLICY IF EXISTS "sub_borrado" ON public.prediction_submissions;
CREATE POLICY "sub_borrado"
  ON public.prediction_submissions FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 2. Actualizar pregunta top_scorer → MVP del Mundial ──────────────────
UPDATE public.special_questions
SET
  prompt      = 'MVP del Mundial',
  description = 'El jugador que se lleve el reconocimiento oficial de mejor jugador del torneo (Premio al Mejor Jugador de la FIFA / Balón de Oro del Mundial).',
  updated_at  = NOW()
WHERE key = 'top_scorer';
