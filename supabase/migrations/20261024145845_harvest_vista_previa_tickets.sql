begin;

-- Preview is a read of candidate identifiers, never a reservation. In
-- particular, it must not call nextval or insert a generation/ticket/lot.
create function public.harvest_admin_previsualizar(
  p_tenant_id uuid,p_campania_id uuid,p_operacion_id uuid,p_cantidad integer,p_tamanio integer
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_admin_exigir(p_tenant_id,p_campania_id,true);
  v_inicio bigint; v_reservados bigint; v_numero integer; v_lotes jsonb;
  v_cultivo uuid; v_nombre text; v_abreviatura text;
begin
  if p_campania_id is null or p_operacion_id is null or p_cantidad is null or p_tamanio is null
    or p_cantidad not between 1 and 100000 or p_tamanio not between 1 and 100000 then
    raise exception 'ID y cantidades enteras entre 1 y 100000 requeridos';
  end if;
  if not exists(select 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id and estado='ACTIVA') then
    raise exception 'La campaña debe estar activa para preparar tickets nuevos';
  end if;
  select cu.id,cu.nombre,cu.abreviatura_impresion into strict v_cultivo,v_nombre,v_abreviatura
    from public.campanias c join public.cultivos cu on cu.id=c.cultivo_id
    where c.id=p_campania_id and c.tenant_id=p_tenant_id;
  select case when is_called then last_value+1 else last_value end into v_inicio
    from public.harvest_impresion_codigo_lote_seq;
  v_numero:=(p_cantidad+p_tamanio-1)/p_tamanio;
  select count(*) into v_reservados from public.harvest_impresion_codigos_lote
    where codigo_lote>=lpad(v_inicio::text,6,'0');
  with candidatos as (
    select n from generate_series(v_inicio,least(999999,v_inicio+v_numero+v_reservados-1)) n
    where not exists(select 1 from public.harvest_impresion_codigos_lote r where r.codigo_lote=lpad(n::text,6,'0'))
    order by n limit v_numero
  ), enumerados as (select n,row_number() over(order by n)::integer ordinal from candidatos)
  select jsonb_agg(jsonb_build_object('codigoLote',lpad(n::text,6,'0'),'numeroLote',ordinal,
    'cantidadTickets',least(p_tamanio,p_cantidad-(ordinal-1)*p_tamanio)) order by ordinal)
    into v_lotes from enumerados;
  if coalesce(jsonb_array_length(v_lotes),0)<>v_numero then
    raise exception using errcode='22003',message='Se agotaron los códigos de lote de impresión (000001..999999)';
  end if;
  return jsonb_build_object('operacionId',p_operacion_id,'tenantId',p_tenant_id,'campaniaId',p_campania_id,
    'actorUsuarioId',v_actor,'cantidadTickets',p_cantidad,'tamanioLote',p_tamanio,'lotes',v_lotes,
    'formatoImpresion','TSC_30X20_3','fecha',to_char(clock_timestamp() at time zone 'America/Lima','YYYYMMDD'),
    'cultivoId',v_cultivo,'cultivoNombre',v_nombre,'abreviaturaCultivo',v_abreviatura,'previsualizacion',true);
end $$;

-- Compare everything reviewed except persisted UUIDs and creation timestamp.
-- Do not accept altered date, crop, numbering, actor, quantities or campaign.
create function public.harvest_impresion_intencion(p_documento jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,public as $$
  select (p_documento-'lotes'-'creadaEn'-'previsualizacion') ||
    jsonb_build_object('lotes',(select jsonb_agg(l-'id' order by n)
      from jsonb_array_elements(p_documento->'lotes') with ordinality a(l,n)));
$$;

create function public.harvest_admin_confirmar_impresion(
  p_tenant_id uuid,p_campania_id uuid,p_operacion_id uuid,p_cantidad integer,p_tamanio integer,p_vista_previa jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_previa jsonb; v_resultado jsonb;
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id,true);
  if jsonb_typeof(p_vista_previa) is distinct from 'object'
    or jsonb_typeof(p_vista_previa->'lotes') is distinct from 'array' then
    raise exception 'Primero prepara una vista previa válida';
  end if;
  -- Same lock and idempotent intent as the existing generator. A lost reply
  -- can be retried with the original preview, even after the campaign closes.
  perform pg_advisory_xact_lock(hashtextextended('harvest.generar:'||p_operacion_id::text,0));
  if exists(select 1 from public.harvest_generaciones where id=p_operacion_id) then
    v_resultado:=public.harvest_admin_generar(p_tenant_id,p_campania_id,p_operacion_id,p_cantidad,p_tamanio);
    if public.harvest_impresion_intencion(v_resultado) is distinct from public.harvest_impresion_intencion(p_vista_previa) then
      raise exception 'ID de generación reutilizado con otra vista previa';
    end if;
    return v_resultado;
  end if;
  v_previa:=public.harvest_admin_previsualizar(p_tenant_id,p_campania_id,p_operacion_id,p_cantidad,p_tamanio);
  if public.harvest_impresion_intencion(v_previa) is distinct from public.harvest_impresion_intencion(p_vista_previa) then
    raise exception 'La vista previa cambió. Actualízala y revisa los tickets antes de imprimir';
  end if;
  v_resultado:=public.harvest_admin_generar(p_tenant_id,p_campania_id,p_operacion_id,p_cantidad,p_tamanio);
  -- Another client/import can allocate a prefix after the read above. Raising
  -- here rolls back ALL new rows; no different ticket can silently be printed.
  if public.harvest_impresion_intencion(v_resultado) is distinct from public.harvest_impresion_intencion(p_vista_previa) then
    raise exception 'La vista previa cambió. Actualízala y revisa los tickets antes de imprimir';
  end if;
  return v_resultado;
end $$;

revoke all on function public.harvest_impresion_intencion(jsonb) from public,anon,authenticated;
revoke all on function public.harvest_admin_previsualizar(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.harvest_admin_confirmar_impresion(uuid,uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on function public.harvest_impresion_intencion(jsonb),
      public.harvest_admin_previsualizar(uuid,uuid,uuid,integer,integer),
      public.harvest_admin_confirmar_impresion(uuid,uuid,uuid,integer,integer,jsonb) from service_role;
  end if;
end $$;
grant execute on function public.harvest_admin_previsualizar(uuid,uuid,uuid,integer,integer),
  public.harvest_admin_confirmar_impresion(uuid,uuid,uuid,integer,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
