CREATE TABLE IF NOT EXISTS public.league_prize_results (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  rule_id     text        NOT NULL,
  trigger_key text        NOT NULL,
  winner_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  locked      boolean     NOT NULL DEFAULT false,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, rule_id)
);

ALTER TABLE public.league_prize_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read prize results"
  ON public.league_prize_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = league_prize_results.league_id
        AND lm.user_id   = auth.uid()
    )
  );
