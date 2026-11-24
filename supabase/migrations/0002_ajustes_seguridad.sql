-- =====================================================================
-- Migración 0002: ajustes de seguridad pedidos por el Security Advisor
-- Dónde va en el repo: supabase/migrations/0002_ajustes_seguridad.sql
--
-- Qué pasaba: en Postgres, toda función nueva se puede ejecutar por
-- cualquiera (rol PUBLIC). Supabase expone las funciones como URLs
-- (/rest/v1/rpc/...), así que un visitante podría llamarlas directo.
-- Las funciones "security definer" corren con permisos de administrador,
-- por eso el Advisor avisa.
-- =====================================================================
 
-- 1. Funciones de trigger: solo las dispara la base de datos, nadie
--    necesita llamarlas a mano. Quitamos el permiso a todos.
--    (Los triggers siguen funcionando: no necesitan este permiso.)
revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.handle_new_event() from public, anon, authenticated;
revoke execute on function public.set_updated_at()   from public, anon, authenticated;
 
-- 2. rls_auto_enable() la creó Supabase al marcar "Enable RLS on new
--    tables automatically". La dispara la base de datos sola; tampoco
--    debe poder llamarla nadie desde la app.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
 
-- 3. is_event_owner() se usa dentro de las políticas RLS, así que el
--    anfitrión (authenticated) sí debe poder ejecutarla. Pero no necesita
--    permisos de administrador: la cambiamos a "security invoker"
--    (corre con los permisos de quien la llama, y RLS de events ya
--    limita a sus propios eventos).
alter function public.is_event_owner(uuid) security invoker;
revoke execute on function public.is_event_owner(uuid) from public, anon;
grant  execute on function public.is_event_owner(uuid) to authenticated;
 