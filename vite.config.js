import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Porra Mundial 2026',
        short_name: 'Porra 2026',
        description: 'La porra del Mundial 2026. Predice marcadores y compite con tus amigos.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1c1917',
        theme_color: '#f59e0b',
        categories: ['sports', 'games', 'entertainment'],
        icons: [
          { src: '/pwa-192x192.png',  sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png',  sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // No precache la respuesta de Supabase: solo el shell estático.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Fuentes de Google (CSS + woff2)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Banderas SVG de flagcdn / flagsapi (si se usan en runtime)
            urlPattern: /^https:\/\/(flagcdn\.com|flagsapi\.com|.*\.flagcdn\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'flags',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // NOTA: NO cacheamos /rest/v1/ de Supabase con NetworkFirst.
          // Lo intentamos antes y causaba colgones de 6-8s por query: el SW
          // esperaba networkTimeoutSeconds=6, caía a cache (vacío o con
          // respuestas malformadas), y supabase-js no podía parsearlas.
          // Resultado: cada visibilitychange → SIGNED_IN → fetchProfile que
          // se colgaba 8s, y loadLeagues que NUNCA devolvía datos →
          // "no estás en ninguna liga". Las queries van directas a la red;
          // sq() ya tiene timeout de 8s como red de seguridad, y los caches
          // en memoria (matchCache, dataCache) cubren la UX de navegación.
        ],
      },
      devOptions: {
        // Permite probar la PWA en `vite dev` (sin precache para no
        // mantener un service worker pegado entre cambios).
        enabled: false,
        type: 'module',
      },
    }),
  ],
})
