-- Sube la cadencia de actualización de resultados de 5 a 1 minuto.
-- El real-time lo dispara pg_cron → edge function update-results (1 llamada
-- a football-data por run; el free tier admite 10/min, así que 1/min va
-- holgado). Renombra el job a *-1min para que el nombre no mienta.

-- Idempotente: limpiar cualquier variante previa antes de (re)crear.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('update-match-results-5min', 'update-match-results-1min');

SELECT cron.schedule(
  'update-match-results-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url              := 'https://jpbbxrlrkavuckghwzpz.supabase.co/functions/v1/update-results',
    headers          := '{"Content-Type": "application/json"}'::jsonb,
    body             := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
