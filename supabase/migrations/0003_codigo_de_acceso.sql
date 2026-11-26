-- =====================================================================
-- Migración 0003: código de acceso visible para el anfitrión
-- Dónde va en el repo: supabase/migrations/0003_codigo_de_acceso.sql
-- Cómo se aplica: copiar TODO y pegarlo en Supabase → SQL Editor → Run.
--
-- Decisión (24 nov 2026): el código se guarda EN CLARO, no como hash,
-- para que el anfitrión siempre pueda verlo y copiarlo. Un código de 6
-- caracteres con hash se adivina en segundos si alguien robara la base
-- de datos, así que el hash casi no protegía. Lo que sí protege:
--   1. RLS + permisos: solo el dueño del evento puede leer su código.
--   2. Límite de intentos al escribir el código (semana 4).
--   3. Regenerarlo cuando se filtre.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Generador de códigos: 6 caracteres de un alfabeto SIN letras o
--    números confusos (no hay 0/O ni 1/I). Son 32 símbolos, así que
--    hay 32^6 ≈ 1,070 millones de códigos posibles.
--    Usamos bytes aleatorios criptográficos (gen_random_bytes), no random().
-- ---------------------------------------------------------------------
create or replace function public.new_access_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(6);
  code text := '';
begin
  for i in 0..5 loop
    -- 256 es múltiplo de 32, así que "% 32" no favorece a ningún símbolo.
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

revoke execute on function public.new_access_code() from public, anon;
-- El anfitrión la necesita porque es el valor por defecto al crear un evento.
grant execute on function public.new_access_code() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Columnas: quitamos el hash y agregamos el código en claro.
--    Los eventos que ya existían reciben su código al instante.
-- ---------------------------------------------------------------------
alter table public.events drop column access_code_hash;

alter table public.events
  add column access_code text default public.new_access_code();

-- Al agregar la columna, Postgres ya le dio un código distinto a cada
-- evento existente (el "default" se calcula fila por fila). Solo falta la fecha.
update public.events
set access_code_updated_at = now()
where access_code_updated_at is null;

alter table public.events
  alter column access_code set not null,
  alter column access_code_updated_at set default now(),
  add constraint access_code_format check (access_code ~ '^[A-HJ-NP-Z2-9]{6}$');


-- ---------------------------------------------------------------------
-- 3. Permisos por COLUMNA en events.
--    Antes el anfitrión podía editar cualquier columna de su evento.
--    Ahora solo las "normales". El código, su versión y el token del
--    link solo cambian con la función de abajo, que también sube la
--    versión (así las sesiones de invitado viejas dejan de valer).
-- ---------------------------------------------------------------------
revoke insert, update on public.events from authenticated;

grant insert (title, description, starts_at, location_text, cover_image_url, status)
  on public.events to authenticated;
grant update (title, description, starts_at, location_text, cover_image_url, status)
  on public.events to authenticated;


-- ---------------------------------------------------------------------
-- 4. Generar un código nuevo (botón "Generar código nuevo" del panel).
--    security definer: necesita escribir columnas que el anfitrión ya no
--    puede tocar directo. Por eso revisa A MANO que seas el dueño.
-- ---------------------------------------------------------------------
create or replace function public.regenerate_access_code(p_event_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_code text;
  new_code text;
begin
  select e.access_code into old_code
  from public.events e
  where e.id = p_event_id and e.owner_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Evento no encontrado' using errcode = 'P0002';
  end if;

  -- Casi imposible que salga el mismo, pero por si acaso.
  loop
    new_code := public.new_access_code();
    exit when new_code <> old_code;
  end loop;

  update public.events
  set access_code = new_code,
      access_code_version = access_code_version + 1,
      access_code_updated_at = now()
  where id = p_event_id;

  return new_code;
end;
$$;

revoke execute on function public.regenerate_access_code(uuid) from public, anon;
grant  execute on function public.regenerate_access_code(uuid) to authenticated;
