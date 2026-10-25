begin;

-- Temporary print documents are not harvest lots or usable tickets. Prefixes
-- remain burned after cancellation, so a stray printed label is never reused.
create table public.harvest_impresion_pendientes (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  campania_id uuid not null,
  actor_usuario_id uuid not null,
  documento jsonb not null,
  foreign key(tenant_id,campania_id) references public.campanias(tenant_id,id),
  foreign key(actor_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
create index harvest_impresion_pendientes_campania on public.harvest_impresion_pendientes(tenant_id,campania_id);
create table public.harvest_impresion_reservas (
  codigo_lote text primary key references public.harvest_impresion_codigos_lote(codigo_lote),
  operacion_id uuid not null,
  tenant_id uuid not null references public.tenants(id),
  lote_id uuid not null unique
);
create index harvest_impresion_reservas_operacion on public.harvest_impresion_reservas(operacion_id);
create index harvest_impresion_reservas_tenant on public.harvest_impresion_reservas(tenant_id);
create table public.harvest_impresion_confirmadas (
  operacion_id uuid primary key references public.harvest_generaciones(id),
  confirmada_en timestamptz not null default clock_timestamp(),
  actor_usuario_id uuid not null references public.identity_usuarios(id)
);
create index harvest_impresion_confirmadas_actor on public.harvest_impresion_confirmadas(actor_usuario_id);
do $$ declare t text; begin
  foreach t in array array['harvest_impresion_pendientes','harvest_impresion_reservas','harvest_impresion_confirmadas'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

-- Imported codes must respect provisional AND cancelled print reservations.
create or replace function public.harvest_impresion_reservar_importados()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.harvest_impresion_codigos_lote(codigo_lote)
    select distinct substring(codigo,2,6) from impresion_tickets_nuevos
    where codigo ~ '^C[0-9]{8,}$' order by 1 on conflict do nothing;
  if exists(with prefijos as materialized (
    select distinct substring(codigo,2,6) codigo_lote,lote_id from impresion_tickets_nuevos
    where codigo ~ '^C[0-9]{8,}$'
  ) select 1 from prefijos t join public.harvest_impresion_codigos_lote r using(codigo_lote)
    left join public.harvest_impresion_reservas p using(codigo_lote)
    where coalesce(r.lote_id,p.lote_id) is not null and coalesce(r.lote_id,p.lote_id)<>t.lote_id) then
    raise exception using errcode='23505',message='codigoLote reservado para otro lote de impresión';
  end if;
  return null;
end $$;

create function public.harvest_admin_reservar_impresion(
  p_tenant_id uuid,p_campania_id uuid,p_operacion_id uuid,p_cantidad integer,p_tamanio integer,p_vista_previa jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_admin_exigir(p_tenant_id,p_campania_id,true);
  v_documento jsonb; v_previa jsonb; v_lotes jsonb:='[]'; l jsonb; v_codigo text; v_lote uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('harvest.generar:'||p_operacion_id::text,0));
  if exists(select 1 from public.harvest_generaciones where id=p_operacion_id) then
    raise exception 'La operación ya es una generación definitiva';
  end if;
  select documento into v_documento from public.harvest_impresion_pendientes
    where id=p_operacion_id and tenant_id=p_tenant_id and actor_usuario_id=v_actor;
  if found then
    if v_documento->>'campaniaId' is distinct from p_campania_id::text
      or (v_documento->>'cantidadTickets')::integer is distinct from p_cantidad
      or (v_documento->>'tamanioLote')::integer is distinct from p_tamanio then
      raise exception 'ID de generación reutilizado con otra intención';
    end if;
    if public.harvest_impresion_intencion(v_documento-'estadoImpresion') is distinct from public.harvest_impresion_intencion(p_vista_previa) then
      raise exception 'ID de generación reutilizado con otra vista previa';
    end if;
    return v_documento;
  end if;
  if exists(select 1 from public.harvest_impresion_reservas where operacion_id=p_operacion_id) then
    raise exception 'La operación fue cancelada o pertenece a otro usuario';
  end if;
  v_previa:=public.harvest_admin_previsualizar(p_tenant_id,p_campania_id,p_operacion_id,p_cantidad,p_tamanio);
  if public.harvest_impresion_intencion(v_previa) is distinct from public.harvest_impresion_intencion(p_vista_previa) then
    raise exception 'La vista previa cambió. Actualízala y revisa los tickets antes de imprimir';
  end if;
  for l in select value from jsonb_array_elements(v_previa->'lotes') loop
    v_lote:=gen_random_uuid();
    v_codigo:=public.harvest_impresion_reservar_lote(null);
    if v_codigo is distinct from l->>'codigoLote' then
      raise exception 'La vista previa cambió. Actualízala y revisa los tickets antes de imprimir';
    end if;
    insert into public.harvest_impresion_reservas values(v_codigo,p_operacion_id,p_tenant_id,v_lote);
    v_lotes:=v_lotes||jsonb_build_array(l||jsonb_build_object('id',v_lote));
  end loop;
  v_documento:=(v_previa-'previsualizacion')||jsonb_build_object('lotes',v_lotes,
    'creadaEn',clock_timestamp(),'estadoImpresion','PENDIENTE');
  insert into public.harvest_impresion_pendientes values(p_operacion_id,p_tenant_id,p_campania_id,v_actor,v_documento);
  return v_documento;
end $$;

-- The legacy generator cannot reuse a pending/cancelled operation identifier.
do $$ declare s text; n text; begin
  s:=pg_get_functiondef('public.harvest_admin_generar(uuid,uuid,uuid,integer,integer)'::regprocedure);
  n:=replace(s,'select * into v_previa from public.harvest_generaciones where id=p_operacion_id;',
    'if exists(select 1 from public.harvest_impresion_reservas where operacion_id=p_operacion_id)
      and not exists(select 1 from public.harvest_generaciones where id=p_operacion_id) then
      raise exception ''La operación corresponde a una impresión provisional o cancelada'';
    end if;
    select * into v_previa from public.harvest_generaciones where id=p_operacion_id;');
  if s=n then raise exception 'No se pudo proteger la operación provisional'; end if;
  execute n;
end $$;

-- Extend the existing authorized reader without changing immutable receipts.
create or replace function public.harvest_admin_generacion(p_tenant_id uuid,p_operacion_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare d jsonb; v_fecha timestamptz;
begin
  perform public.harvest_admin_exigir(p_tenant_id,null,true);
  select resultado into d from public.harvest_generaciones where id=p_operacion_id and tenant_id=p_tenant_id;
  if not found then
    select documento into d from public.harvest_impresion_pendientes where id=p_operacion_id and tenant_id=p_tenant_id;
  else
    select confirmada_en into v_fecha from public.harvest_impresion_confirmadas where operacion_id=p_operacion_id;
    d:=d||jsonb_build_object('estadoImpresion',case when v_fecha is null then 'SIN_CONFIRMAR' else 'IMPRESA' end,
      'impresionConfirmadaEn',v_fecha);
  end if;
  if d is null then raise exception using errcode='42501',message='Generación de otra empresa o inexistente'; end if;
  perform public.harvest_admin_exigir(p_tenant_id,(d->>'campaniaId')::uuid,true);
  if d ? 'cultivoId' and not public.harvest_cultivos_puede_leer(p_tenant_id,(d->>'cultivoId')::uuid) then
    raise exception using errcode='42501',message='Generación sin participación autorizada en el cultivo del snapshot';
  end if;
  return d;
end $$;

create function public.harvest_admin_resolver_impresion(p_tenant_id uuid,p_operacion_id uuid,p_impresa boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare d jsonb; l jsonb; v_actor uuid; v_lote uuid; v_campania uuid; v_fecha timestamptz;
begin
  v_actor:=public.harvest_admin_exigir(p_tenant_id,null,true);
  if p_operacion_id is null or p_impresa is null then raise exception 'Operación y confirmación requeridas'; end if;
  perform pg_advisory_xact_lock(hashtextextended('harvest.generar:'||p_operacion_id::text,0));
  -- A lost cancellation reply can be retried without reviving the document.
  if not p_impresa and not exists(select 1 from public.harvest_impresion_pendientes where id=p_operacion_id)
    and not exists(select 1 from public.harvest_generaciones where id=p_operacion_id)
    and exists(select 1 from public.harvest_impresion_reservas where operacion_id=p_operacion_id and tenant_id=p_tenant_id) then
    return jsonb_build_object('operacionId',p_operacion_id,'tenantId',p_tenant_id,'cancelada',true);
  end if;
  d:=public.harvest_admin_generacion(p_tenant_id,p_operacion_id);
  v_campania:=(d->>'campaniaId')::uuid;
  if not p_impresa then
    if d->>'estadoImpresion'<>'PENDIENTE' then
      raise exception 'La generación ya fue guardada. Confirma la impresión para recuperar el resultado';
    end if;
    delete from public.harvest_impresion_pendientes where id=p_operacion_id and tenant_id=p_tenant_id;
    return jsonb_build_object('operacionId',p_operacion_id,'tenantId',p_tenant_id,'cancelada',true);
  end if;
  if d->>'estadoImpresion'='PENDIENTE' then
    v_fecha:=(d->>'creadaEn')::timestamptz;
    for l in select value from jsonb_array_elements(d->'lotes') loop
      v_lote:=(l->>'id')::uuid;
      insert into public.harvest_lotes_tickets(id,tenant_id,campania_id,creado_en) values(v_lote,p_tenant_id,v_campania,v_fecha);
      insert into public.harvest_impresion_lotes values(v_lote,p_operacion_id,l->>'codigoLote',(l->>'numeroLote')::integer);
      insert into public.harvest_tickets(codigo,lote_id,campania_id,tenant_id)
        select 'C'||(l->>'codigoLote')||case when n<10 then '0'||n::text else n::text end,v_lote,v_campania,p_tenant_id
          from generate_series(1,(l->>'cantidadTickets')::integer) n;
      insert into public.harvest_impresion_filas
        select 'C'||(l->>'codigoLote')||case when n<10 then '0'||n::text else n::text end,v_lote,v_campania,n
          from generate_series(1,(l->>'cantidadTickets')::integer) n;
    end loop;
    insert into public.harvest_generaciones values(p_operacion_id,p_tenant_id,v_campania,(d->>'actorUsuarioId')::uuid,
      (d->>'cantidadTickets')::integer,(d->>'tamanioLote')::integer,v_fecha,d-'estadoImpresion');
    delete from public.harvest_impresion_pendientes where id=p_operacion_id;
  end if;
  insert into public.harvest_impresion_confirmadas(operacion_id,actor_usuario_id) values(p_operacion_id,v_actor) on conflict do nothing;
  return public.harvest_admin_generacion(p_tenant_id,p_operacion_id);
end $$;

-- The same paged print API reads provisional documents as well as saved rows.
do $$ declare s text; n text; begin
  s:=pg_get_functiondef('public.harvest_admin_documento_impresion(uuid,uuid,integer)'::regprocedure);
  n:=replace(s,'select coalesce(jsonb_agg(jsonb_build_object',
    'if g->>''estadoImpresion''=''PENDIENTE'' then
      select coalesce(jsonb_agg(fila order by ordinal,numero),''[]''::jsonb) into v_filas from (
        select l.ordinal,n.numero,jsonb_build_object(''codigo'',''C''||(l.d->>''codigoLote'')||case when n.numero<10 then ''0''||n.numero::text else n.numero::text end,
          ''codigoLote'',l.d->>''codigoLote'',''numeroLote'',l.ordinal,''numeroTicket'',n.numero) fila
        from jsonb_array_elements(g->''lotes'') with ordinality l(d,ordinal)
        cross join lateral generate_series(1,(l.d->>''cantidadTickets'')::integer) n(numero)
        order by l.ordinal,n.numero limit 500 offset p_offset
      ) p;
      return jsonb_build_object(''operacionId'',g->''operacionId'',''campaniaId'',g->''campaniaId'',''fecha'',g->''fecha'',
        ''abreviaturaCultivo'',g->''abreviaturaCultivo'',''total'',g->''cantidadTickets'',''filas'',v_filas);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object');
  if s=n then raise exception 'No se pudo ampliar el documento de impresión'; end if;
  execute n;
  s:=pg_get_functiondef('public.harvest_admin_lote_dto(uuid,uuid)'::regprocedure);
  n:=replace(s,'''generacionId'',i.operacion_id,',
    '''estadoImpresion'',case when i.operacion_id is null then null when exists(select 1 from public.harvest_impresion_confirmadas x where x.operacion_id=i.operacion_id) then ''IMPRESA'' else ''SIN_CONFIRMAR'' end,''generacionId'',i.operacion_id,');
  if s=n then raise exception 'No se pudo ampliar el estado de los lotes'; end if;
  execute n;
end $$;

revoke all on function public.harvest_admin_reservar_impresion(uuid,uuid,uuid,integer,integer,jsonb),
  public.harvest_admin_resolver_impresion(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.harvest_admin_reservar_impresion(uuid,uuid,uuid,integer,integer,jsonb),
  public.harvest_admin_resolver_impresion(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
