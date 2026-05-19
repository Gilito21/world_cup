-- ============================================================
-- 028 — reminder_logs hardening + deadline check para extras
--       + match_consensus_by_league_v1
--
-- Tres cosas:
--
-- 1) `reminder_logs` ya existe en prod (creada vía MCP en una rama
--    de email rebrand que nunca trajo migración al repo). Schema OK,
--    pero la policy de SELECT (`admin_can_read_own_reminders`) sólo
--    deja ver al admin las filas que él mismo envió. El edge function
--    `send-reminder` lee con el JWT del caller para chequear el
--    cooldown de 24h → si admin A envió ayer y admin B reintenta hoy,
--    B no ve la fila de A y bypasea el cooldown.
--    Reemplazamos la policy por una que deje ver a cualquier admin
--    de la liga (y al propio target, por transparencia).
--
-- 2) `special_predictions` no tiene trigger BEFORE INSERT/UPDATE de
--    deadline. La UI bloquea (Extras.jsx:478) pero la API REST de
--    Supabase es accesible con la anon key y un JWT → un usuario
--    podía editar extras tras el cierre. Añadimos el trigger con el
--    mismo escape para auth.uid() IS NULL que mig. 027.
--
-- 3) `match_consensus_v1()` agregaba SIEMPRE sobre todas las
--    predicciones (globales + cualquier liga). Para usuarios en una
--    liga `per_league`, el "consenso sugerido" reflejaba el universo
--    global, no la opinión de su liga. Añadimos
--    `match_consensus_by_league_v1(p_league_id uuid)` con la misma
--    forma pero filtrando por league_id; el frontend la usará cuando
--    el modo de liga sea per_league. Sigue exigiendo ≥3 votantes
--    dentro del scope.
-- ============================================================

-- ─── 1. reminder_logs: estructura + RLS coherente ────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES public.leagues(id)   ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  sent_by         UUID NOT NULL REFERENCES auth.users(id)       ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup
  ON public.reminder_logs (league_id, target_user_id, sent_at DESC);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

-- Limpieza de policies obsoletas creadas fuera del repo.
DROP POLICY IF EXISTS "admin_can_read_own_reminders" ON public.reminder_logs;
DROP POLICY IF EXISTS "admin_can_insert_reminders"   ON public.reminder_logs;
-- Y de las nuevas, para que la migración sea idempotente si la reaplico.
DROP POLICY IF EXISTS "reminder_logs_lectura"        ON public.reminder_logs;
DROP POLICY IF EXISTS "reminder_logs_insercion"      ON public.reminder_logs;

CREATE POLICY "reminder_logs_lectura"
  ON public.reminder_logs FOR SELECT
  USING (
    auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = reminder_logs.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role      = 'admin'
    )
  );

CREATE POLICY "reminder_logs_insercion"
  ON public.reminder_logs FOR INSERT
  WITH CHECK (
    auth.uid() = sent_by
    AND EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = reminder_logs.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role      = 'admin'
    )
  );

-- ─── 2. Deadline check para special_predictions ──────────────────────────
CREATE OR REPLACE FUNCTION public.check_special_prediction_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_first_match TIMESTAMPTZ;
BEGIN
  -- Triggers internos y service_role (auth.uid() IS NULL) no quedan
  -- atrapados por el cierre. Mismo patrón que mig. 027.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MIN(match_date) INTO v_first_match
  FROM public.matches
  WHERE stage = 'group';

  IF v_first_match IS NOT NULL
     AND v_first_match - INTERVAL '1 hour' <= NOW()
  THEN
    RAISE EXCEPTION 'No se pueden modificar pronósticos especiales: el plazo ha cerrado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_special_pred_deadline_insert ON public.special_predictions;
CREATE TRIGGER trg_special_pred_deadline_insert
  BEFORE INSERT ON public.special_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_special_prediction_deadline();

DROP TRIGGER IF EXISTS trg_special_pred_deadline_update ON public.special_predictions;
CREATE TRIGGER trg_special_pred_deadline_update
  BEFORE UPDATE ON public.special_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_special_prediction_deadline();

-- ─── 3. Consensus filtrado por liga ──────────────────────────────────────
-- Misma forma que match_consensus_v1 pero filtrando predicciones por
-- league_id. Para predicciones globales el frontend sigue llamando a
-- match_consensus_v1.
CREATE OR REPLACE FUNCTION public.match_consensus_by_league_v1(p_league_id UUID)
RETURNS TABLE (
  match_id      UUID,
  home_score    INTEGER,
  away_score    INTEGER,
  vote_count    BIGINT,
  total_voters  BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dedup AS (
    SELECT DISTINCT ON (user_id, match_id)
      user_id, match_id, home_score, away_score
    FROM public.predictions
    WHERE home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND league_id  = p_league_id
    ORDER BY user_id, match_id, updated_at DESC
  ),
  counts AS (
    SELECT
      match_id,
      home_score,
      away_score,
      COUNT(*) AS vote_count,
      SUM(COUNT(*)) OVER (PARTITION BY match_id) AS total_voters
    FROM dedup
    GROUP BY match_id, home_score, away_score
  ),
  per_match AS (
    SELECT DISTINCT ON (match_id)
      match_id, home_score, away_score, vote_count, total_voters
    FROM counts
    ORDER BY match_id, vote_count DESC, home_score DESC, away_score DESC
  )
  SELECT match_id, home_score, away_score, vote_count, total_voters
  FROM per_match
  WHERE total_voters >= 3;
$$;

-- Permisos: los authenticated users la invocan vía PostgREST.
GRANT EXECUTE ON FUNCTION public.match_consensus_by_league_v1(UUID) TO authenticated;
