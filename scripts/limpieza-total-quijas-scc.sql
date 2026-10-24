-- Mantenimiento único autorizado: Quijas-SCC / mavecfdsrnyfozzukytl.
-- NO es una migración de instalación y NO debe añadirse al flujo de despliegue.
-- Ejecutar dentro de BEGIN/COMMIT con:
-- SET LOCAL gesgrow.reset_confirmation = 'LIMPIAR:mavecfdsrnyfozzukytl';
-- Para ensayo, usar ROLLBACK. No usa CASCADE ni desactiva claves foráneas.
set local lock_timeout = '8s';
set local statement_timeout = '120s';

do $limpieza$
declare
  v_tablas text[]:=array[
    'asignaciones_ticket',
    'campaign_lote_parcelas',
    'campanias',
    'cultivos',
    'farm_fundos',
    'farm_parcelas',
    'farm_sectores',
    'harvest_asignaciones_lote',
    'harvest_cultivo_lote_variedades',
    'harvest_cultivo_lotes',
    'harvest_cultivo_operaciones',
    'harvest_cultivo_solicitudes',
    'harvest_cultivo_supervisores',
    'harvest_cultivos',
    'harvest_cutovers',
    'harvest_generaciones',
    'harvest_lotes_tickets',
    'harvest_registros_cosecha',
    'harvest_tickets',
    'identity_altas_empresas',
    'identity_identidades',
    'identity_invitaciones',
    'identity_membresia_roles',
    'identity_membresias',
    'identity_rol_permisos',
    'identity_roles',
    'identity_usuarios',
    'integraciones_api',
    'lecturas_jaba',
    'lote_variedades',
    'lotes',
    'operaciones_pda_campania',
    'operaciones_pda_procesadas',
    'platform_cutovers_administrativos',
    'platform_delegaciones_comerciales',
    'platform_eventos_comerciales',
    'platform_operaciones_comerciales',
    'platform_suscripciones',
    'platform_tenant_modulos',
    'sesiones_lectura',
    'tenants',
    'trabajador_campania_rol',
    'trabajadores',
    'usuarios_app',
    'variedades'
  ];
  v_conservar text[]:=array['identity_permisos','platform_modulos','platform_planes','platform_plan_modulos'];
  v_auth text[]:=array['users','identities','sessions','refresh_tokens','mfa_amr_claims',
    'mfa_factors','mfa_challenges','mfa_recovery_code_sets','mfa_recovery_codes',
    'one_time_tokens','oauth_authorizations','oauth_consents','oauth_client_states',
    'flow_state','saml_relay_states','scim_users','webauthn_challenges','webauthn_credentials'];
  v_lista text; v_tabla text; v_reg record; v_snapshot jsonb; v_actual jsonb;
  v_catalogos jsonb:='{}'::jsonb; v_triggers jsonb; v_triggers_despues jsonb;
  v_truncado jsonb; v_cantidad bigint; v_filas bigint:=0; v_cuentas bigint;
begin
  if current_setting('gesgrow.reset_confirmation',true) is distinct from 'LIMPIAR:mavecfdsrnyfozzukytl' then
    raise exception 'Limpieza no habilitada: requiere confirmación explícita del proyecto Quijas-SCC'; end if;
  if current_user<>'postgres' then raise exception 'Mantenimiento exclusivo del propietario postgres'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gesgrow.reset:mavecfdsrnyfozzukytl',0));
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relname=any(v_tablas||v_conservar))
    or exists(select 1 from unnest(v_tablas||v_conservar) t where to_regclass(format('public.%I',t)) is null) then
    raise exception 'El esquema public cambió: revisar el manifiesto antes de borrar'; end if;
  if exists(select 1 from unnest(v_auth) t where to_regclass(format('auth.%I',t)) is null) then
    raise exception 'El esquema Auth cambió: revisar el manifiesto antes de borrar'; end if;
  -- Auth primero: impedir altas/renovaciones mientras se vacía la aplicación.
  lock table auth.users,auth.sessions,auth.refresh_tokens in access exclusive mode;
  select string_agg(format('public.%I',t),', ' order by t) into v_lista from unnest(v_tablas) t;
  execute 'lock table '||v_lista||' in access exclusive mode';
  foreach v_tabla in array v_conservar loop
    execute format('lock table public.%I in share mode',v_tabla);
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',v_tabla) into v_snapshot;
    v_catalogos:=v_catalogos||jsonb_build_object(v_tabla,v_snapshot);
  end loop;
  if exists(select 1 from storage.objects) or exists(select 1 from storage.buckets)
    or exists(select 1 from storage.s3_multipart_uploads) then
    raise exception 'Storage contiene datos: limpiar los archivos mediante su API antes del reinicio'; end if;
  -- Nunca ampliar automáticamente el borrado a otra tabla/esquema.
  if exists(select 1 from pg_constraint f join pg_class c on c.oid=f.confrelid
    join pg_namespace n on n.oid=c.relnamespace where f.contype='f' and n.nspname='public'
      and c.relname=any(v_tablas) and not f.conrelid=any(
        select to_regclass(format('public.%I',t))::oid from unnest(v_tablas) t)) then
    raise exception 'Hay referencias externas al manifiesto. No se permite borrado en cascada'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('oid',t.oid,'tabla',c.relname,'nombre',t.tgname,'estado',t.tgenabled)
    order by t.oid),'[]'::jsonb) into v_triggers from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relnamespace='public'::regnamespace and not t.tgisinternal;
  select coalesce(jsonb_agg(jsonb_build_object('tabla',c.relname,'nombre',t.tgname,'estado',t.tgenabled)
    order by t.oid),'[]'::jsonb) into v_truncado from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relnamespace='public'::regnamespace and c.relname=any(v_tablas)
      and not t.tgisinternal and (t.tgtype::integer & 32)=32;
  foreach v_tabla in array v_tablas loop
    execute format('select count(*) from public.%I',v_tabla) into v_cantidad;
    v_filas:=v_filas+v_cantidad;
  end loop;
  select count(*) into v_cuentas from auth.users;
  -- Suspender solo los triggers BEFORE/AFTER TRUNCATE; los de escritura y las FK siguen habilitados.
  for v_reg in select * from jsonb_to_recordset(v_truncado) as x(tabla text,nombre text,estado text) loop
    execute format('alter table public.%I disable trigger %I',v_reg.tabla,v_reg.nombre);
  end loop;
  execute 'truncate table '||v_lista||' restart identity restrict';
  for v_reg in select * from jsonb_to_recordset(v_truncado) as x(tabla text,nombre text,estado text) loop
    execute format('alter table public.%I %s trigger %I',v_reg.tabla,
      case v_reg.estado when 'D' then 'disable' when 'A' then 'enable always'
        when 'R' then 'enable replica' else 'enable' end,v_reg.nombre);
  end loop;
  -- Revocar renovación/sesiones antes de borrar las cuentas. Los hijos de Auth
  -- se eliminan por las FK ON DELETE CASCADE existentes, sin tocar su esquema.
  delete from auth.refresh_tokens;
  delete from auth.sessions;
  delete from auth.saml_relay_states;
  delete from auth.flow_state;
  delete from auth.oauth_client_states;
  delete from auth.oauth_authorizations;
  delete from auth.scim_users;
  delete from auth.webauthn_challenges;
  delete from auth.users;
  foreach v_tabla in array v_tablas loop
    execute format('select count(*) from public.%I',v_tabla) into v_cantidad;
    if v_cantidad<>0 then raise exception 'Quedaron datos en public.%',v_tabla; end if;
  end loop;
  foreach v_tabla in array v_auth loop
    execute format('select count(*) from auth.%I',v_tabla) into v_cantidad;
    if v_cantidad<>0 then raise exception 'Quedaron datos en auth.%',v_tabla; end if;
  end loop;
  foreach v_tabla in array v_conservar loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t',v_tabla) into v_actual;
    if v_actual is distinct from v_catalogos->v_tabla then raise exception 'Se alteró el catálogo %',v_tabla; end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('oid',t.oid,'tabla',c.relname,'nombre',t.tgname,'estado',t.tgenabled)
    order by t.oid),'[]'::jsonb) into v_triggers_despues from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relnamespace='public'::regnamespace and not t.tgisinternal;
  if v_triggers_despues is distinct from v_triggers then raise exception 'Estado de triggers no restaurado'; end if;
  raise notice 'Limpieza verificada: % tablas, % filas public, % cuentas Auth. Catálogos y triggers intactos.',
    cardinality(v_tablas),v_filas,v_cuentas;
end $limpieza$;

