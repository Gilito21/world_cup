-- ============================================================
-- digested_matches: control de qué partidos ya se reportaron en un
-- resumen diario (scripts/send-daily-digest.js)
-- ============================================================
-- Antes el digest elegía "resultados recientes" por una ventana rígida de
-- 24h (corte 05:00 UTC) + status='finished' en el instante del envío. Un
-- resultado que llegaba tarde del proveedor (football-data free entrega
-- scores con retardo) no entraba ese día y, al día siguiente, su match_date
-- ya caía fuera de la ventana → se perdía para siempre. Le pasó a
-- Ghana–Panamá (17-jun 23:00 UTC), que no constó como finished hasta ~10:39,
-- después de mandarse el digest.
--
-- Con esta tabla el digest reporta cualquier partido finished que NO esté
-- aquí, sin depender de la ventana: cada partido se reporta exactamente una
-- vez, en el primer resumen que corra tras terminar.

CREATE TABLE IF NOT EXISTS public.digested_matches (
  match_id    UUID PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  digested_on DATE        NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.digested_matches ENABLE ROW LEVEL SECURITY;
-- Tabla puramente interna del job: solo se lee/escribe con service_role
-- (que salta RLS). No exponemos políticas a clientes a propósito.

-- Backfill: damos por reportados todos los partidos finished EXCEPTO
-- Ghana–Panamá, que es el straggler que se perdió. Así el próximo digest lo
-- recoge una sola vez y no inunda con todo el grupo ya reportado.
-- (Identificado por equipos+fecha para no hardcodear el UUID generado.)
INSERT INTO public.digested_matches (match_id)
SELECT id FROM public.matches
WHERE status = 'finished'
  AND NOT (home_team = 'Ghana' AND away_team = 'Panama'
           AND match_date = '2026-06-17 23:00:00+00')
ON CONFLICT (match_id) DO NOTHING;
