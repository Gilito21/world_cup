-- Reparto a medias en empates reales: un premio puede tener varios ganadores.
-- Hasta ahora league_prize_results guardaba un único winner_id y, ante un empate
-- que ni la métrica ni los puntos de la clasificación rompían, se decidía por
-- orden alfabético de username. Ahora ese último escalón se sustituye por un
-- reparto: winner_ids lista a TODOS los empatados y el importe se divide entre
-- ellos en la UI. winner_id se conserva (= primer ganador) para lectores viejos.
ALTER TABLE public.league_prize_results
  ADD COLUMN IF NOT EXISTS winner_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill: los resultados existentes tienen un único ganador en winner_id.
UPDATE public.league_prize_results
  SET winner_ids = ARRAY[winner_id]
  WHERE winner_id IS NOT NULL
    AND (winner_ids IS NULL OR cardinality(winner_ids) = 0);
