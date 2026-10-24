-- Activación MANUAL sin cobro, solo para Quijas SAC en Quijas-SCC.
-- Ejecutar dentro de BEGIN/COMMIT; para ensayo usar ROLLBACK.
-- Conserva el rol del owner y restaura su autorización comercial al terminar.
do $prueba_cosecha$
declare v_tenant uuid; v_actor uuid; v_sujeto uuid; v_plan uuid;
  v_existia boolean; v_activa boolean; v_sub_anterior text:=current_setting('request.jwt.claim.sub',true);
  v_operacion uuid:=gen_random_uuid(); v_hasta timestamptz:=clock_timestamp()+interval '30 days';
  v_recibo jsonb; v_modulos text[];
begin
  if current_user<>'postgres' or current_setting('gesgrow.prueba_confirmation',true)
    is distinct from 'COSECHA_SIN_COBRO:mavecfdsrnyfozzukytl:Quijas SAC' then
    raise exception 'Operación de soporte no habilitada para esta empresa/proyecto'; end if;
  perform pg_advisory_xact_lock(hashtextextended('soporte.prueba.cosecha:Quijas SAC',0));
  select t.id,a.usuario_id,i.sujeto into strict v_tenant,v_actor,v_sujeto
    from public.tenants t join public.identity_altas_empresas a on a.tenant_id=t.id
    join public.identity_identidades i on i.usuario_id=a.usuario_id and i.proveedor='SUPABASE'
    join auth.users au on au.id=i.sujeto and au.email_confirmed_at is not null
    where t.nombre='Quijas SAC' and t.estado='ACTIVA';
  if exists(select 1 from public.platform_suscripciones where tenant_id=v_tenant) then
    raise exception 'La empresa ya tiene una suscripción; no se reemplaza ni renueva automáticamente'; end if;
  select id into strict v_plan from public.platform_planes where codigo='OPERACION_CAMPO' and activo;
  select array_agg(modulo_codigo order by modulo_codigo) into v_modulos from public.platform_plan_modulos where plan_id=v_plan;
  if v_modulos is distinct from array['HARVEST']::text[] then raise exception 'El plan de prueba debe habilitar solamente Cosecha'; end if;
  select activo into v_activa from public.platform_delegaciones_comerciales
    where tenant_id=v_tenant and usuario_id=v_actor and permiso='subscription.manage' for update;
  v_existia:=found;
  insert into public.platform_delegaciones_comerciales(tenant_id,usuario_id,activo)
    values(v_tenant,v_actor,true)
    on conflict(tenant_id,usuario_id,permiso) do update set activo=true;
  perform set_config('request.jwt.claim.sub',v_sujeto::text,true);
  v_recibo:=public.platform_solicitar_cambio(v_operacion,v_tenant,'CREAR_SUSCRIPCION',
    jsonb_build_object('planId',v_plan,'estado','TRIAL','hasta',v_hasta),
    'Prueba de Cosecha sin cobro por 30 días, autorizada explícitamente por el owner y ejecutada mediante soporte MCP Supabase.');
  if v_recibo->>'fase' is distinct from 'APLICADA'
    or not public.platform_modulo_habilitado(v_tenant,'HARVEST') then
    raise exception 'La activación de prueba no fue aplicada correctamente'; end if;
  if exists(select 1 from public.platform_tenant_modulos where tenant_id=v_tenant and habilitado and modulo_codigo<>'HARVEST') then
    raise exception 'Se habilitó un módulo fuera del alcance autorizado'; end if;
  if v_existia then
    update public.platform_delegaciones_comerciales set activo=v_activa
      where tenant_id=v_tenant and usuario_id=v_actor and permiso='subscription.manage';
  else
    delete from public.platform_delegaciones_comerciales
      where tenant_id=v_tenant and usuario_id=v_actor and permiso='subscription.manage';
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(v_sub_anterior,''),true);
  perform set_config('gesgrow.prueba_resultado',
    jsonb_build_object('empresa','Quijas SAC','tenantId',v_tenant,'operacionId',v_operacion,
      'estado','TRIAL','hasta',v_hasta,'modulo','HARVEST','cobro',false)::text,true);
end $prueba_cosecha$;

