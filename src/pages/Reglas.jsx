export default function Reglas() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Cómo funciona</h2>
        <p className="text-stone-400 text-sm mt-1">Reglas e instrucciones de la Porra Mundial 2026</p>
      </div>

      {/* 1. Los pronósticos */}
      <Section icon="🎯" title="Tus pronósticos">
        <p>Antes del inicio del Mundial tienes que rellenar el resultado de <strong>todos los partidos</strong>: los 48 de fase de grupos y los 16 eliminatorios (R32, octavos, cuartos, semis, tercer puesto y final).</p>
        <ul className="mt-3 space-y-2 text-stone-600">
          <li className="flex gap-2"><span className="mt-0.5 flex-shrink-0">1.</span><span>Ve a la pestaña <strong>Pronósticos</strong> y rellena los marcadores de todos los partidos de grupos.</span></li>
          <li className="flex gap-2"><span className="mt-0.5 flex-shrink-0">2.</span><span>Según vayas poniendo resultados de grupos, la app predice automáticamente qué equipos pasan de ronda y te permite poner el marcador de cada partido eliminatorio.</span></li>
          <li className="flex gap-2"><span className="mt-0.5 flex-shrink-0">3.</span><span>Cuando tengas todos los partidos rellenos (104 en total), podrás pulsar <strong>Enviar pronóstico</strong>.</span></li>
        </ul>
        <Callout type="warning">
          El pronóstico se envía <strong>una sola vez y es irreversible</strong>. Una vez enviado no podrás modificar ningún resultado.
        </Callout>
      </Section>

      {/* 2. Fecha límite */}
      <Section icon="⏰" title="Fecha límite de envío">
        <p>Los pronósticos se cierran <strong>1 hora antes del primer partido del Mundial</strong> (11 de junio de 2026, México vs. Sudáfrica). A partir de ese momento no se aceptan nuevos envíos ni modificaciones.</p>
        <Callout type="info">
          La cuenta atrás aparece en la parte superior de la pantalla de Pronósticos. Envía con tiempo.
        </Callout>
      </Section>

      {/* 3. Puntuación */}
      <Section icon="🏅" title="Sistema de puntuación">
        <p className="mb-4">Los puntos se calculan automáticamente cuando se registra el resultado real de cada partido:</p>
        <div className="space-y-3">
          <ScoreRow
            label="Resultado exacto"
            badge="🎯 +3 pts"
            badgeClass="bg-amber-500/15 text-amber-600 border border-amber-500/30"
            description="Aciertas el marcador exacto. Ej: predices 2–1 y acaba 2–1."
          />
          <ScoreRow
            label="Ganador correcto"
            badge="✓ +1 pt"
            badgeClass="bg-blue-500/15 text-blue-600 border border-blue-500/30"
            description="Aciertas quién gana (o que hay empate) pero el marcador no es exacto. Ej: predices 2–1 y acaba 3–1."
          />
          <ScoreRow
            label="Fallo"
            badge="✗ 0 pts"
            badgeClass="bg-stone-100 text-stone-500 border border-stone-200"
            description="El ganador que predices no coincide con el resultado real."
          />
        </div>
        <p className="mt-4 text-sm text-stone-500">La clasificación general suma los puntos de todos los partidos. Los puntos por liga son independientes de los globales.</p>
      </Section>

      {/* 4. Ligas */}
      <Section icon="🏆" title="Ligas privadas">
        <p>Las ligas te permiten competir dentro de un grupo cerrado de amigos. Puedes estar en varias ligas a la vez.</p>

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
            <p className="font-semibold text-stone-800 mb-1">Crear una liga</p>
            <p className="text-sm text-stone-600">Pulsa el selector de liga en la barra superior → <em>Crear o unirme a otra liga</em> → pestaña <em>Crear liga</em>. Recibirás un código de 8 letras para compartir con tus amigos.</p>
          </div>
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
            <p className="font-semibold text-stone-800 mb-1">Unirse a una liga</p>
            <p className="text-sm text-stone-600">Introduce el código que te haya dado el administrador, o accede al enlace directo que comparta. Te unirás automáticamente.</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-stone-600">Cada liga tiene su propia clasificación. Los pronósticos son los mismos para todas tus ligas (un único envío los cubre a todas).</p>

        <Callout type="info">
          Puedes cambiar de liga en cualquier momento desde el selector de la barra superior. La clasificación, resultados y pronósticos se muestran siempre en el contexto de la liga activa.
        </Callout>
      </Section>

      {/* 5. Clasificación */}
      <Section icon="📊" title="Clasificación">
        <p>La clasificación muestra a todos los participantes ordenados por puntos totales. En caso de empate a puntos, el orden es:</p>
        <ol className="mt-3 space-y-1 text-stone-600 list-decimal list-inside">
          <li>Mayor número de resultados exactos (3 pts)</li>
          <li>Mayor número de ganadores correctos (1 pt)</li>
          <li>Orden alfabético de nombre de usuario</li>
        </ol>
      </Section>

      {/* 6. Fase de grupos */}
      <Section icon="⚽" title="Formato del Mundial 2026">
        <p>El Mundial 2026 (USA, México y Canadá) tiene un formato nuevo con <strong>48 selecciones</strong>:</p>
        <ul className="mt-3 space-y-2 text-stone-600">
          <li className="flex gap-2"><span className="flex-shrink-0">•</span><span><strong>12 grupos</strong> (A–L) de 4 equipos. Cada equipo juega 3 partidos.</span></li>
          <li className="flex gap-2"><span className="flex-shrink-0">•</span><span>Clasifican los <strong>2 primeros de cada grupo</strong> (24 equipos) más los <strong>8 mejores terceros</strong>.</span></li>
          <li className="flex gap-2"><span className="flex-shrink-0">•</span><span>A partir de ahí, eliminación directa: Ronda de 32 → Octavos → Cuartos → Semis → Final.</span></li>
        </ul>
        <p className="mt-3 text-sm text-stone-500">La pestaña <strong>Bracket</strong> muestra el cuadro completo con las clasificaciones de grupos en tiempo real.</p>
      </Section>

      {/* Footer */}
      <div className="text-center text-xs text-stone-400 pb-4">
        ¿Dudas? Pregunta al administrador de tu liga · Mundial 2026 · USA · México · Canadá
      </div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function Section({ icon, title, children }) {
  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-bold text-stone-900">{title}</h3>
      </div>
      <div className="text-stone-600 text-sm leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  )
}

function Callout({ type, children }) {
  const styles = type === 'warning'
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-800'
    : 'bg-blue-500/10 border-blue-500/30 text-blue-800'
  return (
    <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  )
}

function ScoreRow({ label, badge, badgeClass, description }) {
  return (
    <div className="flex items-start gap-3 bg-stone-50 border border-stone-200 rounded-xl p-3">
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5 ${badgeClass}`}>
        {badge}
      </span>
      <div>
        <p className="font-semibold text-stone-800 text-sm">{label}</p>
        <p className="text-stone-500 text-xs mt-0.5">{description}</p>
      </div>
    </div>
  )
}
