begin;

do $preflight$
begin
  if to_regprocedure('public.harvest_admin_trabajadores(uuid,uuid,text,integer)') is null
    or to_regclass('public.harvest_cultivo_supervisores') is null then
    raise exception 'Aplique las migraciones de cultivos y trabajadores de campaña antes de ampliar Supervisores';
  end if;
end $preflight$;

-- The list includes crop participants without creating workers or granting
-- operational roles. The same tenant/campaign guards protect all three lists.
create or replace function public.harvest_admin_trabajadores(
  p_tenant_id uuid,p_campania_id uuid,p_rol text,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_resultado jsonb;
begin
  if p_campania_id is null or p_rol is null or p_rol not in ('COSECHADOR','JABERO','SUPERVISORA')
    or p_offset is null or p_offset<0 then raise exception 'Consulta de trabajadores inválida'; end if;
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
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
  ), pagina as (
    select * from participantes order by iniciado_en desc nulls last,nombre,id limit 50 offset p_offset
  )
  select jsonb_build_object('filas',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'dni',dni,'nombre',coalesce(nullif(nombre,''),'Sin nombre registrado'),
    'activo',activo,'iniciadoEn',iniciado_en) order by iniciado_en desc nulls last,nombre,id) from pagina),'[]'::jsonb),
    'total',(select count(*) from participantes)) into v_resultado;
  return v_resultado;
end $$;

revoke all on function public.harvest_admin_trabajadores(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.harvest_admin_trabajadores(uuid,uuid,text,integer) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on function public.harvest_admin_trabajadores(uuid,uuid,text,integer) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
