begin;
do $preflight$ begin
  if to_regprocedure('public.harvest_cultivos_exigir_campania(uuid,uuid)') is null then
    raise exception 'Aplique 202610221000_harvest_cultivos_supervisores.sql antes de los reportes de campaña';
  end if;
end $preflight$;

create or replace function public.harvest_reportes_campania(
  p_tenant_id uuid,p_campania_id uuid,p_tipo text,p_lote_id uuid default null,
  p_variedad_id uuid default null,p_desde date default null,p_hasta date default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_hoy date:=(statement_timestamp() at time zone 'America/Lima')::date;
  v_desde date; v_hasta date; v_inicio date; v_datos jsonb; v_catalogo jsonb;
begin
  if p_campania_id is null or p_tipo is null or p_tipo not in ('PRODUCCION','RENDIMIENTO') then
    raise exception 'Campaña y tipo de reporte requeridos'; end if;
  perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if p_lote_id is not null and not exists(select 1 from public.lotes
    where tenant_id=p_tenant_id and campania_id=p_campania_id and id=p_lote_id) then
    raise exception using errcode='42501',message='Lote de otra campaña o empresa'; end if;
  if p_variedad_id is not null and not exists(select 1 from public.lotes l
    left join public.lote_variedades lv on lv.tenant_id=l.tenant_id and lv.lote_id=l.id
    where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id and (p_lote_id is null or l.id=p_lote_id)
      and (l.variedad_id=p_variedad_id or lv.variedad_id=p_variedad_id)) then
    raise exception using errcode='42501',message='Variedad ajena a los lotes de esta campaña'; end if;
  select fecha_inicio into v_inicio from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
  select coalesce(p_desde,case when p_tipo='RENDIMIENTO' then v_hoy else
    least(v_hoy,coalesce(v_inicio,v_hoy),coalesce(min((fecha_hora at time zone 'America/Lima')::date),v_hoy)) end)
    into v_desde from public.harvest_produccion_reportable where campania_id=p_campania_id;
  v_hasta:=coalesce(p_hasta,v_hoy);
  if not isfinite(v_desde) or not isfinite(v_hasta) or v_desde>v_hasta or v_hasta>v_hoy or v_hasta-v_desde>3660 then
    raise exception 'Seleccione un período válido hasta hoy, de hasta diez años'; end if;

  -- Catálogo de la campaña, incluso sin producción; no se deduce de las lecturas.
  with relaciones as (
    select l.id lote_id,l.variedad_id from public.lotes l
      where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id and l.variedad_id is not null
    union
    select l.id,lv.variedad_id from public.lotes l join public.lote_variedades lv
      on lv.lote_id=l.id and lv.tenant_id=l.tenant_id
      where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  ) select jsonb_build_object('lotes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'nombre',coalesce(nullif(btrim(l.nombre),''),l.codigo),'variedades',coalesce((
        select jsonb_agg(variedad_id order by variedad_id) from relaciones where lote_id=l.id),'[]'::jsonb)) order by l.codigo,l.id)
      from public.lotes l where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id),'[]'::jsonb),
    'variedades',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'nombre',v.nombre) order by v.nombre,v.id)
      from public.variedades v where v.tenant_id=p_tenant_id and exists(select 1 from relaciones r where r.variedad_id=v.id)),'[]'::jsonb)) into v_catalogo;

  -- Una única fuente de hechos admitidos para métricas, evolución y ranking.
  -- No excluir historia cuando un trabajador, lote o variedad deja de estar activo.
  with hechos as materialized (
    select p.*,(p.fecha_hora at time zone 'America/Lima')::date dia
    from public.harvest_produccion_reportable p
    join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id and l.campania_id=p.campania_id
    where p.campania_id=p_campania_id and (p_lote_id is null or p.lote_id=p_lote_id)
      and (p_variedad_id is null or p.variedad_id=p_variedad_id)
      and p.fecha_hora >= (v_desde::timestamp at time zone 'America/Lima')
      and p.fecha_hora < ((v_hasta+1)::timestamp at time zone 'America/Lima')
  ), diaria as (
    select dia,count(*) jabas from hechos group by dia
  ), personas as (
    select h.trabajador_id id,t.dni,coalesce(nullif(btrim(concat_ws(' ',t.nombres,t.apellidos)),''),'Sin nombre registrado') nombre,
      count(*) jabas from hechos h join public.trabajadores t on t.id=h.trabajador_id and t.tenant_id=p_tenant_id
    group by h.trabajador_id,t.dni,t.nombres,t.apellidos
  ), ranking as (
    select *,dense_rank() over(order by jabas desc) posicion from personas
  ) select jsonb_build_object('ok',true,'hoy',v_hoy,'desde',v_desde,'hasta',v_hasta,'catalogo',v_catalogo,
    'metricas',jsonb_build_object('totalJabas',(select count(*) from hechos),
      'jabasHoy',(select count(*) from hechos where dia=v_hoy),
      'diasProduccion',(select count(*) from diaria),
      'promedioDiario',coalesce((select round(avg(jabas),1) from diaria),0),
      'cosechadoresActivos',(select count(*) from personas),
      'promedioCosechador',coalesce((select round(avg(jabas),1) from personas),0),
      'mayorRendimiento',coalesce((select max(jabas) from personas),0)),
    'evolucion',coalesce((select jsonb_agg(jsonb_build_object('fecha',d::date,'jabas',coalesce(diaria.jabas,0)) order by d)
      from generate_series(v_desde::timestamp,v_hasta::timestamp,interval '1 day') d left join diaria on diaria.dia=d::date),'[]'::jsonb),
    'ranking',coalesce((select jsonb_agg(to_jsonb(r) order by r.jabas desc,r.nombre,r.id) from ranking r),'[]'::jsonb)) into v_datos;
  return jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo',p_tipo,
    'actualizadoEn',clock_timestamp(),'datos',v_datos);
end $$;
revoke all on function public.harvest_reportes_campania(uuid,uuid,text,uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.harvest_reportes_campania(uuid,uuid,text,uuid,uuid,date,date) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on function public.harvest_reportes_campania(uuid,uuid,text,uuid,uuid,date,date) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
