-- 051 — penalty score columns
-- Stores the penalty shootout result separately from the 120-min score.
-- home_score / away_score = result at end of 120 min (regular + extra time).
-- home_score_penalties / away_score_penalties = penalty shootout scores (non-null only for matches decided by penalties).

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_score_penalties INTEGER,
  ADD COLUMN IF NOT EXISTS away_score_penalties INTEGER;
