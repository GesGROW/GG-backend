begin;

do $preflight$
begin
  if to_regprocedure('public.harvest_cultivos_exigir_campania(uuid,uuid)') is null then
    raise exception 'Aplique 202610221000_harvest_cultivos_supervisores.sql antes del listado de trabajadores';
  end if;
end $preflight$;

-- No inventar una fecha de incorporación para participaciones históricas.
-- Separar ADD y DEFAULT mantiene esos registros en NULL y fecha los nuevos.
alter table public.trabajador_campania_rol add column if not exists iniciado_en timestamptz;
alter table public.trabajador_campania_rol alter column iniciado_en set default clock_timestamp();

create or replace function public.harvest_admin_trabajadores(
  p_tenant_id uuid,p_campania_id uuid,p_rol text,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_resultado jsonb;
begin
  if p_campania_id is null or p_rol is null or p_rol not in ('COSECHADOR','JABERO','SUPERVISORA')
    or p_offset is null or p_offset<0 then raise exception 'Consulta de trabajadores inválida'; end if;
  -- Lectura de Cosecha, sin otorgar administración global de Personal.
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  with participantes as (
    select r.id,t.dni::text,concat_ws(' ',nullif(btrim(t.nombres),''),nullif(btrim(t.apellidos),'')) nombre,
      t.activo and r.activo activo,r.iniciado_en
    from public.trabajador_campania_rol r join public.trabajadores t
      on t.tenant_id=r.tenant_id and t.id=r.trabajador_id
    where r.tenant_id=p_tenant_id and r.campania_id=p_campania_id and r.rol::text=p_rol
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
