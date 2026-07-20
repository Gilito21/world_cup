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
- `supabase/migrations/NNN_<slug>.sql` — append-only, siempre el siguiente número libre (hoy va por 046)
- `supabase/functions/<name>/` — edge functions
- `supabase/auth-templates/` — fuente; compilar con `npm run build-auth-templates`
- `scripts/` — jobs corridos por GitHub Actions; muchos soportan `--preview` / `--dry-run`
- `.github/workflows/` — yo los mantengo, **no tocar sin avisar**
- `.claude/hooks/session-start.sh` — hook de arranque (instala deps en sesiones web). Ver "Setup de sesiones".

**Comandos**: `npm run dev | build | preview | seed-matches | update-results | send-reminders | send-daily-digest | send-brand-samples | build-auth-templates | generate-icons`.

## Infraestructura y jobs programados

Para no tener que inspeccionar Supabase cada sesión, aquí está el estado de lo que corre solo. Si cambias algo de esto, **actualiza esta sección**.

**Supabase** — proyecto `World_Cup`, id `jpbbxrlrkavuckghwzpz`.

**Edge functions desplegadas** (`supabase/functions/`):
- `update-results` — actualiza la tabla `matches` desde football-data.org (1 llamada por run). `verify_jwt=false`.
- `create-league-payment`, `confirm-league-payment`, `create-league-free` — alta de ligas (Stripe / gratis).
- `notify-new-user`, `send-reminder`, `report-issue` — notificaciones y soporte.

**Actualización de resultados (real-time):** la dispara **`pg_cron` (job `update-match-results-1min`), cada minuto** (`* * * * *`) vía `pg_net` → `http_post` a la edge function `update-results`. **No** lo dispara GitHub Actions. El trigger `on_match_finished` recalcula puntos de pronóstico al cambiar `matches`. El schedule está trazado en `supabase/migrations/043_pg_cron_update_results_every_minute.sql`; para cambiar la cadencia, crea una migración nueva con `cron.unschedule` + `cron.schedule` (o `cron.alter_job` por `jobid`).
  - Coste a 1/min: ~1.440 llamadas/día a football-data (límite free tier 10/min) y ~43K invocaciones edge/mes (límite free 500K/mes). Holgado.

**GitHub Actions** (`.github/workflows/`):
- `update-results.yml` — **cada hora**, solo de backup y para recalcular `advance_points` (bonus de avance de ronda; la edge function no los toca).
- `send-daily-digest.yml` — resumen diario, `06:30 UTC`. Idempotente vía tabla `daily_digests` (PK `user_id+digest_date`).
- `seed-matches.yml` — **diario `05:00 UTC`** (+ manual). Upsert idempotente de partidos desde football-data y, al traer los equipos reales de una ronda KO, reconcilia el cuadro: `scripts/reconcile-bracket.js` fija `matches.bracket_match_id` y recoloca las predicciones de esa ronda (vía SQL `apply_bracket_round_remap`), y recalcula `advance_points`. Solo toca rondas sin `bracket_match_id`; aborta una ronda sin escribir si los equipos no cuadran con la plantilla. `bracket_match_id` es la fuente de verdad del mapeo partido↔hueco del bracket (no se deriva en runtime).
- `send-reminders.yml`, `send-league-intent-reminders.yml`, `resolve-prizes.yml`, `test-email.yml` — el resto de jobs.

## Setup de sesiones (Claude Code on the web)

- Al abrir una sesión web, el hook `SessionStart` (`.claude/hooks/session-start.sh`, registrado en `.claude/settings.json`) corre `npm install` automáticamente. No hace falta pedir que instale dependencias.
- El hook solo actúa en remoto (`CLAUDE_CODE_REMOTE=true`); en local hace early-return.
- Además de `npm install`, el hook instala (idempotente) un hook global `Stop` en `~/.claude/settings.json` que auto-commitea+pushea el vault de Obsidian (`/home/user/Obsidian`) al terminar cada turno, para no depender de que la sesión esté rooteada en el repo Obsidian. Se recrea en cada arranque porque el contenedor es efímero, y entra en vigor a partir de la siguiente sesión (los hooks se cargan al inicio).
- Es **síncrono**: la sesión arranca con las deps ya listas. Para cambiarlo a async (arranque más rápido, con riesgo de carrera), añadir `echo '{"async": true, "asyncTimeout": 300000}'` al principio del script.
- El estado de Supabase (edge functions, cron) está documentado arriba; léelo antes de consultarlo por MCP.

## Reglas duras

- **Nunca disparar `scripts/send-*` ni `npm run send-*` contra usuarios reales sin que lo pida explícitamente.** Para probar siempre `--preview jpelaez@bluebullpartners.com` o `--dry-run`.
- **Migraciones SQL son append-only**: nunca editar una migración ya aplicada; crear una nueva con el siguiente número.
- **Service role key solo en backend / scripts / Actions**, jamás en código cliente. Anon key en cliente.
- Tabla nueva → RLS sí o sí. Ante la duda, `get_advisors`.
- **Este repo es JavaScript puro (JSX), sin tipos generados de Supabase.** No hay `tsconfig.json`, ningún `database.types.ts`, y `createClient` se usa sin tipar. Un schema change NO requiere regenerar tipos: el acceso a datos es dinámico (nombres de columna como strings, resueltos en runtime). No ofrezcas "regenerar tipos TS" salvo que en el futuro se migre a TypeScript con tipos generados.
- No crear PR salvo petición explícita.

## Antes de cambios de scoring o schema

Lee las migraciones relevantes para no romper invariantes:
- `004_prediction_lock.sql`, `006_lock_window.sql` — cierre de pronósticos
- `011_tiebreaker.sql`, `012_special_predictions.sql` — extras y desempates
- `025_copy_predictions_atomic.sql`, `026_on_match_finished_special_points.sql` — cálculo de puntos
- `021_feed_and_postmortem.sql` — feed/postmortem

## Extras (preguntas especiales)

Las `special_questions` (`mbappe_vs_lamine`, `top_scorer` = MVP, `total_cards_weighted`) no tienen campo de marcador en vivo: el conteo "hasta ahora" se mete a mano en la `description` vía migración (patrón de 015/017/046).

**Cuando te pida "actualizar el extra"/"actualizar la página de extra", actualiza goles Y tarjetas, ambos desde la API de ESPN (la web `espndeportes.espn.com/.../liga/FIFA.WORLD/...` es JS y viene vacía por scraping directo).** Fuente única para los dos:

1. Lista de partidos jugados: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=AAAAMMDD-AAAAMMDD&limit=200` → quédate con los eventos `status.type.completed`.
2. Por cada evento, el acta: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=<id>`.

- **Goles** (`mbappe_vs_lamine`): suma por jugador los `keyEvents` con `scoringPlay=true` y `type.type=='goal'` (excluye los que el `text` diga "own goal"); el goleador es `participants[0].athlete.displayName`. Filtra "Kylian Mbappé" y "Lamine Yamal". Captura a los de 1 gol (la tabla top-20 de 365scores no los muestra). Verificado 23-jun-2026: Mbappé 4, Lamine 1 (top: Messi 5).
- **Tarjetas** (`total_cards_weighted`): suma `boxscore.teams[].statistics` (`yellowCards`, `redCards`) de cada acta. El valor de la pregunta es **amarillas + 2 × rojas**.

## Estilo de código

- Copy de UI en español, tono coloquial (ver `src/pages/Reglas.jsx`, `src/pages/Landing.jsx`).
- Sin comentarios salvo que el *por qué* no sea obvio.
- No introducir abstracciones especulativas: tres líneas similares > abstracción prematura.
