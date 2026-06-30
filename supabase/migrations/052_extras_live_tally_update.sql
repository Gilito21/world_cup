-- ============================================================
-- 052 — Actualización del marcador en vivo de los extras (30-jun-2026)
-- ============================================================
-- Mismo patrón que 015/017/046: las special_questions no tienen campo de
-- "goles/tarjetas hasta ahora", así que el conteo en curso vive en la
-- `description` y se actualiza a mano desde la API de ESPN (FIFA.WORLD).
--
-- Fuente: 76 partidos jugados (72 de grupos + 4 de R32), actas de ESPN.
--   Goles (keyEvents scoringPlay+goal, sin autogoles): Mbappé 4 · Lamine 1
--   (top goleador del torneo: Messi 5).
--   Tarjetas (boxscore yellowCards/redCards): 190 amarillas + 10 rojas
--   → ponderado 190 + 2×10 = 210.

UPDATE public.special_questions
SET
  description = 'Solo se cuentan los goles oficialmente registrados por la FIFA en el Mundial 2026. Llevamos: 🇫🇷 Mbappé 4 · 🇪🇸 Lamine 1.',
  updated_at  = NOW()
WHERE key = 'mbappe_vs_lamine';

UPDATE public.special_questions
SET
  description = 'Suma de tarjetas amarillas más el doble de las rojas en todo el torneo (amarillas + 2 × rojas). Llevamos: 🟨 190 · 🟥 10 → 210.',
  updated_at  = NOW()
WHERE key = 'total_cards_weighted';
