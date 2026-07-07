-- ============================================================
-- 057 — Endurecimiento: search_path fijo + revocar EXECUTE de triggers
-- ============================================================
-- (a) Fijar search_path en funciones que no lo tenían (evita search_path
--     injection, sobre todo en las SECURITY DEFINER).
-- (b) Revocar EXECUTE a anon/authenticated en funciones que NO son RPC de
--     cliente: los triggers (se disparan por DML, no por EXECUTE — revocarlo
--     no afecta a que el trigger funcione) y funciones de backend
--     (resolve_special_question, recalc_total_points_for_users, que corren vía
--     service_role). Los RPC que llama el cliente (global_standings,
--     league_standings, match_consensus*, match_postmortem_v1, league_feed_v1,
--     copy_predictions_v1) NO se tocan.

-- (a) search_path fijo
ALTER FUNCTION public.calculate_points(integer, integer, integer, integer) SET search_path = public, pg_catalog;
ALTER FUNCTION public.resolve_special_question(text)                        SET search_path = public, pg_catalog;
ALTER FUNCTION public.check_league_member_limit()                           SET search_path = public, pg_catalog;
ALTER FUNCTION public.prevent_founder_self_promotion()                      SET search_path = public, pg_catalog;
ALTER FUNCTION public.set_updated_at()                                      SET search_path = public, pg_catalog;

-- (b) Revocar EXECUTE (triggers)
REVOKE EXECUTE ON FUNCTION public.on_match_finished()                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_profile_company()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_league_member_limit()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_prediction_deadline()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_prediction_global_cutoff()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_special_prediction_deadline() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_founder_self_promotion()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                    FROM anon, authenticated;

-- (b) Revocar EXECUTE (backend-only, corren vía service_role)
REVOKE EXECUTE ON FUNCTION public.recalc_total_points_for_users(uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_special_question(text)        FROM anon, authenticated;
