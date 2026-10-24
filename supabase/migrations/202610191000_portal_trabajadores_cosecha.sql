begin;

-- Actividad operativa confirmada, incluyendo cosechador, jabero y operador.
-- Las ediciones del maestro no cuentan como actividad en campo.
create or replace view public.workforce_cosecha_actividad as
select c.tenant_id, p.trabajador_id, p.campania_id, p.fecha_hora
from public.harvest_produccion_reportable p
join public.campanias c on c.id=p.campania_id
union all
select s.tenant_id, r.trabajador_id, l.campania_id, e.fecha
from public.sesiones_lectura s
join public.lotes l on l.id=s.lote_id and l.tenant_id=s.tenant_id
join public.trabajador_campania_rol r on r.id=s.jabero_rol_id and r.tenant_id=s.tenant_id
cross join lateral (select s.fecha_inicio fecha union all select s.fecha_fin
  union all select j.fecha_hora from public.lecturas_jaba j where j.sesion_id=s.id and j.tenant_id=s.tenant_id
  union all select h.fecha_hora from public.harvest_registros_cosecha h where h.sesion_id=s.id and h.tenant_id=s.tenant_id) e
where e.fecha is not null
union all
select s.tenant_id, u.trabajador_id, l.campania_id, e.fecha
from public.sesiones_lectura s
join public.lotes l on l.id=s.lote_id and l.tenant_id=s.tenant_id
join public.usuarios_app u on u.id=s.iniciada_por_usuario_id and u.tenant_id=s.tenant_id
cross join lateral (select s.fecha_inicio fecha union all select s.fecha_fin
  union all select j.fecha_hora from public.lecturas_jaba j where j.sesion_id=s.id and j.tenant_id=s.tenant_id
  union all select h.fecha_hora from public.harvest_registros_cosecha h where h.sesion_id=s.id and h.tenant_id=s.tenant_id) e
where e.fecha is not null;
revoke all on public.workforce_cosecha_actividad from public,anon,authenticated,service_role;

create or replace function public.workforce_cosecha_listar(p_tenant_id uuid,p_filtros jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_campania uuid:=nullif(p_filtros->>'campania','')::uuid;
  v_funcion text:=nullif(p_filtros->>'funcion','');
  v_estado text:=nullif(p_filtros->>'estado','');
  v_datos text:=nullif(p_filtros->>'datos','');
  v_offset integer:=coalesce((p_filtros->>'offset')::integer,0);
  v_busqueda text:=translate(lower(btrim(coalesce(p_filtros->>'busqueda',''))),'áéíóúüñ','aeiouun');
  v_resultado jsonb;
begin
  perform public.portal_exigir_gestion(p_tenant_id,'workforce.manage','WORKFORCE');
  perform public.portal_exigir_gestion(p_tenant_id,'workforce.manage','HARVEST');
  if v_offset<0 or (v_funcion is not null and v_funcion not in ('COSECHADOR','JABERO','SUPERVISORA'))
    or (v_estado is not null and v_estado not in ('ACTIVO','INACTIVO'))
    or (v_datos is not null and v_datos not in ('COMPLETOS','PENDIENTES')) then raise exception 'Filtros inválidos'; end if;
  if v_campania is not null and not exists(select 1 from public.campanias where id=v_campania and tenant_id=p_tenant_id) then
    raise exception using errcode='42501',message='Campaña no pertenece a la empresa autorizada'; end if;
  with actividad as (
    select trabajador_id,min(fecha_hora) primera,max(fecha_hora) ultima
    from public.workforce_cosecha_actividad where tenant_id=p_tenant_id and (v_campania is null or campania_id=v_campania)
    group by trabajador_id
  ), base as (
    select t.id,t.dni,t.nombres,t.apellidos,t.activo,
      (nullif(btrim(t.nombres),'') is not null and nullif(btrim(t.apellidos),'') is not null) as "datosCompletos",
      a.primera as "primeraActividad",a.ultima as "ultimaActividad",
      coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'campaniaId',c.id,'campania',c.nombre,'estadoCampania',c.estado,
        'rol',r.rol,'activo',r.activo,'fechaJabero',r.fecha_asignacion_jabero,
        'vigente',r.activo and c.estado='ACTIVA' and (r.rol<>'JABERO' or r.fecha_asignacion_jabero=(now() at time zone 'America/Lima')::date))
        order by c.nombre,r.rol)
        from public.trabajador_campania_rol r join public.campanias c on c.id=r.campania_id and c.tenant_id=r.tenant_id
        where r.tenant_id=t.tenant_id and r.trabajador_id=t.id),'[]'::jsonb) as participaciones
    from public.trabajadores t left join actividad a on a.trabajador_id=t.id where t.tenant_id=p_tenant_id
  ), filtrados as materialized (
    select b.* from base b
    where position(v_busqueda in translate(lower(b.dni||' '||b.nombres||' '||b.apellidos),'áéíóúüñ','aeiouun'))>0
      and (v_estado is null or b.activo=(v_estado='ACTIVO'))
      and (v_datos is null or b."datosCompletos"=(v_datos='COMPLETOS'))
      and ((v_campania is null and v_funcion is null) or exists(
        select 1 from jsonb_array_elements(b.participaciones) r
        where (r->>'activo')::boolean and (v_campania is null or r->>'campaniaId'=v_campania::text)
          and (v_funcion is null or r->>'rol'=v_funcion)))
  ), pagina as (select * from filtrados order by apellidos,nombres,id limit 50 offset v_offset)
  select jsonb_build_object('trabajadores',coalesce((select jsonb_agg(to_jsonb(p) order by p.apellidos,p.nombres,p.id) from pagina p),'[]'::jsonb),
    'total',(select count(*) from filtrados),
    'resumen',jsonb_build_object('activos',(select count(*) from filtrados where activo),
      'cosechadores',(select count(*) from filtrados b where b.activo and exists(select 1 from jsonb_array_elements(b.participaciones) r
        where r->>'rol'='COSECHADOR' and (r->>'vigente')::boolean and (v_campania is null or r->>'campaniaId'=v_campania::text))),
      'pendientes',(select count(*) from filtrados where not "datosCompletos")),
    'campanias',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'estado',estado) order by nombre),'[]'::jsonb)
      from public.campanias where tenant_id=p_tenant_id)) into v_resultado;
  return v_resultado;
end $$;
revoke all on function public.workforce_cosecha_listar(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.workforce_cosecha_listar(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
