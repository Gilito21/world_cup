-- ============================================================
-- Unifica todos los miembros a modo GLOBAL (un único pronóstico compartido)
-- ============================================================
-- El modo per_league nació para permitir pronósticos distintos por liga, pero
-- en la práctica ningún usuario per_league está en más de una liga, así que
-- solo aporta complejidad (doble ámbito de cálculo, copy_predictions, riesgo
-- de doble conteo). El selector de modo ya ni siquiera está conectado en la UI
-- y los nuevos miembros entran en 'global' por defecto (migración 037).
--
-- Esta migración promueve los pronósticos de los 74 usuarios per_league al
-- ámbito global (league_id = NULL) y los deja a todos en 'global'. Como el
-- ranking ya puntúa a esos usuarios con su set de liga, reetiquetar ese mismo
-- set a global NO cambia los puntos de nadie (verificado con checksum de
-- profiles.total_points antes/después).
--
-- NOTA: borra los pronósticos "fantasma" en ámbito global de esos usuarios
-- (restos de copy_predictions que nunca puntuaron) para que el set global
-- resultante sea idéntico al de liga. Migración destructiva, autorizada.

-- 1. Elimina restos NULL previos de los usuarios per_league. Su set autoritativo
--    es el de la liga; cualquier fila global suya es un duplicado obsoleto.
DELETE FROM predictions p
USING league_members lm
WHERE lm.user_id = p.user_id
  AND lm.prediction_mode = 'per_league'
  AND p.league_id IS NULL;

DELETE FROM special_predictions sp
USING league_members lm
WHERE lm.user_id = sp.user_id
  AND lm.prediction_mode = 'per_league'
  AND sp.league_id IS NULL;

DELETE FROM advance_points ap
USING league_members lm
WHERE lm.user_id = ap.user_id
  AND lm.prediction_mode = 'per_league'
  AND ap.league_id IS NULL;

DELETE FROM prediction_submissions ps
USING league_members lm
WHERE lm.user_id = ps.user_id
  AND lm.prediction_mode = 'per_league'
  AND ps.league_id IS NULL;

-- 2. Promueve a ámbito global las filas de liga de esos usuarios.
--    (Cada per_league está en una sola liga → un único lm por usuario, sin
--    multiplicación de filas ni conflicto con los índices únicos globales.)
UPDATE predictions p
SET league_id = NULL
FROM league_members lm
WHERE lm.user_id = p.user_id
  AND lm.prediction_mode = 'per_league'
  AND p.league_id = lm.league_id;

UPDATE special_predictions sp
SET league_id = NULL
FROM league_members lm
WHERE lm.user_id = sp.user_id
  AND lm.prediction_mode = 'per_league'
  AND sp.league_id = lm.league_id;

UPDATE advance_points ap
SET league_id = NULL
FROM league_members lm
WHERE lm.user_id = ap.user_id
  AND lm.prediction_mode = 'per_league'
  AND ap.league_id = lm.league_id;

UPDATE prediction_submissions ps
SET league_id = NULL
FROM league_members lm
WHERE lm.user_id = ps.user_id
  AND lm.prediction_mode = 'per_league'
  AND ps.league_id = lm.league_id;

-- 3. Todos los miembros pasan a modo global.
UPDATE league_members
SET prediction_mode = 'global'
WHERE prediction_mode <> 'global';

-- 4. Recalcula total_points (idéntico: ahora todo el set vive en ámbito global).
UPDATE profiles
SET total_points = compute_user_total_points(id);
