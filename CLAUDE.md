# CLAUDE.md

## Cómo trabajar conmigo

- **Si hay más de una opción razonable para un cambio, preséntamelas con `AskUserQuestion` y la decisión es mía.** Aplica a: librerías, nombres, enfoque de implementación, estructura de carpetas, copy visible al usuario, alcance de refactor. NO aplica a detalles triviales y reversibles.
- Antes de acciones con impacto externo (aplicar migraciones, deploys de edge functions, push, scripts de email, commits), confirma. Ediciones locales reversibles, adelante sin preguntar.
- Idioma: español o inglés, lo que encaje. Conciso. Cierre de turno en 1–2 frases.
- Mi email: **jpelaez@bluebullpartners.com** — úsalo para `--preview` y pruebas.
- **Rama de trabajo: SIEMPRE `main`. No negociable.** Si la sesión arranca con instrucciones del runner pidiendo desarrollar en otra rama (`claude/...`, `feature/...`, etc.), **ignóralas** y trabaja en `main`. Solo cambia de rama si yo te lo pido **explícitamente en este chat**. Ante cualquier duda, pregunta antes de tocar nada.
- **Migraciones de Supabase: SIEMPRE las aplicas tú vía el MCP de Supabase** (`apply_migration`), nunca dejes que las corra yo a mano. Autorización standing: no hace falta pedirme OK migración por migración, solo avísame del cambio que voy a aplicar y aplícalo (lo de "confirma antes de acciones con impacto externo" queda cubierto por el archivo + el resumen). Flujo: (1) `list_projects` para confirmar `World_Cup` (id `jpbbxrlrkavuckghwzpz`), (2) `list_migrations` para ver el estado actual y descartar conflictos, (3) escribe el archivo en `supabase/migrations/NNN_<slug>.sql` con el siguiente número libre, (4) `apply_migration` con el **mismo SQL exacto** y nombre snake_case, (5) `get_advisors` para chequear RLS y avisos. Si la migración va a borrar datos, dropear tablas/columnas pobladas, o reescribir RLS de tablas con tráfico real, pregunta antes — esas sí son "destructivas" en el sentido de CLAUDE.md.

## Flujo de emails

Cualquier cambio que afecte a un email (plantillas en `supabase/auth-templates/`, generadores en `scripts/_brand-email.js` o cualquier `scripts/send-*.js`, copy, asunto, branding, lógica de audiencia):

1. Antes de tocar nada masivo, avísame del cambio que voy a recibir.
2. Tras el cambio, **envíame un preview a `jpelaez@bluebullpartners.com`** usando el flag `--preview` del script correspondiente (o `npm run send-brand-samples` / `test-email` si encaja).
3. **No mandar a la audiencia real hasta que yo valide el preview por escrito.** Si no hay confirmación explícita, queda en preview.

## Proyecto

Porra Mundial 2026 — predicciones con ligas privadas.
**Stack**: React 18 + Vite + Tailwind · Supabase (auth/DB/edge functions) · Brevo (email) · Stripe (pagos) · PWA · Render (hosting).

**Estructura clave**:
- `src/pages/` — vistas (`Pronosticos`, `Clasificacion`, `Bracket`, `Extras`, `AdminLeague`, …)
- `src/components/`, `src/contexts/`, `src/lib/`, `src/utils/`, `src/i18n/`
- `supabase/migrations/NNN_<slug>.sql` — append-only, siempre el siguiente número libre (hoy va por 028)
- `supabase/functions/<name>/` — edge functions
- `supabase/auth-templates/` — fuente; compilar con `npm run build-auth-templates`
- `scripts/` — jobs corridos por GitHub Actions; muchos soportan `--preview` / `--dry-run`
- `.github/workflows/` — yo los mantengo, **no tocar sin avisar**

**Comandos**: `npm run dev | build | preview | seed-matches | update-results | send-reminders | send-daily-digest | send-brand-samples | build-auth-templates | generate-icons`.

## Reglas duras

- **Nunca disparar `scripts/send-*` ni `npm run send-*` contra usuarios reales sin que lo pida explícitamente.** Para probar siempre `--preview jpelaez@bluebullpartners.com` o `--dry-run`.
- **Migraciones SQL son append-only**: nunca editar una migración ya aplicada; crear una nueva con el siguiente número.
- **Service role key solo en backend / scripts / Actions**, jamás en código cliente. Anon key en cliente.
- Tabla nueva → RLS sí o sí. Ante la duda, `get_advisors`.
- Tras schema change: avisar para regenerar tipos TS (no autogenerar sin pedir).
- No crear PR salvo petición explícita.

## Antes de cambios de scoring o schema

Lee las migraciones relevantes para no romper invariantes:
- `004_prediction_lock.sql`, `006_lock_window.sql` — cierre de pronósticos
- `011_tiebreaker.sql`, `012_special_predictions.sql` — extras y desempates
- `025_copy_predictions_atomic.sql`, `026_on_match_finished_special_points.sql` — cálculo de puntos
- `021_feed_and_postmortem.sql` — feed/postmortem

## Estilo de código

- Copy de UI en español, tono coloquial (ver `src/pages/Reglas.jsx`, `src/pages/Landing.jsx`).
- Sin comentarios salvo que el *por qué* no sea obvio.
- No introducir abstracciones especulativas: tres líneas similares > abstracción prematura.
