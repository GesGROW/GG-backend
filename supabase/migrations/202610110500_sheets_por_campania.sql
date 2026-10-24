begin;

-- Ninguna cuenta obtiene permisos globales ni sobre campañas por defecto.
alter table public.integraciones_api add column acceso_global boolean not null default false;
create table public.integracion_campania (
  integracion_id uuid not null references public.integraciones_api(id),
  campania_id uuid not null references public.campanias(id),
  activo boolean not null default true,
  primary key(integracion_id, campania_id)
);
create table public.trabajadores_campania_hoja (
  trabajador_id uuid not null references public.trabajadores(id),
  campania_id uuid not null references public.campanias(id),
  primary key(trabajador_id, campania_id)
);
insert into public.trabajadores_campania_hoja
select distinct trabajador_id, campania_id from public.trabajador_campania_rol;
alter table public.integracion_campania enable row level security;
alter table public.trabajadores_campania_hoja enable row level security;
revoke all on public.integracion_campania, public.trabajadores_campania_hoja from public, anon, authenticated;

create function public.integracion_puede_campania(p_campania_id uuid)
returns boolean language sql security definer set search_path = pg_catalog, public as $$
  select exists(select 1 from public.integraciones_api ia
    where ia.auth_user_id = auth.uid() and ia.activo
      and (ia.acceso_global or exists(select 1 from public.integracion_campania ic
        where ic.integracion_id = ia.id and ic.campania_id = p_campania_id and ic.activo)));
$$;

create function public.autorizar_integracion_hoja(p_campania_id uuid, p_reportes boolean default false)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_campania_id is null or not public.integracion_puede_campania(p_campania_id)
     or not exists(select 1 from public.integraciones_api ia
       where ia.auth_user_id = auth.uid() and ia.activo
         and case when p_reportes then ia.puede_consultar_reportes else ia.puede_gestionar_maestros end) then
    raise exception 'La integración no tiene permiso para esta campaña y operación';
  end if;
  if not exists(select 1 from public.campanias where id = p_campania_id) then
    raise exception 'La campaña del archivo no existe';
  end if;
end $$;

-- Los RPC antiguos ya no permiten saltarse el alcance de las cuentas de archivo.
create or replace function public.autorizar_integracion_gestion_maestros()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_contexto uuid := nullif(current_setting('scc.hoja_campania_id', true), '')::uuid;
begin
  if v_contexto is not null then
    perform public.autorizar_integracion_hoja(v_contexto, false);
  elsif not exists(select 1 from public.integraciones_api
    where auth_user_id = auth.uid() and activo and puede_gestionar_maestros and acceso_global) then
    raise exception 'La integración requiere contexto de campaña para gestionar maestros';
  end if;
end $$;
create or replace function public.autorizar_integracion_reportes()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_contexto uuid := nullif(current_setting('scc.hoja_campania_id', true), '')::uuid;
begin
  if v_contexto is not null then
    perform public.autorizar_integracion_hoja(v_contexto, true);
  elsif not exists(select 1 from public.integraciones_api
    where auth_user_id = auth.uid() and activo and puede_consultar_reportes and acceso_global) then
    raise exception 'La integración requiere contexto de campaña para consultar reportes';
  end if;
end $$;

-- Reportes versionados: el archivo también puede consultar su campaña cerrada.
-- La migración 0400 ya añadió el filtro por campania_operativa_id().
do $migration$
declare r record; original text; actualizado text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'admin_obtener_resumen_campania', 'admin_obtener_produccion_diaria',
      'admin_obtener_produccion_lotes', 'admin_obtener_ranking_cosechadores_periodo')
  loop
    original := pg_get_functiondef(r.oid);
    actualizado := regexp_replace(original,
      '(\mc\.estado(?:::[a-z_.]+)?\s*=\s*''ACTIVA''(?:::[a-z_.]+)?)',
      '(\1 OR nullif(current_setting(''scc.hoja_campania_id'',true),'''')::uuid = c.id)', 'gi');
    if actualizado = original or position('campania_operativa_id()' in actualizado) = 0 then
      raise exception 'Aplique la migración 0400 antes de adaptar los reportes de Sheets';
    end if;
    execute actualizado;
  end loop;
end $migration$;

-- Guardado de variedades con identidad natural (cultivo_id, nombre).
create function public.admin_guardar_variedad_hoja(
  p_contexto_campania_id uuid, p_variedad_id uuid, p_nombre varchar, p_activo boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_cultivo uuid; v_variedad public.variedades%rowtype; v_nuevo boolean;
begin
  perform public.autorizar_integracion_hoja(p_contexto_campania_id);
  if nullif(btrim(p_nombre),'') is null then raise exception 'El nombre de la variedad es obligatorio'; end if;
  if p_activo is null then raise exception 'Activo es obligatorio'; end if;
  select cultivo_id into v_cultivo from public.campanias where id = p_contexto_campania_id;
  perform pg_advisory_xact_lock(hashtextextended(v_cultivo::text || ':' || btrim(p_nombre),0));
  if p_variedad_id is not null then
    select * into v_variedad from public.variedades where id = p_variedad_id for update;
    if not found or v_variedad.cultivo_id <> v_cultivo then
      raise exception 'La variedad no pertenece al cultivo de este archivo';
    end if;
  else
    select * into v_variedad from public.variedades
    where cultivo_id = v_cultivo and nombre = btrim(p_nombre) for update;
  end if;
  v_nuevo := v_variedad.id is null;
  if v_nuevo then
    insert into public.variedades(nombre,activo,cultivo_id)
    values(btrim(p_nombre),p_activo,v_cultivo) returning * into v_variedad;
  else
    update public.variedades set nombre = btrim(p_nombre), activo = p_activo
    where id = v_variedad.id returning * into v_variedad;
  end if;
  return jsonb_build_object('ok',true,'accion',case when v_nuevo then 'CREADO' else 'ACTUALIZADO' end,
    'variedad',to_jsonb(v_variedad));
exception when unique_violation then raise exception 'Ya existe otra variedad con ese nombre en el cultivo';
end $$;

-- Adaptadores con los mismos contratos de los maestros y reportes existentes.
-- El contexto del archivo es distinto del campania_id editable de una fila.
do $migration$
declare firma text; r record; argumentos text; guardas text; filtro text; cuerpo text; es_reporte boolean;
begin
  foreach firma in array array[
    'admin_listar_trabajadores()',
    'admin_guardar_trabajador(uuid,varchar,varchar,varchar,boolean)',
    'admin_listar_campanias()',
    'admin_guardar_campania(uuid,varchar,varchar,date,date,public.estado_campania)',
    'admin_listar_variedades()',
    'admin_listar_lotes()',
    'admin_guardar_lote_variedades(uuid,varchar,varchar,uuid,uuid[],boolean)',
    'admin_listar_roles_campania()',
    'admin_guardar_rol_campania(uuid,uuid,uuid,public.rol_trabajador,boolean)',
    'admin_obtener_resumen_campania(text)',
    'admin_obtener_produccion_diaria(text)',
    'admin_obtener_produccion_lotes()',
    'admin_obtener_ranking_cosechadores_periodo(text,text)'
  ] loop
    select p.oid,p.proname,p.proargnames,pg_get_function_identity_arguments(p.oid) declaracion
    into strict r from pg_proc p where p.oid = to_regprocedure('public.' || firma);
    select coalesce(string_agg(quote_ident(nombre),',' order by orden),'') into argumentos
    from unnest(r.proargnames) with ordinality a(nombre,orden);
    guardas := ''; filtro := ''; es_reporte := r.proname like 'admin_obtener_%';

    if r.proname = 'admin_guardar_campania' then
      guardas := $guard$
        if p_campania_id is not null and p_campania_id <> p_contexto_campania_id then
          raise exception 'La fila pertenece a otra campaña';
        end if;
        if p_campania_id is null and not exists(select 1 from public.campanias
          where id = p_contexto_campania_id and codigo = btrim(p_codigo)) then
          raise exception 'Este archivo solo administra su campaña configurada';
        end if;
        p_campania_id := p_contexto_campania_id;
      $guard$;
    elsif r.proname = 'admin_guardar_lote_variedades' then
      guardas := $guard$
        if p_campania_id is distinct from p_contexto_campania_id
          or (p_lote_id is not null and not exists(select 1 from public.lotes
            where id = p_lote_id and campania_id = p_contexto_campania_id)) then
          raise exception 'El lote no pertenece a la campaña de este archivo';
        end if;
      $guard$;
    elsif r.proname = 'admin_guardar_rol_campania' then
      guardas := $guard$
        if p_campania_id is distinct from p_contexto_campania_id
          or (p_rol_id is not null and not exists(select 1 from public.trabajador_campania_rol
            where id = p_rol_id and campania_id = p_contexto_campania_id)) then
          raise exception 'El rol no pertenece a la campaña de este archivo';
        end if;
        if not exists(select 1 from public.trabajadores_campania_hoja
          where trabajador_id = p_trabajador_id and campania_id = p_contexto_campania_id)
          and not exists(select 1 from public.trabajador_campania_rol
            where trabajador_id = p_trabajador_id and campania_id = p_contexto_campania_id) then
          raise exception 'Agregue primero el trabajador en TRABAJADORES de esta campaña';
        end if;
      $guard$;
    elsif r.proname = 'admin_guardar_trabajador' then
      guardas := $guard$
        perform pg_advisory_xact_lock(hashtextextended('hoja-trabajador:' || btrim(p_dni),0));
        if p_trabajador_id is not null and not exists(select 1 from public.trabajadores_campania_hoja
          where trabajador_id = p_trabajador_id and campania_id = p_contexto_campania_id)
          and not exists(select 1 from public.trabajador_campania_rol
            where trabajador_id = p_trabajador_id and campania_id = p_contexto_campania_id) then
          raise exception 'El trabajador no pertenece a esta campaña';
        end if;
        select * into v_trabajador from public.trabajadores
        where (p_trabajador_id is not null and id = p_trabajador_id)
          or (p_trabajador_id is null and dni = btrim(p_dni)) for update;
        if found and (v_trabajador.dni is distinct from btrim(p_dni)
          or v_trabajador.nombres is distinct from btrim(p_nombres)
          or v_trabajador.apellidos is distinct from btrim(p_apellidos)
          or v_trabajador.activo is distinct from p_activo) and exists(
            select 1 from (
              select campania_id from public.trabajador_campania_rol where trabajador_id = v_trabajador.id
              union select campania_id from public.trabajadores_campania_hoja where trabajador_id = v_trabajador.id
            ) participacion where not public.integracion_puede_campania(participacion.campania_id)
          ) then
          raise exception 'El trabajador es compartido: conserve sus datos o solicite una corrección con permiso en ambas campañas. Para retirarlo de esta campaña, desactive su rol';
        end if;
      $guard$;
      filtro := $filter$
        insert into public.trabajadores_campania_hoja(trabajador_id,campania_id)
        values((v_resultado->'trabajador'->>'id')::uuid,p_contexto_campania_id) on conflict do nothing;
      $filter$;
    elsif r.proname = 'admin_listar_trabajadores' then
      filtro := $filter$
        select jsonb_set(v_resultado,'{trabajadores}',coalesce(jsonb_agg(item),'[]'::jsonb)) into v_resultado
        from jsonb_array_elements(v_resultado->'trabajadores') item
        where exists(select 1 from public.trabajadores_campania_hoja
          where trabajador_id = (item->>'id')::uuid and campania_id = p_contexto_campania_id)
          or exists(select 1 from public.trabajador_campania_rol
            where trabajador_id = (item->>'id')::uuid and campania_id = p_contexto_campania_id);
      $filter$;
    elsif r.proname = 'admin_listar_campanias' then
      filtro := $filter$
        select jsonb_set(v_resultado,'{campanias}',coalesce(jsonb_agg(item),'[]'::jsonb)) into v_resultado
        from jsonb_array_elements(v_resultado->'campanias') item where (item->>'id')::uuid = p_contexto_campania_id;
      $filter$;
    elsif r.proname = 'admin_listar_variedades' then
      filtro := $filter$
        select jsonb_set(v_resultado,'{variedades}',coalesce(jsonb_agg(item),'[]'::jsonb)) into v_resultado
        from jsonb_array_elements(v_resultado->'variedades') item
        join public.variedades v on v.id = (item->>'id')::uuid
        join public.campanias c on c.id = p_contexto_campania_id and c.cultivo_id = v.cultivo_id;
      $filter$;
    elsif r.proname = 'admin_listar_lotes' then
      filtro := $filter$
        select jsonb_set(v_resultado,'{lotes}',coalesce(jsonb_agg(item),'[]'::jsonb)) into v_resultado
        from jsonb_array_elements(v_resultado->'lotes') item where (item->>'campania_id')::uuid = p_contexto_campania_id;
      $filter$;
    elsif r.proname = 'admin_listar_roles_campania' then
      filtro := $filter$
        select jsonb_set(v_resultado,'{roles}',coalesce(jsonb_agg(item),'[]'::jsonb)) into v_resultado
        from jsonb_array_elements(v_resultado->'roles') item where (item->>'campania_id')::uuid = p_contexto_campania_id;
      $filter$;
    end if;
    cuerpo := format($body$
      declare v_resultado jsonb; v_trabajador public.trabajadores%%rowtype;
        v_anterior text := current_setting('scc.campania_id',true);
        v_hoja_anterior text := current_setting('scc.hoja_campania_id',true);
      begin
        perform public.autorizar_integracion_hoja(p_contexto_campania_id,%L);
        perform set_config('scc.hoja_campania_id',p_contexto_campania_id::text,true);
        perform set_config('scc.campania_id',p_contexto_campania_id::text,true);
        %s
        v_resultado := public.%I(%s);
        %s
        perform set_config('scc.hoja_campania_id',coalesce(v_hoja_anterior,''),true);
        perform set_config('scc.campania_id',coalesce(v_anterior,''),true);
        return v_resultado;
      exception when others then
        perform set_config('scc.hoja_campania_id',coalesce(v_hoja_anterior,''),true);
        perform set_config('scc.campania_id',coalesce(v_anterior,''),true);
        raise;
      end;
    $body$,es_reporte,guardas,r.proname,argumentos,filtro);
    execute format('create function public.%I(p_contexto_campania_id uuid%s) returns jsonb
      language plpgsql security definer set search_path=pg_catalog,public as %L',
      r.proname || '_hoja', case when r.declaracion = '' then '' else ',' || r.declaracion end,cuerpo);
    execute format('revoke all on function public.%I(uuid%s) from public,anon,authenticated',
      r.proname || '_hoja', case when r.declaracion = '' then '' else ',' || r.declaracion end);
    execute format('grant execute on function public.%I(uuid%s) to authenticated',
      r.proname || '_hoja', case when r.declaracion = '' then '' else ',' || r.declaracion end);
  end loop;
end $migration$;

create function public.admin_contexto_archivo_hoja(p_contexto_campania_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if exists(select 1 from public.integraciones_api where auth_user_id = auth.uid() and puede_gestionar_maestros) then
    perform public.autorizar_integracion_hoja(p_contexto_campania_id,false);
  else
    perform public.autorizar_integracion_hoja(p_contexto_campania_id,true);
  end if;
  return (select jsonb_build_object('ok',true,'campania',to_jsonb(c) || jsonb_build_object('cultivo_nombre',cu.nombre))
    from public.campanias c join public.cultivos cu on cu.id = c.cultivo_id where c.id = p_contexto_campania_id);
end $$;

revoke all on function public.integracion_puede_campania(uuid) from public, anon, authenticated;
revoke all on function public.autorizar_integracion_hoja(uuid,boolean) from public, anon, authenticated;
revoke all on function public.autorizar_integracion_gestion_maestros() from public, anon, authenticated;
revoke all on function public.autorizar_integracion_reportes() from public, anon, authenticated;
revoke all on function public.admin_guardar_variedad_hoja(uuid,uuid,varchar,boolean) from public,anon,authenticated;
revoke all on function public.admin_contexto_archivo_hoja(uuid) from public,anon,authenticated;
grant execute on function public.admin_guardar_variedad_hoja(uuid,uuid,varchar,boolean) to authenticated;
grant execute on function public.admin_contexto_archivo_hoja(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
