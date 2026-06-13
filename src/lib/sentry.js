// Inicialización opcional de Sentry para captura de errores en producción.
//
// Setup (una vez):
//   1) Crear cuenta gratis en https://sentry.io → nuevo proyecto "React".
//   2) Copiar el DSN (pinta tipo https://abc@o123.ingest.sentry.io/456).
//   3) Pegarlo en Render como envVar VITE_SENTRY_DSN y redeploy.
//
// Sin DSN, esta función es no-op y @sentry/react NO se descarga en el
// bundle del cliente (el import dinámico solo se ejecuta si hay DSN).
export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    ignoreErrors: [
      // Ruido de extensiones de navegador (LastPass, gestores de contraseñas, etc.)
      /Object Not Found Matching Id/,
      // Stripe.js bloqueado por content blockers (no es un error de la app)
      'Failed to load Stripe.js',
      // Google Translate / Grammarly modifican el DOM y rompen la reconciliación de React
      /removeChild/,
      // Safari/Chrome extensions usando WebExtension API (runtime.sendMessage, Tab not found)
      /runtime\.sendMessage/,
    ],
  })
}
