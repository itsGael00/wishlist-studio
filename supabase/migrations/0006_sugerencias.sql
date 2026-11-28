-- =====================================================================
-- Migración 0006: Sugerencia de Regalo (semana 5)
-- Dónde va en el repo: supabase/migrations/0006_sugerencias.sql
-- Cómo se aplica: copiar TODO y pegarlo en Supabase → SQL Editor → Run.
-- Requisito: haber corrido antes la 0005 (usa guest_take_slot).
--
-- RF-25: si el anfitrión activó "Sugerencia de regalo", el invitado puede
-- agregar un regalo que no está en la lista, con un precio DENTRO del
-- rango que puso el anfitrión. El regalo queda apartado automáticamente
-- por quien lo sugirió.
-- RN-02: el rango (mínimo <= precio <= máximo) lo revisa la base de
-- datos, no solo el formulario.
-- RF-10: el anfitrión puede ocultar (is_hidden) o borrar sugerencias.
--        Eso ya existe en la tabla gifts desde la semana 2; aquí solo
--        lo usa la pantalla.
--
-- Decisión (27 nov 2026): las sugerencias se publican directo, sin que el
-- anfitrión las apruebe antes. Como nacen apartadas, los demás invitados
-- solo ven "Ya apartado" (sirve para que nadie lleve lo mismo). Si no te
-- gusta una, la ocultas o la borras.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ¿Quién sugirió cada regalo? (hash del token del invitado)
--    Sirve para el límite de 3 sugerencias por invitado. Es un hash,
--    no un nombre: no revela nada aunque el anfitrión lo lea.
-- ---------------------------------------------------------------------
alter table public.gifts add column suggested_by_hash text;

-- Si lo sugirió un invitado debe tener hash; si es del anfitrión, no.
alter table public.gifts add constraint gifts_suggested_by_check
  check ((source = 'guest_suggestion') = (suggested_by_hash is not null)) not valid;
-- "not valid" = no revisa las filas viejas (todas son del anfitrión,
-- así que cumplirían). Lo validamos ahora para que quede completo:
alter table public.gifts validate constraint gifts_suggested_by_check;

create index gifts_suggested_by_idx on public.gifts (event_id, suggested_by_hash)
  where suggested_by_hash is not null;


-- ---------------------------------------------------------------------
-- 2. guest_page: ahora también manda
--    - si las sugerencias están activas y el rango de precio
--    - en cada regalo, si lo sugirió un invitado ("suggested")
--    - cuántas sugerencias lleva ESTE invitado (para el límite de 3)
--    Todo lo demás es igual que en la 0004.
-- ---------------------------------------------------------------------
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
        'welcome_message', s.welcome_message,
        -- NUEVO
        'allow_suggestions', s.allow_suggestions,
        'suggestion_min_price', s.suggestion_min_price,
        'suggestion_max_price', s.suggestion_max_price)
      from public.event_settings s where s.event_id = v_event_id),
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'description', g.description,
          'price_estimate', case when coalesce(v_show_prices, true) then g.price_estimate end,
          'store_url', g.store_url,
          'reserved', r.id is not null,
          'mine', coalesce(r.guest_token_hash = v_hash, false),
          'suggested', g.source = 'guest_suggestion') -- NUEVO
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
      where gs.event_id = v_event_id and gs.token_hash = v_hash),
    -- NUEVO
    'my_suggestions', (
      select count(*) from public.gifts g
      where g.event_id = v_event_id and g.suggested_by_hash = v_hash)
  ) into v_result;

  return v_result;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. guest_suggest: el invitado sugiere un regalo (y queda apartado)
--    Regresa status:
--      ok, no_access, disabled (sugerencias apagadas), invalid,
--      out_of_range (precio fuera del rango), limit (ya tiene 5 apartados),
--      suggest_limit (ya sugirió 3), too_fast (límite por IP de la 0005)
-- ---------------------------------------------------------------------
create or replace function public.guest_suggest(
  p_invite_token text,
  p_guest_token  text,
  p_guest_name   text,
  p_gift_name    text,
  p_price        numeric,
  p_description  text,
  p_ip           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id    uuid;
  v_hash        text := public.hash_guest_token(p_guest_token);
  v_name        text := btrim(coalesce(p_guest_name, ''));
  v_gift_name   text := btrim(coalesce(p_gift_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_settings    record;
  v_gift_id     uuid;
begin
  v_event_id := public.guest_event_access(p_invite_token, p_guest_token);
  if v_event_id is null then
    return jsonb_build_object('status', 'no_access');
  end if;

  select s.allow_suggestions, s.suggestion_min_price, s.suggestion_max_price
    into v_settings
  from public.event_settings s where s.event_id = v_event_id;

  if not coalesce(v_settings.allow_suggestions, false) then
    return jsonb_build_object('status', 'disabled');
  end if;

  if char_length(v_name) not between 1 and 80
     or char_length(v_gift_name) not between 1 and 120
     or char_length(coalesce(v_description, '')) > 300 then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- RN-02: el precio es obligatorio y debe estar dentro del rango.
  if p_price is null
     or p_price < v_settings.suggestion_min_price
     or p_price > v_settings.suggestion_max_price then
    return jsonb_build_object('status', 'out_of_range');
  end if;

  -- Nace apartado, así que cuenta para el máximo de 5 apartados.
  if (select count(*) from public.reservations r
      where r.event_id = v_event_id and r.guest_token_hash = v_hash) >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  -- Máximo 3 sugerencias por invitado (aunque luego las cancele).
  if (select count(*) from public.gifts g
      where g.event_id = v_event_id and g.suggested_by_hash = v_hash) >= 3 then
    return jsonb_build_object('status', 'suggest_limit');
  end if;

  if not public.guest_take_slot(v_event_id, p_ip, 'suggest') then
    return jsonb_build_object('status', 'too_fast');
  end if;

  -- El regalo nuevo va al final de la lista.
  insert into public.gifts (event_id, name, description, price_estimate, position, source, suggested_by_hash)
  values (
    v_event_id,
    v_gift_name,
    v_description,
    round(p_price, 2),
    coalesce((select max(g.position) + 1 from public.gifts g where g.event_id = v_event_id), 0),
    'guest_suggestion',
    v_hash)
  returning id into v_gift_id;

  -- Y queda apartado por quien lo sugirió (RF-25).
  insert into public.reservations (gift_id, event_id, guest_name, guest_token_hash)
  values (v_gift_id, v_event_id, v_name, v_hash);

  update public.guest_sessions set guest_name = v_name
  where event_id = v_event_id and token_hash = v_hash;

  return jsonb_build_object('status', 'ok');
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Permisos: igual que las demás guest_*, solo la llave secreta.
-- ---------------------------------------------------------------------
revoke execute on function public.guest_page(text, text) from public, anon, authenticated;
revoke execute on function public.guest_suggest(text, text, text, text, numeric, text, text)
  from public, anon, authenticated;

grant execute on function public.guest_page(text, text) to service_role;
grant execute on function public.guest_suggest(text, text, text, text, numeric, text, text)
  to service_role;
