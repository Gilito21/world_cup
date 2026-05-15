import { useLang } from '../contexts/LangContext'

export default function Reglas() {
  const { t } = useLang()

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-stone-900">{t('reglas.title')}</h2>
        <p className="text-stone-400 text-xs sm:text-sm mt-0.5 sm:mt-1">{t('reglas.subtitle')}</p>
      </div>

      {/* 1. Los pronósticos */}
      <Section icon="🎯" title={t('reglas.s1title')}>
        <p>{t('reglas.s1body')}</p>
        <ul className="mt-3 space-y-2 text-stone-600">
          <li className="flex gap-2"><span className="mt-0.5 flex-shrink-0">1.</span><span>{t('reglas.s1step1')}</span></li>
          <li className="flex gap-2"><span className="mt-0.5 flex-shrink-0">2.</span><span>{t('reglas.s1step2')}</span></li>
          <li className="flex gap-2"><span className="mt-0.5 flex-shrink-0">3.</span><span>{t('reglas.s1step3')}</span></li>
        </ul>
        <Callout type="warning">
          {t('reglas.s1callout')}
        </Callout>
      </Section>

      {/* 2. Fecha límite */}
      <Section icon="⏰" title={t('reglas.s2title')}>
        <p>{t('reglas.s2body')}</p>
        <Callout type="info">
          {t('reglas.s2callout')}
        </Callout>
      </Section>

      {/* 3. Puntuación */}
      <Section icon="🏅" title={t('reglas.s3title')}>
        <p className="mb-4">{t('reglas.s3body')}</p>
        <div className="space-y-3">
          <ScoreRow
            label={t('reglas.s3exact')}
            badge={t('reglas.s3exactBadge')}
            badgeClass="bg-amber-500/15 text-amber-600 border border-amber-500/30"
            description={t('reglas.s3exactDesc')}
          />
          <ScoreRow
            label={t('reglas.s3correct')}
            badge={t('reglas.s3correctBadge')}
            badgeClass="bg-blue-500/15 text-blue-600 border border-blue-500/30"
            description={t('reglas.s3correctDesc')}
          />
          <ScoreRow
            label={t('reglas.s3wrong')}
            badge={t('reglas.s3wrongBadge')}
            badgeClass="bg-stone-100 text-stone-500 border border-stone-200"
            description={t('reglas.s3wrongDesc')}
          />
        </div>
        <p className="mt-4 text-sm text-stone-500">{t('reglas.s3note')}</p>
      </Section>

      {/* 4. Ligas */}
      <Section icon="🏆" title={t('reglas.s4title')}>
        <p>{t('reglas.s4body')}</p>

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
            <p className="font-semibold text-stone-800 mb-1">{t('reglas.s4createTitle')}</p>
            <p className="text-sm text-stone-600">{t('reglas.s4createDesc')}</p>
          </div>
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
            <p className="font-semibold text-stone-800 mb-1">{t('reglas.s4joinTitle')}</p>
            <p className="text-sm text-stone-600">{t('reglas.s4joinDesc')}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-stone-600">{t('reglas.s4note')}</p>

        <Callout type="info">
          {t('reglas.s4callout')}
        </Callout>
      </Section>

      {/* 5. Clasificación */}
      <Section icon="📊" title={t('reglas.s5title')}>
        <p>{t('reglas.s5body')}</p>
        <ol className="mt-3 space-y-1 text-stone-600 list-decimal list-inside">
          <li>{t('reglas.s5tb1')}</li>
          <li>{t('reglas.s5tb2')}</li>
          <li>{t('reglas.s5tb3')}</li>
        </ol>
      </Section>

      {/* 6. Fase de grupos */}
      <Section icon="⚽" title={t('reglas.s6title')}>
        <p>{t('reglas.s6body')}</p>
        <ul className="mt-3 space-y-2 text-stone-600">
          <li className="flex gap-2"><span className="flex-shrink-0">•</span><span>{t('reglas.s6b1')}</span></li>
          <li className="flex gap-2"><span className="flex-shrink-0">•</span><span>{t('reglas.s6b2')}</span></li>
          <li className="flex gap-2"><span className="flex-shrink-0">•</span><span>{t('reglas.s6b3')}</span></li>
        </ul>
        <p className="mt-3 text-sm text-stone-500">{t('reglas.s6note')}</p>
      </Section>

      {/* Footer */}
      <div className="text-center text-xs text-stone-400 pb-4">
        {t('reglas.footer')}
      </div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function Section({ icon, title, children }) {
  return (
    <div className="card p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="text-xl sm:text-2xl">{icon}</span>
        <h3 className="text-base sm:text-lg font-bold text-stone-900">{title}</h3>
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
