-- =====================================================================
-- Migración 0004: vista del invitado (semana 4)
-- Dónde va en el repo: supabase/migrations/0004_vista_invitado.sql
-- Cómo se aplica: copiar TODO y pegarlo en Supabase → SQL Editor → Run.
--
-- Idea clave: el invitado NO tiene cuenta ni permisos en la base de datos.
-- Todo lo que hace (escribir el código, ver regalos, apartar, confirmar)
-- pasa por el servidor de Next.js, que llama a las funciones de abajo con
-- la llave secreta de Supabase. Esas funciones son las ÚNICAS puertas de
-- entrada y cada una revisa por su cuenta que el invitado tenga acceso.
--
-- Cómo sabe la base de datos quién es el invitado:
--   1. Al escribir bien el código, el servidor genera un token aleatorio
--      y lo guarda en una cookie httpOnly del navegador del invitado.
--   2. Aquí solo guardamos el HASH de ese token (como con contraseñas).
--   3. Cada sesión recuerda con qué versión del código entró. Si el
--      anfitrión genera un código nuevo, la versión sube y la sesión deja
--      de valer... SALVO que ese invitado ya haya apartado algo o
--      confirmado asistencia (decisión del 24 nov 2026, RN-06).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Sesiones de invitado
-- ---------------------------------------------------------------------
create table public.guest_sessions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  token_hash   text not null,
  code_version int not null,
  -- El último nombre que usó, para rellenar los formularios por él.
  guest_name   text check (char_length(guest_name) between 1 and 80),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (event_id, token_hash)
);


-- ---------------------------------------------------------------------
-- 2. Intentos FALLIDOS de código (para el límite de intentos)
--    Regla (sección 9.1): máx. 5 fallos por IP + evento cada 15 minutos.
--    Además, máx. 50 fallos por evento entre TODAS las IPs, por si alguien
--    prueba desde muchas IPs distintas.
-- ---------------------------------------------------------------------
create table public.access_attempts (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references public.events (id) on delete cascade,
  ip         text not null check (char_length(ip) <= 100),
  created_at timestamptz not null default now()
);

create index access_attempts_lookup_idx on public.access_attempts (event_id, ip, created_at);


-- ---------------------------------------------------------------------
-- 3. Índices nuevos en tablas existentes
-- ---------------------------------------------------------------------
-- Una sola confirmación de asistencia por invitado (por navegador) y evento.
-- Si vuelve a confirmar, se ACTUALIZA la que ya tenía.
create unique index rsvps_event_guest_uniq on public.rsvps (event_id, guest_token_hash);
-- Para encontrar rápido "los apartados de este invitado".
create index reservations_event_guest_idx on public.reservations (event_id, guest_token_hash);


-- ---------------------------------------------------------------------
-- 4. RLS en las tablas nuevas, SIN políticas y SIN permisos:
--    nadie las lee ni escribe desde la app. Solo las funciones de abajo.
-- ---------------------------------------------------------------------
alter table public.guest_sessions  enable row level security;
alter table public.access_attempts enable row level security;
revoke all on public.guest_sessions  from public, anon, authenticated;
revoke all on public.access_attempts from public, anon, authenticated;


-- =====================================================================
-- 5. Funciones auxiliares (internas: nadie de afuera puede llamarlas)
-- =====================================================================

-- Hash SHA-256 del token del invitado, en hexadecimal.
create or replace function public.hash_guest_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ¿Este invitado puede entrar a este evento? Regresa el id del evento si sí,
-- o null si no (token desconocido, código viejo sin haber interactuado, etc.).
create or replace function public.guest_event_access(p_invite_token text, p_guest_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.events e
  join public.guest_sessions s
    on s.event_id = e.id
   and s.token_hash = public.hash_guest_token(p_guest_token)
  where e.invite_token = p_invite_token
    and (
      -- Entró con el código vigente...
      s.code_version = e.access_code_version
      -- ...o ya apartó algo...
      or exists (select 1 from public.reservations r
                 where r.event_id = e.id and r.guest_token_hash = s.token_hash)
      -- ...o ya confirmó asistencia.
      or exists (select 1 from public.rsvps v
                 where v.event_id = e.id and v.guest_token_hash = s.token_hash)
    );
$$;


-- =====================================================================
-- 6. Funciones para el invitado (las llama SOLO el servidor de Next.js)
--    Todas regresan un JSON con "status" para que la página sepa qué
--    mensaje mostrar. Ninguna lanza errores con detalles internos.
-- =====================================================================

-- ---------- 6.1 Escribir el código de acceso ----------
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

  -- Limpieza: los intentos de hace más de un día ya no sirven para nada.
  delete from public.access_attempts where created_at < now() - interval '1 day';

  select count(*) filter (where a.ip = v_ip), count(*)
    into v_fails_ip, v_fails_all
  from public.access_attempts a
  where a.event_id = v_event.id
    and a.created_at > now() - interval '15 minutes';

  if v_fails_ip >= 5 or v_fails_all >= 50 then
    return jsonb_build_object('status', 'blocked');
  end if;

  -- "r37-akl", "R37 AKL" y "R37AKL" valen lo mismo.
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_code <> v_event.access_code then
    insert into public.access_attempts (event_id, ip) values (v_event.id, v_ip);
    return jsonb_build_object('status', 'wrong', 'remaining', greatest(0, 4 - v_fails_ip));
  end if;

  -- Código correcto: borramos sus fallos y abrimos (o renovamos) su sesión.
  delete from public.access_attempts a where a.event_id = v_event.id and a.ip = v_ip;

  insert into public.guest_sessions (event_id, token_hash, code_version)
  values (v_event.id, public.hash_guest_token(p_guest_token), v_event.access_code_version)
  on conflict (event_id, token_hash) do update
    set code_version = excluded.code_version,
        last_seen_at = now();

  return jsonb_build_object('status', 'ok');
end;
$$;


-- ---------- 6.2 Ver la página del evento ----------
-- RN-06b: sin acceso NO regresa ningún dato del evento.
-- RN-03:  nunca regresa nombres de otros invitados; solo marca "mine"
--         en los regalos que apartó ESTE invitado.
create or replace function public.guest_page(p_invite_token text, p_guest_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id    uuid;
  v_hash        text := public.hash_guest_token(p_guest_token);
  v_show_prices boolean;
  v_result      jsonb;
begin
  if not exists (select 1 from public.events e where e.invite_token = p_invite_token) then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_event_id := public.guest_event_access(p_invite_token, p_guest_token);
  if v_event_id is null then
    return jsonb_build_object('status', 'need_code');
  end if;

  update public.guest_sessions
  set last_seen_at = now()
  where event_id = v_event_id and token_hash = v_hash;

  select s.show_prices into v_show_prices
  from public.event_settings s where s.event_id = v_event_id;

  select jsonb_build_object(
    'status', 'ok',
    'event', (
      select jsonb_build_object(
        'title', e.title,
        'description', e.description,
        'starts_at', e.starts_at,
        'location_text', e.location_text)
      from public.events e where e.id = v_event_id),
    'settings', (
      select jsonb_build_object(
        'show_prices', s.show_prices,
        'allow_companions', s.allow_companions,
        'max_companions', s.max_companions,
        'welcome_message', s.welcome_message)
      from public.event_settings s where s.event_id = v_event_id),
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'description', g.description,
          -- Si "Mostrar precios" está apagado, el precio ni sale de aquí.
          'price_estimate', case when coalesce(v_show_prices, true) then g.price_estimate end,
          'store_url', g.store_url,
          'reserved', r.id is not null,
          'mine', coalesce(r.guest_token_hash = v_hash, false))
        order by g.position, g.created_at)
      from public.gifts g
      left join public.reservations r on r.gift_id = g.id
      where g.event_id = v_event_id and not g.is_hidden), '[]'::jsonb),
    'my_rsvp', (
      select jsonb_build_object(
        'guest_name', v.guest_name,
        'status', v.status,
        'companions', v.companions,
        'note', v.note)
      from public.rsvps v
      where v.event_id = v_event_id and v.guest_token_hash = v_hash),
    'my_name', (
      select gs.guest_name from public.guest_sessions gs
      where gs.event_id = v_event_id and gs.token_hash = v_hash)
  ) into v_result;

  return v_result;
end;
$$;


-- ---------- 6.3 Apartar un regalo ----------
create or replace function public.guest_reserve(
  p_invite_token text,
  p_guest_token  text,
  p_gift_id      uuid,
  p_guest_name   text
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

  -- Freno contra bots o bromistas: máximo 5 regalos por invitado.
  if (select count(*) from public.reservations r
      where r.event_id = v_event_id and r.guest_token_hash = v_hash) >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  -- RN-01: el UNIQUE de reservations.gift_id decide quién gana si dos
  -- personas aprietan el botón al mismo tiempo. El que pierde cae aquí.
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


-- ---------- 6.4 Cancelar MI apartado ----------
-- RN-04: solo borra el apartado si el hash del token coincide.
create or replace function public.guest_cancel(
  p_invite_token text,
  p_guest_token  text,
  p_gift_id      uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  v_event_id := public.guest_event_access(p_invite_token, p_guest_token);
  if v_event_id is null then
    return jsonb_build_object('status', 'no_access');
  end if;

  delete from public.reservations r
  where r.gift_id = p_gift_id
    and r.event_id = v_event_id
    and r.guest_token_hash = public.hash_guest_token(p_guest_token);

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Si entraba solo gracias a ese apartado (el código ya cambió), al
  -- cancelarlo perdería el acceso y no podría elegir otro regalo. Como en
  -- este momento SÍ tenía acceso, lo pasamos a la versión vigente.
  -- (Si es el ANFITRIÓN quien libera el regalo, esto no pasa: así sigue
  -- funcionando "liberar para sacar a alguien".)
  update public.guest_sessions s
  set code_version = e.access_code_version
  from public.events e
  where e.id = v_event_id
    and s.event_id = v_event_id
    and s.token_hash = public.hash_guest_token(p_guest_token);

  return jsonb_build_object('status', 'ok');
end;
$$;


-- ---------- 6.5 Confirmar (o cambiar) asistencia ----------
-- RN-07: acompañantes = 0 si están desactivados; si no, 0..máximo.
create or replace function public.guest_rsvp(
  p_invite_token text,
  p_guest_token  text,
  p_guest_name   text,
  p_status       text,
  p_companions   int,
  p_note         text
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

  -- Si no va, no lleva acompañantes.
  if p_status = 'no' then
    v_companions := 0;
  end if;

  if v_companions < 0
     or (not v_settings.allow_companions and v_companions <> 0)
     or (v_settings.allow_companions and v_companions > v_settings.max_companions) then
    return jsonb_build_object('status', 'invalid_companions');
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
-- 7. Permisos de las funciones
--    Nadie (ni visitantes, ni anfitriones) puede llamarlas directo desde
--    internet. Solo "service_role", que es el rol de la llave SECRETA que
--    vive únicamente en el servidor de Next.js (Vercel).
-- =====================================================================
revoke execute on function public.hash_guest_token(text)                 from public, anon, authenticated;
revoke execute on function public.guest_event_access(text, text)         from public, anon, authenticated;
revoke execute on function public.guest_enter(text, text, text, text)    from public, anon, authenticated;
revoke execute on function public.guest_page(text, text)                 from public, anon, authenticated;
revoke execute on function public.guest_reserve(text, text, uuid, text)  from public, anon, authenticated;
revoke execute on function public.guest_cancel(text, text, uuid)         from public, anon, authenticated;
revoke execute on function public.guest_rsvp(text, text, text, text, int, text) from public, anon, authenticated;

grant execute on function public.guest_enter(text, text, text, text)    to service_role;
grant execute on function public.guest_page(text, text)                 to service_role;
grant execute on function public.guest_reserve(text, text, uuid, text)  to service_role;
grant execute on function public.guest_cancel(text, text, uuid)         to service_role;
grant execute on function public.guest_rsvp(text, text, text, text, int, text) to service_role;
