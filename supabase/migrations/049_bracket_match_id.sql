-- ============================================================
-- 049 — bracket_match_id: hueco del cuadro de cada partido KO (explícito)
--
-- Hasta ahora el mapeo "partido real ↔ hueco del bracket (R32_M1…)" se
-- adivinaba en tiempo de lectura (por equipos reales / por fecha). Eso era
-- frágil: al corregir los cruces, el mapeo cambió y descolocó los picks de
-- todos. Fijamos el hueco como DATO en la fila del partido para que no pueda
-- volver a derivar solo.
--
-- Se rellena por ronda, cuando los equipos reales de esa ronda ya se conocen
-- (R32 ahora; octavos+ cuando se resuelvan). Grupos = NULL.
-- El código (computePredictedKnockout / Bracket.jsx) usa esta columna como
-- autoridad cuando está presente, y cae al heurístico solo si es NULL.
-- ============================================================

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS bracket_match_id TEXT;

COMMENT ON COLUMN public.matches.bracket_match_id IS
  'Hueco del cuadro (R32_M1..R32_M16, R16_M1.., QF_M1.., SF_M1/2, THIRD_PLACE, FINAL). NULL en fase de grupos o rondas aún sin equipos reales.';

-- R32: mapeo por equipos reales (cabeza de serie = local, igual que la plantilla).
UPDATE public.matches SET bracket_match_id = v.slot
FROM (VALUES
  ('e642b750-98ae-4562-8386-14592591bf6f'::uuid, 'R32_M1'),
  ('fb608396-07a4-42a3-a6b7-7d5f62ffb123'::uuid, 'R32_M2'),
  ('e3c708f8-b05e-440d-b6e9-1ee48ff6e2ea'::uuid, 'R32_M3'),
  ('de564591-6da5-4db2-8014-8e25506478b0'::uuid, 'R32_M4'),
  ('6023071b-531d-4370-aa95-7b8cf79d8f75'::uuid, 'R32_M5'),
  ('1f1ab053-8c35-4d31-9c36-07117f36936a'::uuid, 'R32_M6'),
  ('fd93b040-60d8-4873-b849-8e8c922cd77d'::uuid, 'R32_M7'),
  ('b1e50a15-3702-4eb5-b392-5004bf77a629'::uuid, 'R32_M8'),
  ('31354f7f-dfcc-4d6e-a180-fcfad2aaa723'::uuid, 'R32_M9'),
  ('63c95127-6062-45da-9a07-7b27bd0dd09d'::uuid, 'R32_M10'),
  ('c0a29145-edf8-4093-b313-5cc7d4821374'::uuid, 'R32_M11'),
  ('10da30f4-1f22-491b-b21a-8dccedf8d240'::uuid, 'R32_M12'),
  ('8a697022-d918-4696-8ea2-368a05b919e4'::uuid, 'R32_M13'),
  ('8b42524d-c781-4573-a69d-855d2fa182b0'::uuid, 'R32_M14'),
  ('2c4489c9-2b05-4cd9-bafe-002184e6eafb'::uuid, 'R32_M15'),
  ('ce2fe8e0-593b-4bc8-aef5-9eefa7d595bb'::uuid, 'R32_M16')
) AS v(id, slot)
WHERE public.matches.id = v.id;