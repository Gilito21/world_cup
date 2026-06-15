#!/bin/bash
# SessionStart hook — Porra Mundial 2026.
# Deja el contenedor listo en cuanto arranca una sesión de Claude Code en la web:
# instala las dependencias de npm para que dev/build y los scripts de
# scripts/ (update-results, send-daily-digest, …) funcionen sin pasos manuales.
set -euo pipefail

# Solo en el entorno remoto (Claude Code on the web). En local no toca nada.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install (no ci) para aprovechar el cache del contenedor entre sesiones.
npm install --no-audit --no-fund
