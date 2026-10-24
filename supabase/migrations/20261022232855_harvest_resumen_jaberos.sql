begin;

do $preflight$ begin
  if to_regprocedure('public.harvest_proyectar_resumen(uuid,text)') is null then
    raise exception 'Aplique las proyecciones de producción antes de ampliar el resumen de jaberos';
  end if;
end $preflight$;

-- Count distinct carriers associated with admitted production, like the other
-- Home metrics. A carrier with several sessions/reads is counted only once.
-- Left joins preserve every production fact and every existing total.
create or replace function public.harvest_proyectar_resumen(p_campania uuid,p_zona text)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
  select jsonb_build_object('ok',true,'campania',(select jsonb_build_object('id',id,'nombre',nombre,'fecha_inicio',fecha_inicio)
      from public.campanias where id=p_campania),
    'zona_horaria',p_zona,'resumen',jsonb_build_object(
      'total_jabas',count(*),'total_cosechadores',count(distinct p.trabajador_id),
      'total_jaberos',count(distinct j.trabajador_id),
      'total_lotes',count(distinct p.lote_id),'total_sesiones',count(distinct p.sesion_id),
      'dias_con_produccion',count(distinct (p.fecha_hora at time zone p_zona)::date),
      'ultima_lectura',max(p.fecha_hora)))
  from public.harvest_produccion_reportable p
  left join public.sesiones_lectura s on s.id=p.sesion_id
  left join public.trabajador_campania_rol j on j.id=s.jabero_rol_id and j.tenant_id=s.tenant_id
    and j.campania_id=p.campania_id and j.rol='JABERO'
  where p.campania_id=p_campania;
$$;

-- Internal projection: callers still pass through the existing authorized RPCs.
revoke all on function public.harvest_proyectar_resumen(uuid,text) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on function public.harvest_proyectar_resumen(uuid,text) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
