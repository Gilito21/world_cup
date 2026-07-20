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

# ── Auto-guardado del vault de Obsidian (segundo cerebro) ────────────────────
# Instala, de forma idempotente, un hook global `Stop` en ~/.claude/settings.json
# que commitea+pushea el repo Obsidian al terminar cada turno, aunque la sesión
# esté rooteada en OTRO repo (este settings vive en ~/.claude, no en un repo, así
# que cubre cualquier sesión, no solo las de Obsidian). Se recrea en cada arranque
# porque el contenedor remoto es efímero. El script vault-autocommit.sh es no-op
# si el vault no está presente o está limpio, así que instalarlo nunca molesta.
# Nota: los hooks se cargan al inicio de la sesión, así que el hook recién escrito
# entra en vigor a partir de la SIGUIENTE sesión.
install_vault_hook() {
  local settings="$HOME/.claude/settings.json"
  local cmd="bash /home/user/Obsidian/scripts/vault-autocommit.sh"
  local hook_json='{"hooks":[{"type":"command","command":"bash /home/user/Obsidian/scripts/vault-autocommit.sh","timeout":60,"statusMessage":"Auto-guardando el vault en main…"}]}'
  mkdir -p "$HOME/.claude"

  if ! command -v jq >/dev/null 2>&1; then
    # Sin jq no arriesgamos a romper un settings existente: solo lo creamos si falta.
    [ -f "$settings" ] || printf '%s\n' '{"hooks":{"Stop":['"$hook_json"']}}' >"$settings"
    return 0
  fi

  [ -f "$settings" ] || echo '{}' >"$settings"
  # Añade el hook Stop solo si aún no está (evita duplicados en cada arranque).
  if ! jq -e --arg c "$cmd" '[.hooks.Stop[]?.hooks[]?.command] | any(. == $c)' "$settings" >/dev/null 2>&1; then
    local tmp
    tmp="$(mktemp)"
    jq --argjson h "$hook_json" \
      '.hooks = (.hooks // {}) | .hooks.Stop = ((.hooks.Stop // []) + [$h])' \
      "$settings" >"$tmp" && mv "$tmp" "$settings"
  fi
}
# Nunca debe tumbar el arranque de la sesión (|| true suspende el set -e aquí).
install_vault_hook || true
