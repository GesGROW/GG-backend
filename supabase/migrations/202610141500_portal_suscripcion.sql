begin;
do $portal_f76$
begin
  if to_regprocedure('public.portal_f76_version()') is not null then return; end if;
  if to_regprocedure('public.portal_f75_version()') is null then raise exception 'Aplique F7.5 antes de F7.6'; end if;

-- Lectura administrativa sin delegación comercial. Las tablas y sus políticas
-- F6.4 no se abren: sólo se expone el snapshot del Tenant autorizado.
create function public.platform_portal_obtener_suscripcion(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_estado jsonb; v_efectivos jsonb; v_plan uuid;
begin
  perform public.iam_resolver_tenant_context(p_tenant_id);
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  perform pg_advisory_xact_lock(hashtextextended('platform.comercial:'||p_tenant_id::text,0));
  perform public.platform_aplicar_pendientes(p_tenant_id);
  -- El acceso efectivo sigue siendo autoridad de Platform, no del Plan/UI.
  select coalesce(jsonb_agg(m.codigo order by m.codigo),'[]'::jsonb) into v_efectivos
    from public.platform_modulos m where public.platform_modulo_habilitado(p_tenant_id,m.codigo);
  v_estado:=public.platform_estado_comercial(p_tenant_id);
  v_plan:=(v_estado->'suscripcion'->>'plan_id')::uuid;
  return jsonb_build_object('tenantId',p_tenant_id,'actualizadoEn',clock_timestamp(),
    'versionBase',coalesce(v_estado->'suscripcion'->>'version_comercial','0'),
    'puedeAdministrar',public.platform_puede_administrar(p_tenant_id),'estado',v_estado,
    'planActual',(select to_jsonb(p) from public.platform_planes p where p.id=v_plan),
    'modulosPlan',coalesce((select jsonb_agg(pm.modulo_codigo order by pm.modulo_codigo)
      from public.platform_plan_modulos pm where pm.plan_id=v_plan),'[]'::jsonb),
    'modulosEfectivos',v_efectivos,
    'modulos',coalesce((select jsonb_agg(to_jsonb(m) order by m.codigo) from public.platform_modulos m),'[]'::jsonb),
    'planes',coalesce((select jsonb_agg(to_jsonb(p) order by p.nombre) from public.platform_planes p),'[]'::jsonb),
    'historial',coalesce((select jsonb_agg(to_jsonb(e) order by e.fecha_hora desc,e.id)
      from public.platform_eventos_comerciales e where e.tenant_id=p_tenant_id),'[]'::jsonb),
    'programados',coalesce((select jsonb_agg(to_jsonb(o) order by o.effective_at,o.creada_en,o.id)
      from public.platform_operaciones_comerciales o where o.tenant_id=p_tenant_id and not exists(
        select 1 from public.platform_eventos_comerciales e where e.operacion_id=o.id and e.fase in ('APLICADA','RECHAZADA'))),'[]'::jsonb));
end $$;

-- Versionado de intención del Portal; las reglas/recibos/optimistic locking de
-- ejecución programada siguen perteneciendo íntegramente a F6.4.
create function public.platform_portal_solicitar_cambio(p_operacion_id uuid,p_tenant_id uuid,p_tipo text,
  p_parametros jsonb,p_motivo text,p_version_base bigint,p_effective_at timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid; o public.platform_operaciones_comerciales%rowtype; v_version bigint;
begin
  perform public.iam_resolver_tenant_context(p_tenant_id);
  v_actor:=public.platform_exigir_administracion(p_tenant_id);
  if p_operacion_id is null or p_version_base is null or p_version_base<0 then raise exception 'Operación y versión comercial requeridas'; end if;
  if p_tipo is null or p_tipo not in ('CAMBIAR_PLAN','RENOVAR_SUSCRIPCION','SUSPENDER_SUSCRIPCION',
    'REACTIVAR_SUSCRIPCION','CANCELAR_SUSCRIPCION','HABILITAR_MODULO','DESHABILITAR_MODULO') then
    raise exception 'Operación comercial del Portal desconocida'; end if;
  -- Mismo orden de locks que F6.4: operación antes de Tenant. No introducir
  -- un lock comercial anterior al de operación al escribir.
  perform pg_advisory_xact_lock(hashtextextended('platform.operacion:'||p_operacion_id::text,0));
  select * into o from public.platform_operaciones_comerciales where id=p_operacion_id;
  if found then
    if o.tenant_id<>p_tenant_id or o.actor_usuario_id<>v_actor then
      raise exception using errcode='42501',message='Operación de otro Tenant o actor'; end if;
    if o.version_base<>p_version_base then raise exception 'ID idempotente reutilizado con otra versión'; end if;
    -- F6.4 contrasta también todos los parámetros, motivo y effective_at. El
    -- recibo precede al contraste contra versión actual para permitir reintento.
    return public.platform_solicitar_cambio(p_operacion_id,p_tenant_id,p_tipo,p_parametros,p_motivo,p_effective_at);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.comercial:'||p_tenant_id::text,0));
  perform public.platform_aplicar_pendientes(p_tenant_id);
  select version_comercial into v_version from public.platform_suscripciones where tenant_id=p_tenant_id for update;
  if not found then raise exception 'Suscripción inexistente'; end if;
  if v_version<>p_version_base then
    raise exception using errcode='40001',message='Conflicto de versión comercial. Actualice la suscripción antes de preparar otro cambio.'; end if;
  return public.platform_solicitar_cambio(p_operacion_id,p_tenant_id,p_tipo,p_parametros,p_motivo,p_effective_at);
end $$;
create function public.portal_f76_version() returns integer language sql immutable as $$ select 1; $$;
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('platform_portal_obtener_suscripcion','platform_portal_solicitar_cambio','portal_f76_version') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname<>'portal_f76_version' then execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
end $portal_f76$;
notify pgrst,'reload schema';
commit;
