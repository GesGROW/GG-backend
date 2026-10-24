begin;

create table public.cultivos (
  id uuid primary key default gen_random_uuid(),
  codigo varchar(30) not null unique,
  nombre varchar(100) not null,
  activo boolean not null default true
);
insert into public.cultivos(id,codigo,nombre) values
  ('a1000000-0000-4000-8000-000000000001','ARANDANO','Arándanos'),
  ('a1000000-0000-4000-8000-000000000002','MANDARINA','Mandarina');
alter table public.cultivos enable row level security;
revoke all on public.cultivos from public, anon, authenticated;

alter table public.campanias add column cultivo_id uuid not null
  default 'a1000000-0000-4000-8000-000000000001' references public.cultivos(id);
alter table public.variedades add column cultivo_id uuid not null
  default 'a1000000-0000-4000-8000-000000000001' references public.cultivos(id);
drop index public.ux_campanias_una_activa;
create unique index ux_campanias_una_activa_por_cultivo
on public.campanias(cultivo_id) where estado = 'ACTIVA'::public.estado_campania;
create index variedades_cultivo_idx on public.variedades(cultivo_id);
-- Un mismo nombre puede existir en cultivos distintos.
do $$ declare r record; begin
  for r in select c.conname from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attname='nombre'
    where c.conrelid='public.variedades'::regclass and c.contype='u' and c.conkey=array[a.attnum]
  loop execute format('alter table public.variedades drop constraint %I',r.conname); end loop;
end $$;
create unique index variedades_nombre_por_cultivo on public.variedades(cultivo_id,nombre);

create function public.validar_cultivo_lote_variedad()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1 from public.lotes l join public.campanias c on c.id = l.campania_id
    join public.variedades v on v.id = new.variedad_id
    where l.id = new.lote_id and c.cultivo_id = v.cultivo_id
  ) then raise exception 'La variedad debe pertenecer al cultivo de la campaña del lote'; end if;
  return new;
end $$;
create trigger lote_variedad_mismo_cultivo before insert or update
on public.lote_variedades for each row execute function public.validar_cultivo_lote_variedad();

create function public.validar_cultivo_lote()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_cultivo uuid;
begin
  select cultivo_id into v_cultivo from public.campanias where id = new.campania_id;
  if exists(select 1 from public.variedades where id = new.variedad_id and cultivo_id <> v_cultivo)
     or exists(select 1 from public.lote_variedades lv join public.variedades v on v.id = lv.variedad_id
       where lv.lote_id = new.id and v.cultivo_id <> v_cultivo) then
    raise exception 'Las variedades del lote deben pertenecer al cultivo de su campaña';
  end if;
  if tg_op = 'UPDATE' and new.campania_id is distinct from old.campania_id
     and exists(select 1 from public.sesiones_lectura where lote_id = old.id) then
    raise exception 'No se puede trasladar a otra campaña un lote con sesiones registradas';
  end if;
  return new;
end $$;
create trigger lote_mismo_cultivo before insert or update of campania_id, variedad_id
on public.lotes for each row execute function public.validar_cultivo_lote();

create function public.conservar_cultivo_historico()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'variedades' and new.cultivo_id is distinct from old.cultivo_id then
    if exists(select 1 from public.lote_variedades where variedad_id = old.id) then
      raise exception 'No se puede cambiar el cultivo de una variedad asociada a lotes';
    end if;
  elsif tg_table_name = 'campanias' and new.cultivo_id is distinct from old.cultivo_id then
    if exists(select 1 from public.lotes where campania_id = old.id)
       or exists(select 1 from public.trabajador_campania_rol where campania_id = old.id) then
      raise exception 'No se puede cambiar el cultivo de una campaña con lotes o personal';
    end if;
  end if;
  return new;
end $$;
create trigger variedad_conserva_cultivo before update of cultivo_id on public.variedades
for each row execute function public.conservar_cultivo_historico();
create trigger campania_conserva_cultivo before update of cultivo_id on public.campanias
for each row execute function public.conservar_cultivo_historico();

create function public.campania_operativa_id()
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_total integer;
begin
  v_id := nullif(current_setting('scc.campania_id', true), '')::uuid;
  if v_id is not null then return v_id; end if;
  select count(*), (array_agg(id))[1] into v_total, v_id
  from public.campanias where estado = 'ACTIVA';
  if v_total <> 1 then raise exception 'Es necesario indicar la campaña de trabajo'; end if;
  return v_id;
end $$;

create function public.autorizar_operador_campania(p_dni varchar, p_campania_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_campania_id is null or not exists (
    select 1 from public.trabajadores t
    join public.usuarios_app ua on ua.trabajador_id = t.id and ua.activo
    join public.trabajador_campania_rol r on r.trabajador_id = t.id and r.activo
    join public.campanias c on c.id = r.campania_id and c.estado = 'ACTIVA'
    join public.cultivos cu on cu.id = c.cultivo_id and cu.activo
    where t.dni = btrim(p_dni) and t.activo and c.id = p_campania_id
      and (r.rol = 'SUPERVISORA' or (r.rol = 'JABERO'
        and r.fecha_asignacion_jabero = (clock_timestamp() at time zone 'America/Lima')::date))
  ) then raise exception 'El operador no está autorizado para esta campaña en el día de hoy'; end if;
end $$;

create function public.validar_operador_campanias(p_dni varchar)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_operador jsonb; v_campanias jsonb;
begin
  select jsonb_build_object('dni',t.dni,'nombre',concat_ws(' ',t.nombres,t.apellidos))
  into v_operador from public.trabajadores t join public.usuarios_app ua on ua.trabajador_id = t.id
  where t.dni = btrim(p_dni) and t.activo and ua.activo;
  if v_operador is null then raise exception 'Usuario no autorizado'; end if;
  select coalesce(jsonb_agg(opcion order by opcion->>'cultivo_nombre', opcion->>'codigo'),'[]'::jsonb)
  into v_campanias from (
    select jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nombre', c.nombre,
      'cultivo_id', cu.id, 'cultivo_nombre', cu.nombre,
      'roles', jsonb_agg(r.rol order by r.rol)) opcion
    from public.trabajador_campania_rol r join public.trabajadores t on t.id = r.trabajador_id
    join public.campanias c on c.id = r.campania_id
    join public.cultivos cu on cu.id = c.cultivo_id
    where t.dni = btrim(p_dni) and r.activo and c.estado = 'ACTIVA' and cu.activo
      and (r.rol = 'SUPERVISORA' or (r.rol = 'JABERO'
        and r.fecha_asignacion_jabero = (clock_timestamp() at time zone 'America/Lima')::date))
    group by c.id, cu.id
  ) disponibles;
  if jsonb_array_length(v_campanias) = 0 then
    raise exception 'No tiene campañas activas asignadas para el día de hoy';
  end if;
  return v_operador || jsonb_build_object('campanias', v_campanias,
    'autorizado_para_fecha', (clock_timestamp() at time zone 'America/Lima')::date);
end $$;

-- Los RPC internos antiguos reciben el contexto del adaptador. El login nuevo
-- devuelve todas las opciones; esta autorización se usa al operar en una sola.
create or replace function public.autorizar_operador_del_dia(p_dni varchar)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public.autorizar_operador_campania(p_dni, public.campania_operativa_id());
end $$;

create table public.operaciones_pda_campania (
  id uuid primary key,
  campania_id uuid not null references public.campanias(id),
  dni_operador varchar not null,
  tipo text not null
);
alter table public.operaciones_pda_campania enable row level security;
revoke all on public.operaciones_pda_campania from public, anon, authenticated;
create function public.fijar_campania_operacion(p_id uuid, p_campania_id uuid, p_dni varchar, p_tipo text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_operacion public.operaciones_pda_campania%rowtype;
begin
  if p_id is null then raise exception 'Falta el ID de operación'; end if;
  insert into public.operaciones_pda_campania values(p_id,p_campania_id,btrim(p_dni),p_tipo)
  on conflict(id) do nothing;
  select * into v_operacion from public.operaciones_pda_campania where id = p_id for update;
  if v_operacion.campania_id is distinct from p_campania_id
     or v_operacion.dni_operador is distinct from btrim(p_dni) or v_operacion.tipo <> p_tipo then
    raise exception 'ID de operación reutilizado en otra campaña o con otro operador';
  end if;
end $$;

revoke all on function public.validar_cultivo_lote_variedad() from public, anon, authenticated;
revoke all on function public.validar_cultivo_lote() from public, anon, authenticated;
revoke all on function public.conservar_cultivo_historico() from public, anon, authenticated;
revoke all on function public.campania_operativa_id() from public, anon, authenticated;
revoke all on function public.autorizar_operador_campania(varchar,uuid) from public, anon, authenticated;
revoke all on function public.fijar_campania_operacion(uuid,uuid,varchar,text) from public, anon, authenticated;
revoke all on function public.validar_operador_campanias(varchar) from public, anon, authenticated;
grant execute on function public.validar_operador_campanias(varchar) to anon;
notify pgrst, 'reload schema';
commit;
