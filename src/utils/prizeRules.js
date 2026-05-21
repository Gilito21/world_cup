export const TRIGGER_GROUPS = [
  {
    group: 'clasificacion',
    label: 'Clasificación final',
    options: [
      { value: 'final_1st',   emoji: '🥇', label: '1º clasificado al final del torneo' },
      { value: 'final_2nd',   emoji: '🥈', label: '2º clasificado al final del torneo' },
      { value: 'final_3rd',   emoji: '🥉', label: '3º clasificado al final del torneo' },
      { value: 'final_4th',   emoji: '4️⃣',  label: '4º clasificado al final del torneo' },
      { value: 'final_last',  emoji: '🥄', label: 'Cucharón (último clasificado)' },
    ],
  },
  {
    group: 'fases',
    label: 'Líder por fases',
    options: [
      { value: 'after_groups_1st', emoji: '🏁', label: 'Líder al finalizar fase de grupos' },
      { value: 'after_groups_2nd', emoji: '🏁', label: '2º al finalizar fase de grupos' },
      { value: 'after_r32_1st',    emoji: '⚽', label: 'Líder al finalizar ronda de 32' },
      { value: 'after_r16_1st',    emoji: '🎯', label: 'Líder al finalizar octavos de final' },
      { value: 'after_qf_1st',     emoji: '⚔️', label: 'Líder al finalizar cuartos de final' },
      { value: 'after_sf_1st',     emoji: '⭐', label: 'Líder al finalizar semifinales' },
    ],
  },
  {
    group: 'logros',
    label: 'Logros especiales',
    options: [
      { value: 'most_exact',          emoji: '🎯', label: 'Más resultados exactos predichos' },
      { value: 'most_correct',        emoji: '✅', label: 'Más resultados con ganador correcto' },
      { value: 'best_groups_only',    emoji: '⚽', label: 'Mayor puntuación solo en fase de grupos' },
      { value: 'best_knockouts_only', emoji: '⚔️', label: 'Mayor puntuación solo en eliminatorias' },
      { value: 'best_extras',         emoji: '🎲', label: 'Mayor puntuación en preguntas extra' },
      { value: 'predicted_winner',    emoji: '🏆', label: 'Predijo el campeón del mundial' },
      { value: 'predicted_topscorer', emoji: '⚡', label: 'Predijo el máximo goleador' },
      { value: 'most_submitted',      emoji: '📝', label: 'Más pronósticos enviados en total' },
      { value: 'early_bird',          emoji: '🐦', label: 'Primero en enviar todos los pronósticos' },
      { value: 'best_bracket',        emoji: '🎖️', label: 'Mejor bracket de eliminatorias' },
      { value: 'biggest_surprise',    emoji: '😱', label: 'Predijo la mayor sorpresa del torneo' },
      { value: 'most_streak',         emoji: '🔥', label: 'Racha más larga de aciertos consecutivos' },
    ],
  },
  {
    group: 'custom',
    label: 'Personalizado',
    options: [
      { value: 'custom', emoji: '✏️', label: 'Premio personalizado' },
    ],
  },
]

const ALL_TRIGGERS = TRIGGER_GROUPS.flatMap(g => g.options)
export function getTriggerInfo(value) {
  return ALL_TRIGGERS.find(t => t.value === value) ?? { value: 'custom', emoji: '✏️', label: 'Premio personalizado' }
}
