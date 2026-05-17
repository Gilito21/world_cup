-- ============================================================
-- 022 — Dedup de "resumen diario" por usuario y día
--
-- El script send-daily-digest.js corre cada día durante el Mundial. Para
-- garantizar idempotencia ante reintentos (Render relanza si el job falla
-- a mitad) registramos un par (user_id, digest_date) por cada email
-- enviado correctamente. La clave primaria compuesta hace que reintentar
-- el mismo día sea no-op.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_digests (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  digest_date  DATE        NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_digests_user ON public.daily_digests (user_id);

ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;
-- No exposición a usuarios finales: solo el service_role del cron escribe
-- y lee esta tabla. Sin policies = nadie con anon/auth puede acceder.
