begin;

-- Separate RPCs keep existing readers and printing compatible with the old API.
do $preflight$ begin
  if to_regprocedure('public.harvest_admin_indice(uuid,text)') is null
    or to_regprocedure('public.harvest_admin_trabajadores(uuid,uuid,text,integer)') is null then
    raise exception 'Aplique las migraciones de listados y trabajadores de campaña antes de los filtros';
  end if;
end $preflight$;

create or replace function public.harvest_admin_listar_filtrado(
  p_tenant_id uuid,p_tipo text,p_campania_id uuid,p_busqueda text default '',
  p_lote_id uuid default null,p_trabajador_id uuid default null,p_estado text default '',
  p_offset integer default 0,p_desde date default null,p_hasta date default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_resultado jsonb;
  v_hoy date := (statement_timestamp() at time zone 'America/Lima')::date;
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if p_campania_id is null or p_tipo is null or p_tipo not in ('lotes','asignaciones')
    or p_offset is null or p_offset<0 or length(coalesce(p_busqueda,''))>200
    or p_estado is null or p_estado not in ('','DISPONIBLE','ASIGNADO') then
    raise exception 'Consulta o filtros de lotes inválidos';
  end if;
  if (p_desde is not null and (not isfinite(p_desde) or p_desde>v_hoy))
    or (p_hasta is not null and (not isfinite(p_hasta) or p_hasta>v_hoy))
    or p_desde>p_hasta then raise exception 'Período inválido'; end if;
  if p_lote_id is not null and not exists(select 1 from public.harvest_lotes_tickets
    where tenant_id=p_tenant_id and campania_id=p_campania_id and id=p_lote_id) then
    raise exception using errcode='42501',message='Lote de otra campaña o empresa'; end if;
  if p_trabajador_id is not null and not exists(select 1 from public.trabajadores
    where tenant_id=p_tenant_id and id=p_trabajador_id) then
    raise exception using errcode='42501',message='Trabajador de otra empresa'; end if;
  -- The index retains crop visibility and the confirmed assignment timestamp.
  -- Filter/count before pagination; DTOs are built only for the requested page.
  with filtradas as materialized (
    select i.clave,i.fecha from public.harvest_admin_indice(p_tenant_id,p_tipo) i
    where i.campania_id=p_campania_id
      and (p_lote_id is null or i.lote_id=p_lote_id)
      and (p_trabajador_id is null or i.trabajador_id=p_trabajador_id)
      and (p_estado='' or i.estado=p_estado)
      and position(translate(lower(btrim(coalesce(p_busqueda,''))),'áéíóúüñ','aeiouun')
        in translate(lower(concat_ws(' ',i.busqueda,i.clave)),'áéíóúüñ','aeiouun'))>0
      and (p_desde is null or i.fecha >= (p_desde::timestamp at time zone 'America/Lima'))
      and (p_hasta is null or i.fecha < ((p_hasta+1)::timestamp at time zone 'America/Lima'))
  ), pagina as (
    select * from filtradas order by fecha desc nulls last,clave limit 50 offset p_offset
  )
  select jsonb_build_object('filas',coalesce((select jsonb_agg(
    public.harvest_admin_dto(p_tenant_id,p_tipo,clave) order by fecha desc nulls last,clave)
    from pagina),'[]'::jsonb),'total',(select count(*) from filtradas)) into v_resultado;
  return v_resultado;
end $$;


create or replace function public.harvest_admin_trabajadores_filtrados(
  p_tenant_id uuid,p_campania_id uuid,p_rol text,p_offset integer default 0,
  p_busqueda text default '',p_activo boolean default null,p_desde date default null,p_hasta date default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_resultado jsonb; v_hoy date := (statement_timestamp() at time zone 'America/Lima')::date;
begin
  if p_campania_id is null or p_rol is null or p_rol not in ('COSECHADOR','JABERO','SUPERVISORA')
    or p_offset is null or p_offset<0 then raise exception 'Consulta de trabajadores inválida'; end if;
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if length(coalesce(p_busqueda,''))>200
    or (p_desde is not null and (not isfinite(p_desde) or p_desde>v_hoy))
    or (p_hasta is not null and (not isfinite(p_hasta) or p_hasta>v_hoy))
    or p_desde>p_hasta then raise exception 'Filtros de trabajadores inválidos'; end if;
  with supervisores_portal as (
    select s.usuario_id id,m.trabajador_id,t.dni::text,
      coalesce(nullif(btrim(u.nombre),''),nullif(btrim(concat_ws(' ',t.nombres,t.apellidos)),''),'Sin nombre registrado') nombre,
      u.activo and m.activo and exists(
        select 1 from public.identity_membresia_roles mr
        join public.identity_roles r on r.id=mr.rol_id and r.tenant_id=mr.tenant_id and r.activo
        join public.identity_rol_permisos rp on rp.rol_id=r.id and rp.tenant_id=r.tenant_id
        where mr.tenant_id=p_tenant_id and mr.membresia_id=m.id and rp.permiso='harvest.manage'
      ) activo,
      greatest(s.creado_en,c.created_at) iniciado_en
    from public.campanias c
    join public.harvest_cultivo_supervisores s on s.tenant_id=c.tenant_id and s.cultivo_id=c.cultivo_id
    join public.identity_usuarios u on u.id=s.usuario_id
    join public.identity_membresias m on m.tenant_id=s.tenant_id and m.usuario_id=s.usuario_id
    left join public.trabajadores t on t.tenant_id=m.tenant_id and t.id=m.trabajador_id
    where p_rol='SUPERVISORA' and c.tenant_id=p_tenant_id and c.id=p_campania_id
  ), participantes as (
    select id,dni,nombre,activo,iniciado_en from supervisores_portal
    union all
    select r.id,t.dni::text,concat_ws(' ',nullif(btrim(t.nombres),''),nullif(btrim(t.apellidos),'')) nombre,
      t.activo and r.activo activo,r.iniciado_en
    from public.trabajador_campania_rol r join public.trabajadores t
      on t.tenant_id=r.tenant_id and t.id=r.trabajador_id
    where r.tenant_id=p_tenant_id and r.campania_id=p_campania_id and r.rol::text=p_rol
      and not exists(select 1 from supervisores_portal s where s.trabajador_id=r.trabajador_id)
  ), filtradas as materialized (
    select * from participantes
    where (p_activo is null or activo=p_activo)
      and position(translate(lower(btrim(coalesce(p_busqueda,''))),'áéíóúüñ','aeiouun')
        in translate(lower(concat_ws(' ',coalesce(nullif(nombre,''),'Sin nombre registrado'),dni)),'áéíóúüñ','aeiouun'))>0
      and (p_desde is null or iniciado_en >= (p_desde::timestamp at time zone 'America/Lima'))
      and (p_hasta is null or iniciado_en < ((p_hasta+1)::timestamp at time zone 'America/Lima'))
  ), pagina as (
    select * from filtradas order by iniciado_en desc nulls last,nombre,id limit 50 offset p_offset
  )
  select jsonb_build_object('filas',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'dni',dni,'nombre',coalesce(nullif(nombre,''),'Sin nombre registrado'),
    'activo',activo,'iniciadoEn',iniciado_en) order by iniciado_en desc nulls last,nombre,id) from pagina),'[]'::jsonb),
    'total',(select count(*) from filtradas)) into v_resultado;
  return v_resultado;
end $$;

revoke all on function public.harvest_admin_listar_filtrado(uuid,text,uuid,text,uuid,uuid,text,integer,date,date) from public,anon,authenticated;
revoke all on function public.harvest_admin_trabajadores_filtrados(uuid,uuid,text,integer,text,boolean,date,date) from public,anon,authenticated;
grant execute on function public.harvest_admin_listar_filtrado(uuid,text,uuid,text,uuid,uuid,text,integer,date,date) to authenticated;
grant execute on function public.harvest_admin_trabajadores_filtrados(uuid,uuid,text,integer,text,boolean,date,date) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on function public.harvest_admin_listar_filtrado(uuid,text,uuid,text,uuid,uuid,text,integer,date,date) from service_role;
    revoke all on function public.harvest_admin_trabajadores_filtrados(uuid,uuid,text,integer,text,boolean,date,date) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
