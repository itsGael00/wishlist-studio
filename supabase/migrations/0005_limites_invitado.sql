-- =====================================================================
-- Migración 0005: límites de velocidad para el invitado (semana 5)
-- Dónde va en el repo: supabase/migrations/0005_limites_invitado.sql
-- Cómo se aplica: copiar TODO y pegarlo en Supabase → SQL Editor → Run.
--
-- Qué resuelve (lista de seguridad 9.2: "acciones de invitado pasan por
-- servidor con validación + rate limit"):
--   Hasta ahora, quien tiene el código puede abrir MUCHAS sesiones (una
--   por navegador o ventana de incógnito) y apartar 5 regalos en cada
--   una. Un bromista o un bot podría vaciar la lista en un minuto.
--
-- La solución: contar cuántas acciones hace cada IP en cada evento y
-- frenarla si va demasiado rápido. Una persona normal nunca llega a
-- estos límites; un bot sí.
--
--   Acción                 Límite por IP y evento
--   entrar (sesión nueva)  20 por hora
--   apartar                10 cada 10 minutos
--   confirmar asistencia   20 cada 10 minutos
--   sugerir regalo         5 cada 10 minutos   (se usa en la migración 0006)
--
-- ¿Por qué tan "generosos"? Porque en una casa todos comparten la misma
-- IP (el mismo wifi). Si tu familia aparta desde 4 celulares en la sala,
-- debe funcionar.
--
-- Se puede correr antes o después de subir el código nuevo: las funciones
-- aceptan la IP como parámetro OPCIONAL, así que el código viejo sigue
-- funcionando mientras tanto.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Registro de acciones del invitado (para contar)
--    Solo guarda evento, IP, tipo y hora. Nada de nombres.
-- ---------------------------------------------------------------------
create table public.guest_actions (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references public.events (id) on delete cascade,
  ip         text not null check (char_length(ip) <= 100),
  kind       text not null check (kind in ('enter', 'reserve', 'rsvp', 'suggest')),
  created_at timestamptz not null default now()
);

create index guest_actions_lookup_idx on public.guest_actions (event_id, ip, kind, created_at);

-- Igual que access_attempts: RLS sin políticas y sin permisos.
-- Nadie la lee desde la app; solo las funciones de abajo.
alter table public.guest_actions enable row level security;
revoke all on public.guest_actions from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. guest_take_slot: "¿puede esta IP hacer una acción más?"
--    Si todavía no llega al límite, anota la acción y regresa true.
--    Si ya llegó, no anota nada y regresa false.
-- ---------------------------------------------------------------------
create or replace function public.guest_take_slot(p_event_id uuid, p_ip text, p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip     text := left(coalesce(nullif(p_ip, ''), 'desconocida'), 100);
  v_max    int;
  v_window interval;
  v_count  int;
begin
  case p_kind
    when 'enter'   then v_max := 20; v_window := interval '1 hour';
    when 'reserve' then v_max := 10; v_window := interval '10 minutes';
    when 'rsvp'    then v_max := 20; v_window := interval '10 minutes';
    when 'suggest' then v_max := 5;  v_window := interval '10 minutes';
    else return false;
  end case;

  -- Limpieza: lo de hace más de un día ya no sirve para contar.
  delete from public.guest_actions where created_at < now() - interval '1 day';

  select count(*) into v_count
  from public.guest_actions a
  where a.event_id = p_event_id
    and a.ip = v_ip
    and a.kind = p_kind
    and a.created_at > now() - v_window;

  if v_count >= v_max then
    return false;
  end if;

  insert into public.guest_actions (event_id, ip, kind) values (p_event_id, v_ip, p_kind);
  return true;
end;
$$;


-- =====================================================================
-- 3. Funciones del invitado con el límite nuevo
--    Son las mismas de la migración 0004 con UN cambio: antes de hacer
--    la acción piden un "lugar" con guest_take_slot. Si no hay, regresan
--    status "too_fast" y la página dice "Vas muy rápido".
-- =====================================================================

-- ---------- 3.1 Escribir el código de acceso ----------
-- Misma firma que antes (ya recibía la IP). Cambia solo el paso final:
-- abrir una sesión NUEVA cuenta para el límite; renovar una que ya
-- existía (el mismo navegador) no cuenta.
create or replace function public.guest_enter(
  p_invite_token text,
  p_code         text,
  p_ip           text,
  p_guest_token  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event      record;
  v_code       text;
  v_ip         text := left(coalesce(nullif(p_ip, ''), 'desconocida'), 100);
  v_hash       text := public.hash_guest_token(p_guest_token);
  v_fails_ip   int;
  v_fails_all  int;
begin
  select e.id, e.access_code, e.access_code_version
    into v_event
  from public.events e
  where e.invite_token = p_invite_token;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if coalesce(length(p_guest_token), 0) < 32 then
    return jsonb_build_object('status', 'error');
  end if;

  delete from public.access_attempts where created_at < now() - interval '1 day';

  select count(*) filter (where a.ip = v_ip), count(*)
    into v_fails_ip, v_fails_all
  from public.access_attempts a
  where a.event_id = v_event.id
    and a.created_at > now() - interval '15 minutes';

  if v_fails_ip >= 5 or v_fails_all >= 50 then
    return jsonb_build_object('status', 'blocked');
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_code <> v_event.access_code then
    insert into public.access_attempts (event_id, ip) values (v_event.id, v_ip);
    return jsonb_build_object('status', 'wrong', 'remaining', greatest(0, 4 - v_fails_ip));
  end if;

  -- NUEVO: ¿es un navegador que nunca había entrado? Entonces cuenta.
  if not exists (select 1 from public.guest_sessions s
                 where s.event_id = v_event.id and s.token_hash = v_hash) then
    if not public.guest_take_slot(v_event.id, v_ip, 'enter') then
      return jsonb_build_object('status', 'too_fast');
    end if;
  end if;

  delete from public.access_attempts a where a.event_id = v_event.id and a.ip = v_ip;

  insert into public.guest_sessions (event_id, token_hash, code_version)
  values (v_event.id, v_hash, v_event.access_code_version)
  on conflict (event_id, token_hash) do update
    set code_version = excluded.code_version,
        last_seen_at = now();

  return jsonb_build_object('status', 'ok');
end;
$$;


-- ---------- 3.2 Apartar un regalo ----------
-- La firma cambia (nuevo parámetro p_ip), así que primero borramos la
-- versión vieja. Si no, Postgres tendría DOS funciones con el mismo nombre.
drop function public.guest_reserve(text, text, uuid, text);

create function public.guest_reserve(
  p_invite_token text,
  p_guest_token  text,
  p_gift_id      uuid,
  p_guest_name   text,
  p_ip           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_hash     text := public.hash_guest_token(p_guest_token);
  v_name     text := btrim(coalesce(p_guest_name, ''));
begin
  v_event_id := public.guest_event_access(p_invite_token, p_guest_token);
  if v_event_id is null then
    return jsonb_build_object('status', 'no_access');
  end if;

  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not exists (select 1 from public.gifts g
                 where g.id = p_gift_id and g.event_id = v_event_id and not g.is_hidden) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if (select count(*) from public.reservations r
      where r.event_id = v_event_id and r.guest_token_hash = v_hash) >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  -- NUEVO: límite por IP (10 apartados cada 10 min).
  if not public.guest_take_slot(v_event_id, p_ip, 'reserve') then
    return jsonb_build_object('status', 'too_fast');
  end if;

  begin
    insert into public.reservations (gift_id, event_id, guest_name, guest_token_hash)
    values (p_gift_id, v_event_id, v_name, v_hash);
  exception when unique_violation then
    return jsonb_build_object('status', 'taken');
  end;

  update public.guest_sessions set guest_name = v_name
  where event_id = v_event_id and token_hash = v_hash;

  return jsonb_build_object('status', 'ok');
end;
$$;


-- ---------- 3.3 Confirmar (o cambiar) asistencia ----------
drop function public.guest_rsvp(text, text, text, text, int, text);

create function public.guest_rsvp(
  p_invite_token text,
  p_guest_token  text,
  p_guest_name   text,
  p_status       text,
  p_companions   int,
  p_note         text,
  p_ip           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id   uuid;
  v_hash       text := public.hash_guest_token(p_guest_token);
  v_name       text := btrim(coalesce(p_guest_name, ''));
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_companions int  := coalesce(p_companions, 0);
  v_settings   record;
begin
  v_event_id := public.guest_event_access(p_invite_token, p_guest_token);
  if v_event_id is null then
    return jsonb_build_object('status', 'no_access');
  end if;

  if char_length(v_name) not between 1 and 80
     or p_status not in ('yes', 'no', 'maybe')
     or char_length(coalesce(v_note, '')) > 500 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select s.allow_companions, s.max_companions into v_settings
  from public.event_settings s where s.event_id = v_event_id;

  if p_status = 'no' then
    v_companions := 0;
  end if;

  if v_companions < 0
     or (not v_settings.allow_companions and v_companions <> 0)
     or (v_settings.allow_companions and v_companions > v_settings.max_companions) then
    return jsonb_build_object('status', 'invalid_companions');
  end if;

  -- NUEVO: límite por IP (20 confirmaciones o cambios cada 10 min).
  if not public.guest_take_slot(v_event_id, p_ip, 'rsvp') then
    return jsonb_build_object('status', 'too_fast');
  end if;

  insert into public.rsvps (event_id, guest_name, status, companions, note, guest_token_hash)
  values (v_event_id, v_name, p_status, v_companions, v_note, v_hash)
  on conflict (event_id, guest_token_hash) do update
    set guest_name = excluded.guest_name,
        status     = excluded.status,
        companions = excluded.companions,
        note       = excluded.note;

  update public.guest_sessions set guest_name = v_name
  where event_id = v_event_id and token_hash = v_hash;

  return jsonb_build_object('status', 'ok');
end;
$$;


-- =====================================================================
-- 4. Permisos (igual que en 0004: solo la llave secreta del servidor)
--    Al borrar y crear de nuevo una función, Postgres le vuelve a dar
--    permiso a PUBLIC, así que hay que quitarlo otra vez.
-- =====================================================================
revoke execute on function public.guest_take_slot(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.guest_enter(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.guest_reserve(text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.guest_rsvp(text, text, text, text, int, text, text) from public, anon, authenticated;

grant execute on function public.guest_enter(text, text, text, text) to service_role;
grant execute on function public.guest_reserve(text, text, uuid, text, text) to service_role;
grant execute on function public.guest_rsvp(text, text, text, text, int, text, text) to service_role;
