-- ============================================================
-- 056 — RLS en las tablas de backup (cerrar exposición por el API)
-- ============================================================
-- Las tablas de backup (creadas para poder revertir durante el torneo) están
-- en el schema public (expuesto a PostgREST) con RLS desactivado y permisos
-- abiertos a anon/authenticated. La anon key es pública (va en el cliente),
-- así que cualquiera podía LEER predicciones/puntos de todos e incluso
-- borrar/TRUNCAR los backups por el API.
--
-- Fix: activar RLS sin políticas → anon/authenticated quedan sin acceso;
-- service_role (scripts/SQL/MCP) salta RLS y sigue pudiendo consultarlas.
-- No borra datos; solo cierra el acceso público. Son tablas internas.

ALTER TABLE public.backup_kg_predictions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_kg_matches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_kg_advance_points    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_kg_profiles_points   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions_r32_backup_048  ENABLE ROW LEVEL SECURITY;

-- Además, revocar los permisos abiertos (defensa en profundidad; con RLS ya no
-- bastarían, pero mejor no tenerlos).
REVOKE ALL ON public.backup_kg_predictions      FROM anon, authenticated;
REVOKE ALL ON public.backup_kg_matches          FROM anon, authenticated;
REVOKE ALL ON public.backup_kg_advance_points   FROM anon, authenticated;
REVOKE ALL ON public.backup_kg_profiles_points  FROM anon, authenticated;
REVOKE ALL ON public.predictions_r32_backup_048 FROM anon, authenticated;
