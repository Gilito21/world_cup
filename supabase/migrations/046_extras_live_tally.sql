-- ============================================================
-- 046 — Marcador en vivo en las preguntas de extras
-- ============================================================
-- Las special_questions no tienen campo de "goles/tarjetas hasta ahora",
-- así que el marcador en curso se refleja en la `description` (mismo patrón
-- que 015/017). Se actualiza a mano según avanza el torneo.
--
-- Goles Mbappé/Lamine: valores facilitados (Mbappé 4, Lamine 1).
-- Tarjetas: sumadas de las actas de ESPN (FIFA.WORLD) sobre los partidos
-- jugados → 104 amarillas + 8 rojas → ponderado 104 + 2×8 = 120.

UPDATE public.special_questions
SET
  description = 'Solo se cuentan los goles oficialmente registrados por la FIFA en el Mundial 2026. Llevamos: 🇫🇷 Mbappé 4 · 🇪🇸 Lamine 1.',
  updated_at  = NOW()
WHERE key = 'mbappe_vs_lamine';

UPDATE public.special_questions
SET
  description = 'Suma de tarjetas amarillas más el doble de las rojas en todo el torneo (amarillas + 2 × rojas). Llevamos: 🟨 104 · 🟥 8 → 120.',
  updated_at  = NOW()
WHERE key = 'total_cards_weighted';
