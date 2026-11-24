-- =====================================================================
-- Migración 0001: esquema inicial de WishListStudio
-- Dónde va en el repo: supabase/migrations/0001_esquema_inicial.sql
-- Cómo se aplica (semana 2): copiar TODO y pegarlo en Supabase → SQL Editor → Run.
--
-- Idea clave: RLS (Row Level Security) = "seguridad por fila".
-- Cada tabla tiene RLS ACTIVADO. Sin una política (policy) que lo permita,
-- nadie puede leer ni escribir nada. Las políticas de abajo solo dejan
-- que el anfitrión toque SUS propias filas (owner_id = su usuario).
-- Los invitados NO tienen políticas: todo lo de invitados pasará por el
-- servidor de Next.js (semana 4), nunca directo desde el navegador.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Función auxiliar: mantener "updated_at" al día en cada UPDATE
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. profiles: el anfitrión (1 fila por cuenta de Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now()
);

-- Cuando alguien se registra, se crea su perfil automáticamente.
-- "security definer" = corre con permisos del dueño de la función,
-- porque el usuario nuevo todavía no tiene permiso de escribir en profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 3. events: cada evento (cumpleaños, boda, etc.)
-- ---------------------------------------------------------------------
create table public.events (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null default auth.uid()
                           references public.profiles (id) on delete cascade,
  title                  text not null check (char_length(title) between 1 and 120),
  description            text check (char_length(description) <= 2000),
  starts_at              timestamptz,
  location_text          text check (char_length(location_text) <= 200),
  cover_image_url        text,
  -- Token del link permanente: 16 bytes aleatorios = 128 bits, en hexadecimal.
  invite_token           text not null unique
                           default encode(extensions.gen_random_bytes(16), 'hex'),
  -- El código de acceso se genera en la semana 3 (por eso puede ser nulo hoy).
  access_code_hash       text,
  access_code_version    int not null default 1,
  access_code_updated_at timestamptz,
  status                 text not null default 'draft'
                           check (status in ('draft', 'published', 'closed')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index events_owner_id_idx on public.events (owner_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. event_settings: configuración del evento (1 a 1 con events)
-- ---------------------------------------------------------------------
create table public.event_settings (
  event_id             uuid primary key references public.events (id) on delete cascade,
  show_reserver_names  boolean not null default false,
  allow_companions     boolean not null default false,
  max_companions       int check (max_companions between 1 and 20),
  allow_suggestions    boolean not null default false,
  suggestion_min_price numeric(12, 2) check (suggestion_min_price >= 0),
  suggestion_max_price numeric(12, 2) check (suggestion_max_price >= 0),
  show_prices          boolean not null default true,
  welcome_message      text check (char_length(welcome_message) <= 1000),
  -- Si hay acompañantes, debe haber un máximo.
  constraint companions_need_max
    check (not allow_companions or max_companions is not null),
  -- Si hay sugerencias, debe haber rango válido (mínimo <= máximo).
  constraint suggestions_need_range
    check (not allow_suggestions or (
      suggestion_min_price is not null
      and suggestion_max_price is not null
      and suggestion_min_price <= suggestion_max_price))
);

-- Al crear un evento, se crea su configuración con valores por defecto.
create or replace function public.handle_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_settings (event_id) values (new.id);
  return new;
end;
$$;

create trigger on_event_created
  after insert on public.events
  for each row execute function public.handle_new_event();


-- ---------------------------------------------------------------------
-- 5. gifts: los regalos de cada evento
-- ---------------------------------------------------------------------
create table public.gifts (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  description    text check (char_length(description) <= 1000),
  price_estimate numeric(12, 2) check (price_estimate >= 0),
  store_url      text check (store_url is null or store_url like 'https://%'),
  image_url      text,
  position       int not null default 0,
  source         text not null default 'host' check (source in ('host', 'guest_suggestion')),
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now()
);

create index gifts_event_id_idx on public.gifts (event_id, position);


-- ---------------------------------------------------------------------
-- 6. reservations: quién apartó qué
-- UNIQUE en gift_id = un regalo solo se puede apartar UNA vez.
-- ---------------------------------------------------------------------
create table public.reservations (
  id               uuid primary key default gen_random_uuid(),
  gift_id          uuid not null unique references public.gifts (id) on delete cascade,
  event_id         uuid not null references public.events (id) on delete cascade,
  guest_name       text not null check (char_length(guest_name) between 1 and 80),
  guest_token_hash text not null,
  created_at       timestamptz not null default now()
);

create index reservations_event_id_idx on public.reservations (event_id);


-- ---------------------------------------------------------------------
-- 7. rsvps: confirmaciones de asistencia
-- ---------------------------------------------------------------------
create table public.rsvps (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  guest_name       text not null check (char_length(guest_name) between 1 and 80),
  status           text not null check (status in ('yes', 'no', 'maybe')),
  companions       int not null default 0 check (companions >= 0),
  note             text check (char_length(note) <= 500),
  guest_token_hash text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index rsvps_event_id_idx on public.rsvps (event_id);

create trigger rsvps_set_updated_at
  before update on public.rsvps
  for each row execute function public.set_updated_at();


-- =====================================================================
-- 8. RLS: activar en TODAS las tablas
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.event_settings enable row level security;
alter table public.gifts          enable row level security;
alter table public.reservations   enable row level security;
alter table public.rsvps          enable row level security;

-- Función auxiliar: ¿el usuario actual es dueño de este evento?
-- Se usa en las políticas de las tablas "hijas" del evento.
create or replace function public.is_event_owner(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.owner_id = (select auth.uid())
  );
$$;


-- ---------- profiles: cada quien ve y edita solo su perfil ----------
create policy "perfil: ver el propio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "perfil: editar el propio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));


-- ---------- events: el anfitrión solo ve/crea/edita/borra los suyos ----------
create policy "eventos: ver los propios" on public.events
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "eventos: crear propios" on public.events
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "eventos: editar los propios" on public.events
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "eventos: borrar los propios" on public.events
  for delete to authenticated using (owner_id = (select auth.uid()));


-- ---------- event_settings: solo el dueño del evento ----------
-- (Se crean solas con el trigger; el anfitrión solo las ve y edita.)
create policy "config: ver la de mis eventos" on public.event_settings
  for select to authenticated using (public.is_event_owner(event_id));

create policy "config: editar la de mis eventos" on public.event_settings
  for update to authenticated
  using (public.is_event_owner(event_id)) with check (public.is_event_owner(event_id));


-- ---------- gifts: el dueño del evento hace todo ----------
create policy "regalos: ver los de mis eventos" on public.gifts
  for select to authenticated using (public.is_event_owner(event_id));

create policy "regalos: crear en mis eventos" on public.gifts
  for insert to authenticated with check (public.is_event_owner(event_id));

create policy "regalos: editar los de mis eventos" on public.gifts
  for update to authenticated
  using (public.is_event_owner(event_id)) with check (public.is_event_owner(event_id));

create policy "regalos: borrar los de mis eventos" on public.gifts
  for delete to authenticated using (public.is_event_owner(event_id));


-- ---------- reservations: el anfitrión ve y puede liberar ----------
-- Apartar lo hará el servidor en nombre del invitado (semana 4).
create policy "apartados: ver los de mis eventos" on public.reservations
  for select to authenticated using (public.is_event_owner(event_id));

create policy "apartados: liberar en mis eventos" on public.reservations
  for delete to authenticated using (public.is_event_owner(event_id));


-- ---------- rsvps: el anfitrión ve y puede borrar ----------
create policy "asistencia: ver la de mis eventos" on public.rsvps
  for select to authenticated using (public.is_event_owner(event_id));

create policy "asistencia: borrar en mis eventos" on public.rsvps
  for delete to authenticated using (public.is_event_owner(event_id));


-- =====================================================================
-- 9. Permisos (GRANT): qué puede hacer cada rol con cada tabla
-- El proyecto se creó SIN "Grant API access to new tables automatically",
-- así que damos solo los permisos necesarios, a mano.
-- Dos capas: GRANT dice "puedes usar esta tabla"; RLS dice "qué filas".
-- El rol "anon" (visitante sin sesión) NO recibe nada.
-- =====================================================================
grant usage on schema public to authenticated;

grant select, update                 on public.profiles       to authenticated;
grant select, insert, update, delete on public.events         to authenticated;
grant select, update                 on public.event_settings to authenticated;
grant select, insert, update, delete on public.gifts          to authenticated;
grant select, delete                 on public.reservations   to authenticated;
grant select, delete                 on public.rsvps          to authenticated;

grant execute on function public.is_event_owner(uuid) to authenticated;
