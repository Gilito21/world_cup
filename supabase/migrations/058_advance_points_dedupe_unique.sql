-- ============================================================
-- 058 — advance_points: dedupe + índice único de ámbito
-- ============================================================
-- advance_points se refresca con "borrar-todo + insertar" desde DOS procesos
-- (edge function update-results cada minuto vía pg_cron + Action horaria). Al no
-- haber índice único, cuando ambos se solapan (delete-A, delete-B, insert-A,
-- insert-B) las filas quedan DUPLICADAS y el bonus de avance se cuenta 2×,
-- inflando total_points. Afectó a ~117/128 usuarios (mayoría en 2× limpio).
--
-- Esta migración:
--   1) Deduplica: conserva una fila por (user_id, league_id, team, stage).
--   2) Crea índice único que impide volver a duplicar (NULLS NOT DISTINCT para
--      tratar league_id NULL —ámbito global— como un valor, igual que 053).
--   3) Recalcula total_points (ámbito global) para todos los usuarios.
--
-- El código (scoreKnockout.js) pasa a upsert(onConflict, ignoreDuplicates) para
-- que la carrera entre procesos ya no pueda duplicar.

-- ── 1) Dedupe ─────────────────────────────────────────────────────────────────
DELETE FROM public.advance_points
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, league_id, team, stage
             ORDER BY id
           ) AS rn
    FROM public.advance_points
  ) t
  WHERE t.rn > 1
);

-- ── 2) Índice único de ámbito ─────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS advance_points_scope_uniq
  ON public.advance_points (user_id, league_id, team, stage) NULLS NOT DISTINCT;

-- ── 3) Recalcular total_points (ámbito global) ────────────────────────────────
UPDATE public.profiles p
SET total_points = (
  SELECT COALESCE(SUM(points_earned), 0)
  FROM public.predictions
  WHERE user_id = p.id AND league_id IS NULL
) + (
  SELECT COALESCE(SUM(points_earned), 0)
  FROM public.special_predictions
  WHERE user_id = p.id AND league_id IS NULL
) + (
  SELECT COALESCE(SUM(points), 0)
  FROM public.advance_points
  WHERE user_id = p.id AND league_id IS NULL
);
