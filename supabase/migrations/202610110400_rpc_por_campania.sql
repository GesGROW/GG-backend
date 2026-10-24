begin;

-- La caché se construye directamente desde el esquema versionado. No depende
-- del formato SQL ni de los filtros globales del RPC legacy desplegado.
create or replace function public.obtener_cache_operativa(p_dni_operador varchar)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_campania_id uuid;
  v_campania jsonb;
  v_trabajadores jsonb;
  v_tickets jsonb;
begin
  v_campania_id := public.campania_operativa_id();
  perform public.autorizar_operador_campania(p_dni_operador, v_campania_id);

  select to_jsonb(c) || jsonb_build_object('cultivo_nombre', cu.nombre)
  into v_campania
  from public.campanias c join public.cultivos cu on cu.id = c.cultivo_id
  where c.id = v_campania_id;

  select coalesce(jsonb_agg(fila order by fila->>'dni'), '[]'::jsonb)
  into v_trabajadores from (
    select jsonb_build_object(
      'id', t.id, 'dni', t.dni, 'nombre', concat_ws(' ', t.nombres, t.apellidos),
      'activo', t.activo, 'roles', jsonb_agg(distinct r.rol order by r.rol)
    ) fila
    from public.trabajadores t
    join public.trabajador_campania_rol r on r.trabajador_id = t.id
    where r.campania_id = v_campania_id and r.activo and t.activo
    group by t.id
  ) personal;

  select coalesce(jsonb_agg(jsonb_build_object(
    'codigo_ticket', at.codigo_ticket,
    'cosechador_dni', t.dni,
    'cosechador', concat_ws(' ', t.nombres, t.apellidos),
    'fecha_asignacion', at.fecha_asignacion
  ) order by at.codigo_ticket), '[]'::jsonb)
  into v_tickets
  from public.asignaciones_ticket at
  join public.trabajador_campania_rol r on r.id = at.cosechador_rol_id
  join public.trabajadores t on t.id = r.trabajador_id
  where at.campania_id = v_campania_id and r.campania_id = v_campania_id;

  return jsonb_build_object(
    'campania', v_campania, 'sincronizado_en', clock_timestamp(),
    'trabajadores', v_trabajadores, 'tickets', v_tickets,
    'lotes', public.listar_lotes_activos_v2()
  );
end $$;

-- Conserva los cuerpos ya desplegados (incluidos los RPC base no versionados),
-- acotando la búsqueda de campañas activas al contexto autorizado del adaptador.
-- El RPC legacy de caché deja de formar parte de este camino operativo.
do $migration$
declare
  r record; alias_campania text; original text; actualizado text;
begin
  for r in select p.oid,p.proname,p.proargnames,l.lanname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname in (
      'listar_lotes_activos_v2',
      'obtener_o_registrar_cosechador_activo','asignar_ticket','registrar_jabero',
      'registrar_lectura_jaba','cerrar_sesion_lectura','iniciar_sesion_lectura',
      'obtener_resumen_campania','obtener_produccion_diaria',
      'obtener_ranking_cosechadores','obtener_ranking_cosechadores_periodo','obtener_produccion_lotes',
      'admin_obtener_resumen_campania','admin_obtener_ranking_cosechadores',
      'admin_obtener_ranking_cosechadores_periodo','admin_obtener_produccion_diaria','admin_obtener_produccion_lotes'
    )
  loop
    original := pg_get_functiondef(r.oid); actualizado := original;
    for alias_campania in
      select distinct m[1] from regexp_matches(original,
        '\m(?:from|join)\s+(?:public\.)?campanias\s+(?:as\s+)?([a-z_][a-z0-9_]*)', 'gi') m
    loop
      actualizado := regexp_replace(actualizado,
        format('(\m%s\.estado(?:::[a-z_.]+)?\s*=\s*''ACTIVA''(?:::[a-z_.]+)?)',alias_campania),
        format('\1 AND %s.id = public.campania_operativa_id()',alias_campania),'gi');
    end loop;
    if 'p_dni_operador'=any(r.proargnames) and r.lanname='plpgsql' then
      actualizado := regexp_replace(actualizado, '\mbegin\M',
        'begin perform public.autorizar_operador_del_dia(p_dni_operador);','i');
    end if;
    if actualizado<>original then execute actualizado; end if;
  end loop;
end $migration$;

-- La validación administrativa anterior compara únicamente campañas del
-- cultivo del registro existente; los nuevos registros conservan el default.
do $migration$
declare original text; actualizado text;
begin
  original := pg_get_functiondef('public.admin_guardar_campania(uuid,varchar,varchar,date,date,public.estado_campania)'::regprocedure);
  actualizado := regexp_replace(original,
    '(\mc\.estado\s*=\s*''ACTIVA''::public\.estado_campania)',
    '\1 AND c.cultivo_id = coalesce(v_campania.cultivo_id, ''a1000000-0000-4000-8000-000000000001''::uuid)','gi');
  if actualizado=original then raise exception 'No se encontró la validación administrativa de campaña activa'; end if;
  execute actualizado;
end $migration$;

do $migration$
declare original text;
begin
  original := pg_get_functiondef('public.admin_guardar_variedad(uuid,varchar,boolean)'::regprocedure);
  execute regexp_replace(original, '(\mv\.nombre\s*=\s*v_nombre)',
    '\1 AND v.cultivo_id = coalesce(v_variedad.cultivo_id, ''a1000000-0000-4000-8000-000000000001''::uuid)','gi');
end $migration$;

-- Adaptadores explícitos: la PWA envía siempre el UUID de la campaña seleccionada.
-- Se comprueba también la pertenencia del lote, sesión y ticket antes de delegar.
do $migration$
declare
  firma text; r record; argumentos text; guardas text; cuerpo text;
begin
  foreach firma in array array[
    'obtener_cache_operativa(varchar)',
    'asignar_ticket(varchar,varchar,varchar,uuid)',
    'registrar_jabero(varchar,varchar,uuid)',
    'iniciar_sesion_lectura(varchar,varchar,uuid,uuid)',
    'iniciar_sesion_lectura(varchar,varchar,uuid,uuid,uuid)',
    'registrar_lectura_jaba(varchar,uuid,varchar,uuid,text,uuid)',
    'cerrar_sesion_lectura(varchar,uuid,uuid)',
    'obtener_resumen_campania(varchar,text)',
    'obtener_produccion_diaria(varchar,text)',
    'obtener_ranking_cosechadores_periodo(varchar,text)',
    'obtener_produccion_lotes(varchar)'
  ] loop
    select p.oid,p.proname,p.proargnames,pg_get_function_identity_arguments(p.oid) as declaracion
    into strict r from pg_proc p where p.oid=to_regprocedure('public.'||firma);
    select string_agg(quote_ident(nombre),',' order by orden) into argumentos
    from unnest(r.proargnames) with ordinality as a(nombre,orden);
    guardas := '';
    if 'p_lote_id'=any(r.proargnames) then
      guardas := guardas || $guard$
        if not exists(select 1 from public.lotes where id=p_lote_id and campania_id=p_campania_id) then
          raise exception 'El lote no pertenece a la campaña seleccionada';
        end if;
      $guard$;
    elsif 'p_sesion_id'=any(r.proargnames) then
      guardas := guardas || $guard$
        if not exists(select 1 from public.sesiones_lectura sl join public.lotes l on l.id=sl.lote_id
          where sl.id=p_sesion_id and l.campania_id=p_campania_id) then
          raise exception 'La sesión no pertenece a la campaña seleccionada';
        end if;
      $guard$;
    end if;
    if r.proname='asignar_ticket' then
      guardas := guardas || $guard$
        if exists(select 1 from public.asignaciones_ticket where codigo_ticket=btrim(p_codigo_ticket)
          and campania_id<>p_campania_id) then
          raise exception 'El ticket ya está asignado en otra campaña';
        end if;
      $guard$;
    elsif r.proname='registrar_lectura_jaba' then
      guardas := guardas || $guard$
        if not exists(select 1 from public.asignaciones_ticket where codigo_ticket=btrim(p_codigo_ticket)
          and campania_id=p_campania_id) then
          raise exception 'El ticket no pertenece a la campaña seleccionada';
        end if;
      $guard$;
    end if;
    if 'p_operacion_id'=any(r.proargnames) then
      guardas := guardas || format('perform public.fijar_campania_operacion(p_operacion_id,p_campania_id,p_dni_operador,%L);',r.proname);
    end if;
    cuerpo := format($body$
      declare v_resultado jsonb; v_anterior text := current_setting('scc.campania_id',true);
      begin
        perform public.autorizar_operador_campania(p_dni_operador,p_campania_id);
        perform set_config('scc.campania_id',p_campania_id::text,true);
        %s
        v_resultado := to_jsonb(public.%I(%s));
        perform set_config('scc.campania_id',coalesce(v_anterior,''),true);
        return v_resultado;
      exception when others then
        perform set_config('scc.campania_id',coalesce(v_anterior,''),true);
        raise;
      end;
    $body$,guardas,r.proname,argumentos);
    execute format('create function public.%I(p_campania_id uuid,%s) returns jsonb
      language plpgsql security definer set search_path=pg_catalog,public as %L',r.proname||'_campania',r.declaracion,cuerpo);
    execute format('revoke all on function public.%I(uuid,%s) from public,anon,authenticated',
      r.proname||'_campania',pg_get_function_identity_arguments(r.oid));
    execute format('grant execute on function public.%I(uuid,%s) to anon',
      r.proname||'_campania',pg_get_function_identity_arguments(r.oid));
  end loop;
end $migration$;

-- Invalidar sesiones/preparados que pudieran conservar planes de RPC anteriores.
notify pgrst, 'reload schema';
commit;
