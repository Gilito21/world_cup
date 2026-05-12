-- Simplifica el texto de la pregunta mbappe_vs_lamine
UPDATE public.special_questions
SET
  prompt     = '¿Quién marcará más goles?',
  updated_at = NOW()
WHERE key = 'mbappe_vs_lamine';
