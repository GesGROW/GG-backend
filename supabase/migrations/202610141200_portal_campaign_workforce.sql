begin;
do $portal_f73$
begin
  if to_regprocedure('public.portal_f73_version()') is not null then return; end if;
  if to_regclass('public.identity_invitaciones') is null then raise exception 'Aplique F7.2 antes de F7.3'; end if;

-- Nuevas APIs de gestión; no se alteran las firmas ni cuerpos de Sheets/PDA.
-- No hay nuevas tablas ni catálogos duplicados. Los constraints F6.1 siguen
-- siendo autoridad sobre ownership, DNI/código y campaña activa por cultivo.
create function public.portal_exigir_gestion(p_tenant uuid,p_permiso text,p_modulo text)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant,p_permiso);
  perform public.platform_exigir_modulo(p_tenant,p_modulo);
end $$;
create function public.campaign_admin_dto(p_tenant uuid,p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',c.id,'tenantId',c.tenant_id,'codigo',c.codigo,'nombre',c.nombre,
    'cultivoId',c.cultivo_id,'cultivo',cu.nombre,'estado',c.estado,
    'fechaInicio',c.fecha_inicio,'fechaFin',c.fecha_fin)
  from public.campanias c join public.cultivos cu on cu.id=c.cultivo_id where c.tenant_id=p_tenant and c.id=p_id;
$$;
create function public.campaign_admin_exigir_campania(p_tenant uuid,p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.portal_exigir_gestion(p_tenant,'campaign.manage','CAMPAIGN');
  perform 1 from public.campanias where tenant_id=p_tenant and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Campaña no pertenece a la empresa autorizada'; end if;
end $$;
create function public.campaign_admin_validar_datos(p_codigo text,p_nombre text,p_inicio date,p_fin date,p_cultivo uuid,p_anterior uuid default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if nullif(btrim(p_codigo),'') is null or nullif(btrim(p_nombre),'') is null or p_inicio is null then
    raise exception 'Código, nombre y fecha de inicio requeridos'; end if;
  if p_fin<p_inicio then raise exception 'La fecha de fin no puede ser anterior al inicio'; end if;
  if not exists(select 1 from public.cultivos where id=p_cultivo and (activo or id=p_anterior)) then
    raise exception 'Cultivo no disponible'; end if;
end $$;
create function public.campaign_admin_listar(p_tenant_id uuid,p_busqueda text default '',p_estado text default '',p_cultivo_id uuid default null,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q text:=lower(btrim(coalesce(p_busqueda,''))); v_total bigint; v_filas jsonb;
begin
  perform public.portal_exigir_gestion(p_tenant_id,'campaign.manage','CAMPAIGN');
  if p_offset is null or p_offset<0 or p_estado is null or p_estado not in ('','ACTIVA','CERRADA') then raise exception 'Filtro inválido'; end if;
  select count(*) into v_total from public.campanias c where c.tenant_id=p_tenant_id
    and position(q in lower(c.codigo||' '||c.nombre))>0 and (p_estado='' or c.estado::text=p_estado)
    and (p_cultivo_id is null or c.cultivo_id=p_cultivo_id);
  select coalesce(jsonb_agg(dto),'[]'::jsonb) into v_filas from (
    select public.campaign_admin_dto(p_tenant_id,c.id) dto from public.campanias c where c.tenant_id=p_tenant_id
      and position(q in lower(c.codigo||' '||c.nombre))>0 and (p_estado='' or c.estado::text=p_estado)
      and (p_cultivo_id is null or c.cultivo_id=p_cultivo_id) order by c.codigo,c.id limit 50 offset p_offset) filas;
  return jsonb_build_object('campanias',v_filas,'total',v_total);
end $$;
create function public.campaign_admin_obtener(p_tenant_id uuid,p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_id);
  return public.campaign_admin_dto(p_tenant_id,p_id);
end $$;
create function public.campaign_admin_cultivos(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.portal_exigir_gestion(p_tenant_id,'campaign.manage','CAMPAIGN');
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.nombre),'[]'::jsonb) from public.cultivos c);
end $$;
create function public.campaign_admin_crear(p_tenant_id uuid,p_codigo text,p_nombre text,p_cultivo_id uuid,p_fecha_inicio date,p_fecha_fin date default null,p_estado public.estado_campania default 'ACTIVA')
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  perform public.portal_exigir_gestion(p_tenant_id,'campaign.manage','CAMPAIGN');
  perform public.campaign_admin_validar_datos(p_codigo,p_nombre,p_fecha_inicio,p_fecha_fin,p_cultivo_id);
  if p_estado is null or p_estado::text not in ('ACTIVA','CERRADA') then raise exception 'Estado inicial inválido'; end if;
  insert into public.campanias(tenant_id,codigo,nombre,cultivo_id,fecha_inicio,fecha_fin,estado)
    values(p_tenant_id,btrim(p_codigo),btrim(p_nombre),p_cultivo_id,p_fecha_inicio,p_fecha_fin,p_estado) returning id into v_id;
  return public.campaign_admin_dto(p_tenant_id,v_id);
end $$;
create function public.campaign_admin_editar(p_tenant_id uuid,p_id uuid,p_codigo text,p_nombre text,p_cultivo_id uuid,p_fecha_inicio date,p_fecha_fin date default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_anterior uuid;
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_id);
  select cultivo_id into v_anterior from public.campanias where id=p_id and tenant_id=p_tenant_id;
  perform public.campaign_admin_validar_datos(p_codigo,p_nombre,p_fecha_inicio,p_fecha_fin,p_cultivo_id,v_anterior);
  -- El trigger existente conserva cultivo histórico con lotes o personal.
  update public.campanias set codigo=btrim(p_codigo),nombre=btrim(p_nombre),cultivo_id=p_cultivo_id,
    fecha_inicio=p_fecha_inicio,fecha_fin=p_fecha_fin where id=p_id and tenant_id=p_tenant_id;
  return public.campaign_admin_dto(p_tenant_id,p_id);
end $$;
create function public.campaign_admin_activar(p_tenant_id uuid,p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_id);
  if not exists(select 1 from public.campanias c join public.cultivos cu on cu.id=c.cultivo_id
    where c.id=p_id and c.estado='CERRADA' and cu.activo) then raise exception 'Sólo una campaña cerrada con cultivo activo se puede activar'; end if;
  update public.campanias set estado='ACTIVA',fecha_fin=null where id=p_id and tenant_id=p_tenant_id;
  perform public.recalcular_accesos_app_campania(p_id);
  return public.campaign_admin_dto(p_tenant_id,p_id);
end $$;
create function public.campaign_admin_cerrar(p_tenant_id uuid,p_id uuid,p_fecha_fin date default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_fin date:=coalesce(p_fecha_fin,(clock_timestamp() at time zone 'America/Lima')::date); v_inicio date;
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_id);
  select fecha_inicio into v_inicio from public.campanias where id=p_id and tenant_id=p_tenant_id and estado='ACTIVA';
  if not found then raise exception 'Sólo una campaña activa se puede cerrar'; end if;
  if v_fin<v_inicio then raise exception 'La fecha de fin no puede ser anterior al inicio'; end if;
  update public.campanias set estado='CERRADA',fecha_fin=v_fin where id=p_id and tenant_id=p_tenant_id;
  perform public.recalcular_accesos_app_campania(p_id);
  return public.campaign_admin_dto(p_tenant_id,p_id);
end $$;
create function public.campaign_admin_variedades(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_campania_id);
  return (select coalesce(jsonb_agg(to_jsonb(v) order by v.nombre,v.id),'[]'::jsonb) from public.variedades v
    join public.campanias c on c.cultivo_id=v.cultivo_id and c.tenant_id=v.tenant_id
    where c.id=p_campania_id and c.tenant_id=p_tenant_id);
end $$;
create function public.campaign_admin_guardar_variedad(p_tenant_id uuid,p_campania_id uuid,p_id uuid,p_nombre text,p_activo boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_cultivo uuid; v_resultado jsonb;
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_campania_id);
  if nullif(btrim(p_nombre),'') is null or p_activo is null then raise exception 'Nombre y estado de variedad requeridos'; end if;
  select cultivo_id into v_cultivo from public.campanias where id=p_campania_id and tenant_id=p_tenant_id;
  if p_id is null then
    insert into public.variedades(tenant_id,cultivo_id,nombre,activo) values(p_tenant_id,v_cultivo,btrim(p_nombre),p_activo)
      returning to_jsonb(variedades) into v_resultado;
  else
    update public.variedades v set nombre=btrim(p_nombre),activo=p_activo
      where v.id=p_id and v.tenant_id=p_tenant_id and v.cultivo_id=v_cultivo returning to_jsonb(v) into v_resultado;
    if v_resultado is null then raise exception using errcode='42501',message='Variedad de otra empresa o cultivo'; end if;
  end if;
  return v_resultado;
end $$;
create function public.campaign_admin_lotes(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_campania_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'codigo',l.codigo,'nombre',l.nombre,'activo',l.activo,
    'variedadIds',coalesce((select jsonb_agg(lv.variedad_id order by lv.variedad_id) from public.lote_variedades lv
      where lv.lote_id=l.id and lv.tenant_id=p_tenant_id and lv.activo),'[]'::jsonb)) order by l.codigo),'[]'::jsonb)
    from public.lotes l where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id);
end $$;
create function public.campaign_admin_configurar_variedades_lote(p_tenant_id uuid,p_campania_id uuid,p_lote_id uuid,p_variedad_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_cultivo uuid; v_actual uuid; v_ids uuid[];
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_campania_id);
  select cultivo_id into v_cultivo from public.campanias where id=p_campania_id and tenant_id=p_tenant_id;
  select variedad_id into v_actual from public.lotes where id=p_lote_id and campania_id=p_campania_id and tenant_id=p_tenant_id for update;
  if not found then raise exception using errcode='42501',message='Lote operativo de otra campaña o empresa'; end if;
  if coalesce(cardinality(p_variedad_ids),0)=0 or array_position(p_variedad_ids,null) is not null then raise exception 'Seleccione al menos una variedad'; end if;
  select array_agg(distinct id order by id) into v_ids from unnest(p_variedad_ids) id;
  if exists(select 1 from unnest(v_ids) seleccion(variedad_id) where not exists(select 1 from public.variedades v
    where v.id=seleccion.variedad_id and v.tenant_id=p_tenant_id and v.cultivo_id=v_cultivo and (v.activo or exists(
      select 1 from public.lote_variedades lv where lv.lote_id=p_lote_id and lv.variedad_id=v.id and lv.activo)))) then
    raise exception 'Variedad de otra empresa/cultivo o no disponible'; end if;
  -- Nunca borrar asociaciones con sesiones históricas ni inventar estructura física.
  update public.lote_variedades set activo=false where lote_id=p_lote_id and tenant_id=p_tenant_id and not(variedad_id=any(v_ids));
  insert into public.lote_variedades(tenant_id,lote_id,variedad_id,activo)
    select p_tenant_id,p_lote_id,id,true from unnest(v_ids) id
    on conflict(lote_id,variedad_id) do update set activo=true;
  update public.lotes set variedad_id=case when v_actual=any(v_ids) then v_actual else v_ids[1] end
    where id=p_lote_id and tenant_id=p_tenant_id;
  return public.campaign_admin_lotes(p_tenant_id,p_campania_id);
end $$;

create function public.workforce_admin_dto(p_tenant uuid,p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',id,'tenantId',tenant_id,'dni',dni,'nombres',nombres,'apellidos',apellidos,'activo',activo)
  from public.trabajadores where tenant_id=p_tenant and id=p_id;
$$;
create function public.workforce_admin_exigir_trabajador(p_tenant uuid,p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.portal_exigir_gestion(p_tenant,'workforce.manage','WORKFORCE');
  perform 1 from public.trabajadores where tenant_id=p_tenant and id=p_id for update;
  if not found then raise exception using errcode='42501',message='Trabajador no pertenece a la empresa autorizada'; end if;
end $$;
create function public.workforce_admin_listar(p_tenant_id uuid,p_busqueda text default '',p_activo boolean default null,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q text:=lower(btrim(coalesce(p_busqueda,''))); v_total bigint; v_filas jsonb;
begin
  perform public.portal_exigir_gestion(p_tenant_id,'workforce.manage','WORKFORCE');
  if p_offset is null or p_offset<0 then raise exception 'Paginación inválida'; end if;
  select count(*) into v_total from public.trabajadores t where t.tenant_id=p_tenant_id
    and position(q in lower(t.dni||' '||t.nombres||' '||t.apellidos))>0 and (p_activo is null or t.activo=p_activo);
  select coalesce(jsonb_agg(dto),'[]'::jsonb) into v_filas from (
    select public.workforce_admin_dto(p_tenant_id,t.id) dto from public.trabajadores t where t.tenant_id=p_tenant_id
      and position(q in lower(t.dni||' '||t.nombres||' '||t.apellidos))>0 and (p_activo is null or t.activo=p_activo)
    order by t.apellidos,t.nombres,t.id limit 50 offset p_offset) filas;
  return jsonb_build_object('trabajadores',v_filas,'total',v_total);
end $$;
create function public.workforce_admin_obtener(p_tenant_id uuid,p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.workforce_admin_exigir_trabajador(p_tenant_id,p_id);
  return public.workforce_admin_dto(p_tenant_id,p_id);
end $$;
create function public.workforce_admin_guardar_datos(p_tenant uuid,p_id uuid,p_dni text,p_nombres text,p_apellidos text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid:=p_id;
begin
  perform public.portal_exigir_gestion(p_tenant,'workforce.manage','WORKFORCE');
  if p_dni is null or btrim(p_dni)!~'^[0-9]{8}$' or nullif(btrim(p_nombres),'') is null or nullif(btrim(p_apellidos),'') is null then
    raise exception 'DNI de ocho dígitos, nombres y apellidos requeridos'; end if;
  if p_id is null then
    -- Un alta duplicada no debe sobrescribir silenciosamente al trabajador.
    insert into public.trabajadores(tenant_id,dni,nombres,apellidos,activo)
      values(p_tenant,btrim(p_dni),btrim(p_nombres),btrim(p_apellidos),true) returning id into v_id;
  else
    perform public.workforce_admin_exigir_trabajador(p_tenant,p_id);
    update public.trabajadores set dni=btrim(p_dni),nombres=btrim(p_nombres),apellidos=btrim(p_apellidos)
      where tenant_id=p_tenant and id=p_id;
  end if;
  return public.workforce_admin_dto(p_tenant,v_id);
end $$;
create function public.workforce_admin_crear(p_tenant_id uuid,p_dni text,p_nombres text,p_apellidos text)
returns jsonb language sql volatile security definer set search_path=pg_catalog,public as $$
  select public.workforce_admin_guardar_datos(p_tenant_id,null,p_dni,p_nombres,p_apellidos);
$$;
create function public.workforce_admin_editar(p_tenant_id uuid,p_id uuid,p_dni text,p_nombres text,p_apellidos text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.workforce_admin_exigir_trabajador(p_tenant_id,p_id);
  return public.workforce_admin_guardar_datos(p_tenant_id,p_id,p_dni,p_nombres,p_apellidos);
end $$;
create function public.workforce_admin_estado(p_tenant uuid,p_id uuid,p_activo boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.workforce_admin_exigir_trabajador(p_tenant,p_id);
  update public.trabajadores set activo=p_activo where tenant_id=p_tenant and id=p_id;
  perform public.recalcular_acceso_app_trabajador(p_id);
  return public.workforce_admin_dto(p_tenant,p_id);
end $$;
create function public.workforce_admin_activar(p_tenant_id uuid,p_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog,public as $$ select public.workforce_admin_estado(p_tenant_id,p_id,true); $$;
create function public.workforce_admin_desactivar(p_tenant_id uuid,p_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog,public as $$ select public.workforce_admin_estado(p_tenant_id,p_id,false); $$;
create function public.workforce_admin_catalogo(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.portal_exigir_gestion(p_tenant_id,'workforce.manage','WORKFORCE');
  -- Recurso mínimo de participación; no concede gestión de Campaign.
  return jsonb_build_object('campanias',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'codigo',c.codigo,
    'nombre',c.nombre,'estado',c.estado) order by c.codigo),'[]'::jsonb) from public.campanias c where c.tenant_id=p_tenant_id),
    'roles',jsonb_build_array('SUPERVISORA','COSECHADOR'));
end $$;
create function public.workforce_admin_participaciones(p_tenant_id uuid,p_trabajador_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.workforce_admin_exigir_trabajador(p_tenant_id,p_trabajador_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'campaniaId',c.id,'campania',c.codigo,
    'rol',r.rol,'activo',r.activo,'fechaJabero',r.fecha_asignacion_jabero,'administrable',r.rol::text in ('SUPERVISORA','COSECHADOR'))
    order by c.codigo,r.rol),'[]'::jsonb) from public.trabajador_campania_rol r join public.campanias c on c.id=r.campania_id and c.tenant_id=r.tenant_id
    where r.tenant_id=p_tenant_id and r.trabajador_id=p_trabajador_id);
end $$;
create function public.workforce_admin_cambiar_rol(p_tenant uuid,p_trabajador uuid,p_campania uuid,p_rol public.rol_trabajador,p_activo boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_estado public.estado_campania; v_activo boolean;
begin
  perform public.portal_exigir_gestion(p_tenant,'workforce.manage','WORKFORCE');
  if p_rol is null or p_rol::text not in ('SUPERVISORA','COSECHADOR') then raise exception 'JABERO conserva su asignación diaria en el PDA'; end if;
  select estado into v_estado from public.campanias where id=p_campania and tenant_id=p_tenant for update;
  if not found then raise exception using errcode='42501',message='Campaña de otra empresa'; end if;
  perform public.workforce_admin_exigir_trabajador(p_tenant,p_trabajador);
  select activo into v_activo from public.trabajadores where id=p_trabajador and tenant_id=p_tenant;
  if p_activo then
    if v_estado::text<>'ACTIVA' or not v_activo then raise exception 'La campaña y el trabajador deben estar activos'; end if;
    insert into public.trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo)
      values(p_tenant,p_trabajador,p_campania,p_rol,true)
      on conflict(trabajador_id,campania_id,rol) do update set activo=true;
  else
    update public.trabajador_campania_rol set activo=false
      where tenant_id=p_tenant and trabajador_id=p_trabajador and campania_id=p_campania and rol=p_rol;
    if not found then raise exception 'Participación inexistente'; end if;
  end if;
  -- Reutiliza la consistencia legacy, sin crear Usuario Identity ni tocar fecha JABERO.
  perform public.recalcular_acceso_app_trabajador(p_trabajador);
  return public.workforce_admin_participaciones(p_tenant,p_trabajador);
end $$;
create function public.workforce_admin_asignar_rol(p_tenant_id uuid,p_trabajador_id uuid,p_campania_id uuid,p_rol public.rol_trabajador)
returns jsonb language sql volatile security definer set search_path=pg_catalog,public as $$ select public.workforce_admin_cambiar_rol(p_tenant_id,p_trabajador_id,p_campania_id,p_rol,true); $$;
create function public.workforce_admin_retirar_rol(p_tenant_id uuid,p_trabajador_id uuid,p_campania_id uuid,p_rol public.rol_trabajador)
returns jsonb language sql volatile security definer set search_path=pg_catalog,public as $$ select public.workforce_admin_cambiar_rol(p_tenant_id,p_trabajador_id,p_campania_id,p_rol,false); $$;

create function public.portal_f73_version() returns integer language sql immutable as $$ select 1; $$;
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'campaign_admin_%' or p.proname like 'workforce_admin_%' or p.proname in ('portal_exigir_gestion','portal_f73_version')) loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname in ('campaign_admin_listar','campaign_admin_obtener','campaign_admin_cultivos','campaign_admin_crear','campaign_admin_editar',
      'campaign_admin_activar','campaign_admin_cerrar','campaign_admin_variedades','campaign_admin_guardar_variedad','campaign_admin_lotes',
      'campaign_admin_configurar_variedades_lote','workforce_admin_listar','workforce_admin_obtener','workforce_admin_crear','workforce_admin_editar',
      'workforce_admin_activar','workforce_admin_desactivar','workforce_admin_catalogo','workforce_admin_participaciones',
      'workforce_admin_asignar_rol','workforce_admin_retirar_rol') then execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
end $portal_f73$;
notify pgrst,'reload schema';
commit;
