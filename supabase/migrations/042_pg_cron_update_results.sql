-- Activa pg_cron y programa la edge function update-results cada 5 minutos.
-- pg_net ya está activo (migración anterior no necesaria).
-- La edge function reemplaza el cron de GitHub Actions para los resultados
-- en tiempo real; GitHub Actions sigue corriendo como backup/advance-points.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotente: eliminar si ya existe antes de (re)crear
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'update-match-results-5min';

SELECT cron.schedule(
  'update-match-results-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url              := 'https://jpbbxrlrkavuckghwzpz.supabase.co/functions/v1/update-results',
    headers          := '{"Content-Type": "application/json"}'::jsonb,
    body             := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
