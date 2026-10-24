begin;
do $portal_f74$
begin
  if obj_description(to_regclass('public.harvest_generaciones'),'pg_class')='GesGROW F7.4: administración Harvest v1' then return; end if;
  if to_regprocedure('public.portal_f73_version()') is null then raise exception 'Aplique F7.3 antes de F7.4'; end if;

-- Permiso independiente de operar en campo y de consultar. Se amplía sólo
-- el catálogo; la autorización nunca compara nombres de rol.
do $$ declare r record; begin
  for r in select oid,conname from pg_constraint where conrelid='public.identity_permisos'::regclass and contype='c'
    and position('company.manage' in pg_get_constraintdef(oid))>0 loop
    execute format('alter table public.identity_permisos drop constraint %I',r.conname);
  end loop;
end $$;
alter table public.identity_permisos add constraint identity_permisos_catalogo_f74 check(codigo in (
  'company.manage','campaign.manage','workforce.manage','harvest.operate','harvest.view','reports.view','harvest.manage'));
insert into public.identity_permisos(codigo) values('harvest.manage') on conflict do nothing;
insert into public.identity_rol_permisos(tenant_id,rol_id,permiso)
  select tenant_id,id,'harvest.manage' from public.identity_roles where codigo='ADMIN_EMPRESA' on conflict do nothing;
-- iam_sembrar_roles ya asigna todo el catálogo a ADMIN_EMPRESA para nuevos Tenants.

create table public.harvest_generaciones (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  campania_id uuid not null,
  actor_usuario_id uuid not null,
  cantidad_tickets integer not null check(cantidad_tickets between 1 and 100000),
  tamanio_lote integer not null check(tamanio_lote between 1 and 100000),
  creada_en timestamptz not null default clock_timestamp(),
  resultado jsonb not null,
  foreign key(tenant_id,campania_id) references public.campanias(tenant_id,id),
  foreign key(actor_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
create index harvest_generaciones_campania on public.harvest_generaciones(tenant_id,campania_id,creada_en);
alter table public.harvest_generaciones enable row level security;
revoke all on public.harvest_generaciones from public,anon,authenticated;
if exists(select 1 from pg_roles where rolname='service_role') then revoke all on public.harvest_generaciones from service_role; end if;
create function public.harvest_admin_generacion_inmutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'El recibo de generación es inmutable'; end $$;
create trigger harvest_generacion_inmutable before update or delete on public.harvest_generaciones
  for each row execute function public.harvest_admin_generacion_inmutable();
create trigger harvest_generacion_no_truncate before truncate on public.harvest_generaciones
  for each statement execute function public.harvest_admin_generacion_inmutable();

create function public.harvest_admin_exigir(p_tenant uuid,p_campania uuid default null,p_gestion boolean default false)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid;
begin
  perform public.iam_resolver_tenant_context(p_tenant);
  if p_gestion then v_actor:=public.iam_exigir_permiso(p_tenant,'harvest.manage');
  else
    if not(public.iam_tiene_permiso(p_tenant,'harvest.view') or public.iam_tiene_permiso(p_tenant,'harvest.manage')) then
      raise exception using errcode='42501',message='Permiso de consulta Harvest requerido'; end if;
    v_actor:=public.iam_usuario_actual();
  end if;
  perform public.platform_exigir_modulo(p_tenant,'HARVEST');
  if p_campania is not null then
    perform 1 from public.campanias where id=p_campania and tenant_id=p_tenant for share;
    if not found then raise exception using errcode='42501',message='Campaña de otra empresa o inexistente'; end if;
  end if;
  return v_actor;
end $$;
create function public.harvest_admin_campanias(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.harvest_admin_exigir(p_tenant_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'codigo',c.codigo,'nombre',c.nombre,'estado',c.estado,
    'cutover',case when h.campania_id is null then null else jsonb_build_object('campaniaId',h.campania_id,
      'version',h.version,'activadoEn',h.activado_en) end) order by c.codigo),'[]'::jsonb)
    from public.campanias c left join public.harvest_cutovers h on h.campania_id=c.id and h.tenant_id=c.tenant_id where c.tenant_id=p_tenant_id);
end $$;
-- Equivalente servidor de GenerarLotesDeTickets F5. Sólo recibe intención.
-- Toda la partición y códigos se deciden aquí y se confirman en una transacción
-- sobre los mismos agregados/PK/FK F5; ningún UPDATE de asignaciones/consumos.
create function public.harvest_admin_generar(p_tenant_id uuid,p_campania_id uuid,p_operacion_id uuid,p_cantidad integer,p_tamanio integer)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_admin_exigir(p_tenant_id,p_campania_id,true);
  v_previa public.harvest_generaciones%rowtype; v_lote uuid; v_cantidad integer; v_restantes integer:=p_cantidad;
  v_ids uuid[]:=array[]::uuid[]; v_lotes jsonb; v_resultado jsonb; v_ahora timestamptz;
begin
  if p_campania_id is null or p_operacion_id is null or p_cantidad is null or p_tamanio is null or p_cantidad not between 1 and 100000 or p_tamanio not between 1 and 100000 then
    raise exception 'ID y cantidades enteras entre 1 y 100000 requeridos'; end if;
  perform pg_advisory_xact_lock(hashtextextended('harvest.generar:'||p_operacion_id::text,0));
  select * into v_previa from public.harvest_generaciones where id=p_operacion_id;
  if found then
    if v_previa.tenant_id<>p_tenant_id or v_previa.campania_id<>p_campania_id or v_previa.actor_usuario_id<>v_actor
      or v_previa.cantidad_tickets<>p_cantidad or v_previa.tamanio_lote<>p_tamanio then raise exception 'ID de generación reutilizado con otra intención'; end if;
    return v_previa.resultado;
  end if;
  if not exists(select 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id and estado='ACTIVA') then
    raise exception 'La campaña debe estar activa para generar tickets'; end if;
  -- F5 permite preparar catálogo antes del cutover. No se activa ni cambia aquí
  -- la frontera; F5.6 sigue siendo autoridad de la operación de campo.
  while v_restantes>0 loop
    v_lote:=gen_random_uuid(); v_cantidad:=least(v_restantes,p_tamanio);
    insert into public.harvest_lotes_tickets(id,tenant_id,campania_id) values(v_lote,p_tenant_id,p_campania_id);
    insert into public.harvest_tickets(codigo,lote_id,campania_id,tenant_id)
      select 'GG-'||gen_random_uuid()::text,v_lote,p_campania_id,p_tenant_id from generate_series(1,v_cantidad);
    v_ids:=array_append(v_ids,v_lote);
    v_restantes:=v_restantes-v_cantidad;
  end loop;
  select jsonb_agg(jsonb_build_object('id',l.id,'cantidadTickets',least(p_tamanio,p_cantidad-(l.orden-1)*p_tamanio))
    order by l.orden) into v_lotes from unnest(v_ids) with ordinality l(id,orden);
  v_ahora:=clock_timestamp();
  v_resultado:=jsonb_build_object('operacionId',p_operacion_id,'tenantId',p_tenant_id,'campaniaId',p_campania_id,
    'actorUsuarioId',v_actor,'creadaEn',v_ahora,'cantidadTickets',p_cantidad,'tamanioLote',p_tamanio,'lotes',v_lotes);
  insert into public.harvest_generaciones(id,tenant_id,campania_id,actor_usuario_id,cantidad_tickets,tamanio_lote,creada_en,resultado)
    values(p_operacion_id,p_tenant_id,p_campania_id,v_actor,p_cantidad,p_tamanio,v_ahora,v_resultado);
  return v_resultado;
end $$;

create function public.harvest_admin_registro_dto(p_tenant uuid,p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',r.id,'campaniaId',r.campania_id,'campania',c.codigo,'codigoTicket',r.codigo_ticket,
    'loteId',r.lote_id,'asignacionOperacionId',r.asignacion_operacion_id,'operacionId',r.operacion_id,'fechaHora',r.fecha_hora,
    'registradoEn',r.creado_en,'versionProduccion',r.version_produccion,'sesionId',r.sesion_id,
    'trabajador',jsonb_build_object('id',w.id,'dni',w.dni,'nombre',concat_ws(' ',w.nombres,w.apellidos)),
    'loteOperativo',l.codigo,'variedad',v.nombre)
  from public.harvest_registros_cosecha r join public.campanias c on c.id=r.campania_id and c.tenant_id=r.tenant_id
    join public.trabajadores w on w.id=r.trabajador_id and w.tenant_id=r.tenant_id
    left join public.sesiones_lectura s on s.id=r.sesion_id and s.tenant_id=r.tenant_id
    left join public.lotes l on l.id=s.lote_id and l.tenant_id=r.tenant_id
    left join public.variedades v on v.id=s.variedad_id and v.tenant_id=r.tenant_id
  where r.tenant_id=p_tenant and r.id=p_id;
$$;
create function public.harvest_admin_lote_dto(p_tenant uuid,p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',l.id,'campaniaId',c.id,'campania',c.codigo,'creadoEn',l.creado_en,
    'cantidadTickets',(select count(*) from public.harvest_tickets t where t.lote_id=l.id and t.tenant_id=p_tenant),
    'utilizados',(select count(*) from public.harvest_registros_cosecha r where r.lote_id=l.id and r.tenant_id=p_tenant),
    'estado',case when a.lote_id is null then 'DISPONIBLE' else 'ASIGNADO' end,
    'asignacion',case when a.lote_id is null then null else jsonb_build_object('operacionId',a.operacion_id,
      'trabajador',jsonb_build_object('id',w.id,'dni',w.dni,'nombre',concat_ws(' ',w.nombres,w.apellidos))) end)
  from public.harvest_lotes_tickets l join public.campanias c on c.id=l.campania_id and c.tenant_id=l.tenant_id
    left join public.harvest_asignaciones_lote a on a.lote_id=l.id and a.tenant_id=l.tenant_id
    left join public.trabajadores w on w.id=a.trabajador_id and w.tenant_id=a.tenant_id
  where l.tenant_id=p_tenant and l.id=p_id;
$$;
create function public.harvest_admin_dto(p_tenant uuid,p_tipo text,p_clave text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_dto jsonb;
begin
  case p_tipo
    when 'lotes' then return public.harvest_admin_lote_dto(p_tenant,p_clave::uuid);
    when 'registros' then return public.harvest_admin_registro_dto(p_tenant,p_clave::uuid);
    when 'asignaciones' then
      select public.harvest_admin_lote_dto(p_tenant,a.lote_id)||jsonb_build_object('operacionId',a.operacion_id,
        'trabajador',jsonb_build_object('id',w.id,'dni',w.dni,'nombre',concat_ws(' ',w.nombres,w.apellidos))) into v_dto
      from public.harvest_asignaciones_lote a join public.trabajadores w on w.id=a.trabajador_id and w.tenant_id=a.tenant_id
      where a.tenant_id=p_tenant and a.lote_id=p_clave::uuid;
    when 'tickets' then
      select jsonb_build_object('codigo',t.codigo,'estado',case when r.id is null then 'DISPONIBLE' else 'UTILIZADO' end,
        'lote',public.harvest_admin_lote_dto(p_tenant,t.lote_id),'registro',public.harvest_admin_registro_dto(p_tenant,r.id)) into v_dto
      from public.harvest_tickets t left join public.harvest_registros_cosecha r on r.codigo_ticket=t.codigo and r.tenant_id=t.tenant_id
      where t.tenant_id=p_tenant and t.codigo=p_clave;
    else raise exception 'Consulta Harvest desconocida';
  end case;
  return v_dto;
end $$;
-- Índice de lectura neutral. Estados derivados exclusivamente de asignación y consumo.
create function public.harvest_admin_indice(p_tenant uuid,p_tipo text)
returns table(clave text,campania_id uuid,lote_id uuid,trabajador_id uuid,busqueda text,estado text,fecha timestamptz)
language sql stable security definer set search_path=pg_catalog,public as $$
  select l.id::text,l.campania_id,l.id,a.trabajador_id,l.id::text||' '||c.codigo,
    case when a.lote_id is null then 'DISPONIBLE' else 'ASIGNADO' end,l.creado_en
  from public.harvest_lotes_tickets l join public.campanias c on c.id=l.campania_id and c.tenant_id=l.tenant_id
    left join public.harvest_asignaciones_lote a on a.lote_id=l.id and a.tenant_id=l.tenant_id
  where l.tenant_id=p_tenant and p_tipo='lotes'
  union all
  select t.codigo,t.campania_id,t.lote_id,a.trabajador_id,t.codigo,
    case when r.id is null then 'DISPONIBLE' else 'UTILIZADO' end,l.creado_en
  from public.harvest_tickets t join public.harvest_lotes_tickets l on l.id=t.lote_id and l.tenant_id=t.tenant_id
    left join public.harvest_asignaciones_lote a on a.lote_id=t.lote_id and a.tenant_id=t.tenant_id
    left join public.harvest_registros_cosecha r on r.codigo_ticket=t.codigo and r.tenant_id=t.tenant_id
  where t.tenant_id=p_tenant and p_tipo='tickets'
  union all
  select a.lote_id::text,a.campania_id,a.lote_id,a.trabajador_id,concat_ws(' ',w.dni,w.nombres,w.apellidos),'ASIGNADO',l.creado_en
  from public.harvest_asignaciones_lote a join public.trabajadores w on w.id=a.trabajador_id and w.tenant_id=a.tenant_id
    join public.harvest_lotes_tickets l on l.id=a.lote_id and l.tenant_id=a.tenant_id
  where a.tenant_id=p_tenant and p_tipo='asignaciones'
  union all
  select r.id::text,r.campania_id,r.lote_id,r.trabajador_id,concat_ws(' ',r.codigo_ticket,w.dni,w.nombres,w.apellidos),'UTILIZADO',r.fecha_hora
  from public.harvest_registros_cosecha r join public.trabajadores w on w.id=r.trabajador_id and w.tenant_id=r.tenant_id
  where r.tenant_id=p_tenant and p_tipo='registros';
$$;
create function public.harvest_admin_listar(p_tenant_id uuid,p_tipo text,p_campania_id uuid default null,p_busqueda text default '',
  p_lote_id uuid default null,p_trabajador_id uuid default null,p_estado text default '',p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_resultado jsonb;
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  if p_tipo is null or p_tipo not in ('lotes','tickets','asignaciones','registros') or p_offset is null or p_offset<0
    or p_estado is null or p_estado not in ('','DISPONIBLE','ASIGNADO','UTILIZADO') then raise exception 'Consulta o filtros inválidos'; end if;
  if p_lote_id is not null and not exists(select 1 from public.harvest_lotes_tickets where id=p_lote_id and tenant_id=p_tenant_id
    and (p_campania_id is null or campania_id=p_campania_id)) then raise exception using errcode='42501',message='Lote de otra campaña o empresa'; end if;
  if p_trabajador_id is not null and not exists(select 1 from public.trabajadores where id=p_trabajador_id and tenant_id=p_tenant_id) then
    raise exception using errcode='42501',message='Trabajador de otra empresa'; end if;
  with filtradas as materialized (select * from public.harvest_admin_indice(p_tenant_id,p_tipo) i
    where (p_campania_id is null or i.campania_id=p_campania_id) and (p_lote_id is null or i.lote_id=p_lote_id)
      and (p_trabajador_id is null or i.trabajador_id=p_trabajador_id) and (p_estado='' or i.estado=p_estado)
      and position(lower(btrim(coalesce(p_busqueda,''))) in lower(i.busqueda))>0)
  select jsonb_build_object('filas',coalesce((select jsonb_agg(public.harvest_admin_dto(p_tenant_id,p_tipo,pg.clave)
    order by pg.fecha desc,pg.clave) from (select clave,fecha from filtradas order by fecha desc,clave limit 50 offset p_offset) pg),'[]'::jsonb),
    'total',(select count(*) from filtradas)) into v_resultado;
  return v_resultado;
end $$;
create function public.harvest_admin_filtros(p_tenant_id uuid,p_campania_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  return jsonb_build_object('trabajadores',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'dni',w.dni,
    'nombre',concat_ws(' ',w.nombres,w.apellidos)) order by w.dni),'[]'::jsonb) from public.trabajadores w
    where w.tenant_id=p_tenant_id and exists(select 1 from public.harvest_asignaciones_lote a
      where a.trabajador_id=w.id and a.tenant_id=p_tenant_id and (p_campania_id is null or a.campania_id=p_campania_id))));
end $$;
create function public.harvest_admin_obtener(p_tenant_id uuid,p_tipo text,p_clave text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_dto jsonb;
begin
  perform public.harvest_admin_exigir(p_tenant_id);
  v_dto:=public.harvest_admin_dto(p_tenant_id,p_tipo,p_clave);
  if v_dto is null then raise exception using errcode='42501',message='Recurso Harvest de otra empresa o inexistente'; end if;
  return v_dto;
end $$;
-- API deliberadamente sin asignar/reasignar, consumir, editar registros ni imprimir.
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'harvest_admin_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname in ('harvest_admin_campanias','harvest_admin_filtros','harvest_admin_generar','harvest_admin_listar','harvest_admin_obtener') then
      execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
comment on table public.harvest_generaciones is 'GesGROW F7.4: administración Harvest v1';
end $portal_f74$;
notify pgrst,'reload schema';
commit;
