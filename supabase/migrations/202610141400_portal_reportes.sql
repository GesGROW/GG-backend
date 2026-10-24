begin;
do $portal_f75$
begin
  if to_regprocedure('public.portal_f75_version()') is not null then return; end if;
  if to_regclass('public.harvest_generaciones') is null then raise exception 'Aplique F7.4 antes de F7.5'; end if;

-- Fachada de lectura del Portal: la empresa elegida siempre se contrasta con
-- membresía, permisos, contratación y ownership persistidos. No cambia F5.6.
create function public.harvest_reportes_exigir(p_tenant uuid,p_campania uuid default null)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_resolver_tenant_context(p_tenant);
  perform public.iam_exigir_permiso(p_tenant,'reports.view');
  perform public.platform_exigir_modulo(p_tenant,'HARVEST');
  if p_campania is not null and not exists(select 1 from public.campanias where id=p_campania and tenant_id=p_tenant) then
    raise exception using errcode='42501',message='Campaña de otra empresa o inexistente'; end if;
end $$;
create function public.harvest_reportes_campanias(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.harvest_reportes_exigir(p_tenant_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'codigo',c.codigo,'nombre',c.nombre,
    'estado',c.estado) order by c.estado,c.codigo,c.id),'[]'::jsonb) from public.campanias c where c.tenant_id=p_tenant_id);
end $$;
create function public.harvest_reportes_validar(p_tenant_id uuid,p_campania_id uuid)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if p_campania_id is null then raise exception 'Campaña requerida'; end if;
  perform public.harvest_reportes_exigir(p_tenant_id,p_campania_id);
  return true;
end $$;
create function public.harvest_reportes_obtener(p_tenant_id uuid,p_campania_id uuid,p_tipo text,p_periodo text default 'CAMPANIA')
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_datos jsonb; v_diaria jsonb; v_hoy date:=(statement_timestamp() at time zone 'America/Lima')::date;
begin
  perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
  case p_tipo
    when 'RESUMEN' then v_datos:=public.harvest_proyectar_resumen(p_campania_id,'America/Lima');
    when 'DIARIA' then v_datos:=public.harvest_proyectar_diaria(p_campania_id,'America/Lima');
    when 'LOTES' then v_datos:=public.harvest_proyectar_lotes(p_campania_id);
    when 'RANKING' then v_datos:=public.harvest_proyectar_ranking(p_campania_id,p_periodo);
    when 'DASHBOARD' then
      -- Sólo composición de proyecciones F5.6. La fila de hoy y los totales
      -- provienen del mismo read model; no se suman universos en el navegador.
      select public.harvest_proyectar_resumen(p_campania_id,'America/Lima'),
        public.harvest_proyectar_diaria(p_campania_id,'America/Lima') into v_datos,v_diaria;
      v_datos:=v_datos||jsonb_build_object('hoy',coalesce((select f from jsonb_array_elements(v_diaria->'produccion') f
        where f->>'fecha'=v_hoy::text),jsonb_build_object('fecha',v_hoy,'total_jabas',0,'total_cosechadores',0,'total_sesiones',0)));
    else raise exception 'Reporte desconocido';
  end case;
  return jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo',p_tipo,
    'actualizadoEn',clock_timestamp(),'datos',v_datos);
end $$;
create function public.portal_f75_version() returns integer language sql immutable as $$ select 1; $$;
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'harvest_reportes_%' or p.proname='portal_f75_version') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname in ('harvest_reportes_campanias','harvest_reportes_obtener','harvest_reportes_validar') then
      execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
end $portal_f75$;
notify pgrst,'reload schema';
commit;
