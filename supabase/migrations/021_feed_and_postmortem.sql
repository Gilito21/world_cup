-- ============================================================
-- 021 — Feed de liga + post-mortem por partido
--
-- Dos RPC SECURITY DEFINER para alimentar:
--   * El feed de actividad de cada liga (Clasificación → tab Liga)
--   * El panel post-mortem de cada partido finalizado (Resultados)
--
-- No introducen tablas nuevas: derivan los eventos de los datos
-- existentes (league_members, prediction_submissions, predictions
-- + matches). El RPC respeta el modo de predicción por miembro
-- (global vs per_league) igual que el resto de queries en cliente.
-- ============================================================

-- ─── 1. Feed de actividad de liga ────────────────────────────────────────
-- Devuelve los últimos N eventos relevantes de la liga, ordenados por
-- fecha descendente. Tipos de evento:
--   join           → un miembro se unió a la liga
--   submit_matches → un miembro envió definitivamente sus partidos
--   submit_extras  → un miembro envió las preguntas extra
--   exact          → un miembro acertó un marcador exacto (+3)
--   correct        → un miembro acertó el ganador/empate (+1)
--
-- Los eventos de acierto solo se incluyen para partidos finalizados
-- en los últimos 14 días para mantener el feed ágil y relevante.

CREATE OR REPLACE FUNCTION public.league_feed_v1(
  p_league_id UUID,
  p_limit     INTEGER DEFAULT 30
)
RETURNS TABLE (
  event_type TEXT,
  user_id    UUID,
  username   TEXT,
  avatar_url TEXT,
  event_time TIMESTAMPTZ,
  data       JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Comprueba que el usuario que llama pertenece a la liga.
  IF NOT EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT lm.user_id, lm.joined_at, lm.prediction_mode,
           p.username, p.avatar_url
    FROM public.league_members lm
    JOIN public.profiles p ON p.id = lm.user_id
    WHERE lm.league_id = p_league_id
  ),
  joins AS (
    SELECT 'join'::TEXT       AS event_type,
           m.user_id,
           m.username,
           m.avatar_url,
           m.joined_at        AS event_time,
           '{}'::JSONB        AS data
    FROM members m
  ),
  submits AS (
    SELECT
      CASE WHEN ps.source = 'extras' THEN 'submit_extras' ELSE 'submit_matches' END
                              AS event_type,
      ps.user_id,
      m.username,
      m.avatar_url,
      ps.submitted_at         AS event_time,
      '{}'::JSONB             AS data
    FROM public.prediction_submissions ps
    JOIN members m ON m.user_id = ps.user_id
    WHERE
      -- Mode-aware: cada miembro decide si envía global o per_league.
      (m.prediction_mode = 'per_league' AND ps.league_id = p_league_id)
      OR (m.prediction_mode <> 'per_league' AND ps.league_id IS NULL)
  ),
  hits AS (
    SELECT
      CASE WHEN pr.points_earned = 3 THEN 'exact' ELSE 'correct' END
                              AS event_type,
      pr.user_id,
      m.username,
      m.avatar_url,
      mt.updated_at           AS event_time,
      jsonb_build_object(
        'match_id',    mt.id,
        'home_team',   mt.home_team,
        'away_team',   mt.away_team,
        'home_score',  mt.home_score,
        'away_score',  mt.away_score,
        'pred_home',   pr.home_score,
        'pred_away',   pr.away_score,
        'points',      pr.points_earned,
        'stage',       mt.stage
      )                       AS data
    FROM public.predictions pr
    JOIN members m ON m.user_id = pr.user_id
    JOIN public.matches mt ON mt.id = pr.match_id
    WHERE
      pr.points_earned > 0
      AND mt.status = 'finished'
      AND mt.updated_at > NOW() - INTERVAL '14 days'
      AND (
        (m.prediction_mode = 'per_league' AND pr.league_id = p_league_id)
        OR (m.prediction_mode <> 'per_league' AND pr.league_id IS NULL)
      )
  )
  SELECT * FROM (
    SELECT * FROM joins
    UNION ALL
    SELECT * FROM submits
    UNION ALL
    SELECT * FROM hits
  ) u
  ORDER BY event_time DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END $$;

-- Postgres concede EXECUTE a PUBLIC por defecto al crear funciones, lo
-- que dejaría a `anon` invocar la RPC vía REST. Revocamos para que solo
-- usuarios autenticados (cuyo auth.uid() es la base del check de
-- pertenencia) puedan llamarla.
REVOKE EXECUTE ON FUNCTION public.league_feed_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_feed_v1(UUID, INTEGER) TO authenticated;


-- ─── 2. Post-mortem de un partido finalizado ─────────────────────────────
-- Compara la precisión de la liga frente al mundo entero para un partido
-- ya jugado. Devuelve un único JSONB con todas las métricas que necesita
-- la UI para que el cliente haga una sola llamada.
--
-- p_league_id puede ser NULL → devuelve solo las métricas globales.

CREATE OR REPLACE FUNCTION public.match_postmortem_v1(
  p_match_id  UUID,
  p_league_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_match        public.matches%ROWTYPE;
  v_global_total INT  := 0;
  v_global_exact INT  := 0;
  v_global_corr  INT  := 0;
  v_global_top   TEXT;
  v_league_total INT  := 0;
  v_league_exact INT  := 0;
  v_league_corr  INT  := 0;
  v_league_top   TEXT;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL OR v_match.status <> 'finished' THEN
    RETURN NULL;
  END IF;

  -- ─ Métricas globales: cualquier predicción (sin filtrar por liga) ───
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE pr.points_earned = 3),
    COUNT(*) FILTER (WHERE pr.points_earned = 1)
  INTO v_global_total, v_global_exact, v_global_corr
  FROM public.predictions pr
  WHERE pr.match_id = p_match_id;

  SELECT (pr.home_score || '–' || pr.away_score)
  INTO v_global_top
  FROM public.predictions pr
  WHERE pr.match_id = p_match_id
  GROUP BY pr.home_score, pr.away_score
  ORDER BY COUNT(*) DESC, pr.home_score, pr.away_score
  LIMIT 1;

  -- ─ Métricas de liga (si se pidió) ────────────────────────────────────
  IF p_league_id IS NOT NULL THEN
    -- Comprueba pertenencia para no filtrar info de otras ligas.
    IF NOT EXISTS (
      SELECT 1 FROM public.league_members
      WHERE league_id = p_league_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'not_a_member';
    END IF;

    WITH league_preds AS (
      SELECT pr.*
      FROM public.predictions pr
      JOIN public.league_members lm ON lm.user_id = pr.user_id
      WHERE pr.match_id = p_match_id
        AND lm.league_id = p_league_id
        AND (
          (lm.prediction_mode = 'per_league' AND pr.league_id = p_league_id)
          OR (COALESCE(lm.prediction_mode,'global') <> 'per_league' AND pr.league_id IS NULL)
        )
    )
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE points_earned = 3),
      COUNT(*) FILTER (WHERE points_earned = 1)
    INTO v_league_total, v_league_exact, v_league_corr
    FROM league_preds;

    SELECT (home_score || '–' || away_score)
    INTO v_league_top
    FROM (
      SELECT pr.home_score, pr.away_score
      FROM public.predictions pr
      JOIN public.league_members lm ON lm.user_id = pr.user_id
      WHERE pr.match_id = p_match_id
        AND lm.league_id = p_league_id
        AND (
          (lm.prediction_mode = 'per_league' AND pr.league_id = p_league_id)
          OR (COALESCE(lm.prediction_mode,'global') <> 'per_league' AND pr.league_id IS NULL)
        )
    ) q
    GROUP BY home_score, away_score
    ORDER BY COUNT(*) DESC, home_score, away_score
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'global', jsonb_build_object(
      'total',     v_global_total,
      'exact',     v_global_exact,
      'correct',   v_global_corr,
      'top_score', v_global_top
    ),
    'league', CASE WHEN p_league_id IS NULL THEN NULL ELSE jsonb_build_object(
      'total',     v_league_total,
      'exact',     v_league_exact,
      'correct',   v_league_corr,
      'top_score', v_league_top
    ) END,
    'actual', jsonb_build_object(
      'home', v_match.home_score,
      'away', v_match.away_score
    )
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.match_postmortem_v1(UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.match_postmortem_v1(UUID, UUID) TO authenticated;
