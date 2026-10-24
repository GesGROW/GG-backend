begin;
do $portal_f77$
begin
  if to_regprocedure('public.portal_f77_version()') is not null then return; end if;
  if to_regprocedure('public.portal_f76_version()') is null then raise exception 'Aplique F7.6 antes de F7.7'; end if;

-- Brecha real de paridad: alta/edición/estado de lotes OPERATIVOS. Se conserva
-- identidad de campaña y campo variedad_id legacy, sin borrar asociaciones.
create function public.campaign_admin_guardar_lote(p_tenant_id uuid,p_campania_id uuid,p_id uuid,
  p_codigo text,p_nombre text,p_activo boolean,p_variedad_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_id uuid:=p_id; v_variedad uuid;
begin
  perform public.campaign_admin_exigir_campania(p_tenant_id,p_campania_id);
  if nullif(btrim(p_codigo),'') is null or length(btrim(p_codigo))>30 or length(btrim(p_nombre))>100 or p_activo is null then
    raise exception 'Código de lote (hasta 30), nombre (hasta 100) y estado válidos requeridos'; end if;
  if coalesce(cardinality(p_variedad_ids),0)=0 or array_position(p_variedad_ids,null) is not null then raise exception 'Seleccione variedades'; end if;
  if p_id is null then
    if not exists(select 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id and estado='ACTIVA') then
      raise exception 'La campaña debe estar activa para crear un lote'; end if;
    select v.id into v_variedad from public.variedades v join public.campanias c on c.cultivo_id=v.cultivo_id and c.tenant_id=v.tenant_id
      where c.id=p_campania_id and v.tenant_id=p_tenant_id and v.id=p_variedad_ids[1] and v.activo;
    if v_variedad is null then raise exception 'Variedad de otra empresa/cultivo o inactiva'; end if;
    insert into public.lotes(tenant_id,campania_id,codigo,nombre,activo,variedad_id)
      values(p_tenant_id,p_campania_id,btrim(p_codigo),nullif(btrim(p_nombre),''),p_activo,v_variedad) returning id into v_id;
  else
    update public.lotes set codigo=btrim(p_codigo),nombre=nullif(btrim(p_nombre),''),activo=p_activo
      where id=p_id and campania_id=p_campania_id and tenant_id=p_tenant_id;
    if not found then raise exception using errcode='42501',message='Lote operativo de otra campaña o empresa'; end if;
  end if;
  perform public.campaign_admin_configurar_variedades_lote(p_tenant_id,p_campania_id,v_id,p_variedad_ids);
  return (select x from jsonb_array_elements(public.campaign_admin_lotes(p_tenant_id,p_campania_id)) x where x->>'id'=v_id::text);
end $$;

-- Brecha JABERO: intenciones diarias explícitas, sin CRUD de identidad laboral.
-- El trigger existente asignacion_diaria_jabero conserva el reloj Lima; no se
-- permite enviar fecha ni cambiar trabajador/campaña/rol de un hecho previo.
create function public.workforce_admin_jornada_jabero(p_tenant_id uuid,p_trabajador_id uuid,p_campania_id uuid,p_habilitar boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.portal_exigir_gestion(p_tenant_id,'workforce.manage','WORKFORCE');
  perform 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id for update;
  if not found then raise exception using errcode='42501',message='Campaña de otra empresa'; end if;
  perform public.workforce_admin_exigir_trabajador(p_tenant_id,p_trabajador_id);
  if p_habilitar is null then raise exception 'Intención de jornada requerida'; end if;
  if p_habilitar then
    if not exists(select 1 from public.campanias where id=p_campania_id and estado='ACTIVA')
      or not exists(select 1 from public.trabajadores where id=p_trabajador_id and activo) then raise exception 'Campaña y trabajador deben estar activos'; end if;
    insert into public.trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo)
      values(p_tenant_id,p_trabajador_id,p_campania_id,'JABERO',true)
      on conflict(trabajador_id,campania_id,rol) do update set activo=true;
  else
    update public.trabajador_campania_rol set activo=false where tenant_id=p_tenant_id
      and trabajador_id=p_trabajador_id and campania_id=p_campania_id and rol='JABERO';
    if not found then raise exception 'Participación JABERO inexistente'; end if;
  end if;
  perform public.recalcular_acceso_app_trabajador(p_trabajador_id);
  return public.workforce_admin_participaciones(p_tenant_id,p_trabajador_id);
end $$;

create table public.platform_cutovers_administrativos (
  operacion_id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  campania_id uuid not null unique,
  actor_usuario_id uuid not null,
  activado_en timestamptz not null default clock_timestamp(),
  motivo text not null check(btrim(motivo)<>''),
  reconciliacion jsonb not null check(reconciliacion='{"pendientesRevisados":true,"paridad":"F7.7"}'::jsonb),
  foreign key(tenant_id,campania_id) references public.campanias(tenant_id,id),
  foreign key(actor_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
alter table public.platform_cutovers_administrativos enable row level security;
revoke all on public.platform_cutovers_administrativos from public,anon,authenticated;
create function public.platform_cutover_admin_inmutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$ begin raise exception 'Cutover administrativo inmutable'; end $$;
create trigger cutover_admin_inmutable before update or delete on public.platform_cutovers_administrativos for each row execute function public.platform_cutover_admin_inmutable();
create trigger cutover_admin_no_truncate before truncate on public.platform_cutovers_administrativos for each statement execute function public.platform_cutover_admin_inmutable();
if to_regclass('public.integracion_campania') is not null then
  alter table public.integracion_campania add column escritura_habilitada boolean not null default true;
end if;

create function public.platform_cutover_admin_consultar(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_corte jsonb;
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  if not exists(select 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id) then
    raise exception using errcode='42501',message='Campaña de otra empresa'; end if;
  select to_jsonb(c) into v_corte from public.platform_cutovers_administrativos c where tenant_id=p_tenant_id and campania_id=p_campania_id;
  return jsonb_build_object('campaniaId',p_campania_id,'tenantId',p_tenant_id,'autoridad',case when v_corte is null then 'TRANSICION_SHEETS' else 'PORTAL' end,
    'corte',v_corte,'paridad','F7.7');
end $$;
create function public.platform_cutover_admin_activar(p_tenant_id uuid,p_campania_id uuid,p_operacion_id uuid,p_motivo text,p_pendientes_revisados boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid; v_corte public.platform_cutovers_administrativos%rowtype;
begin
  v_actor:=public.iam_exigir_permiso(p_tenant_id,'company.manage');
  perform public.iam_exigir_permiso(p_tenant_id,'campaign.manage');
  perform public.iam_exigir_permiso(p_tenant_id,'workforce.manage');
  perform public.iam_exigir_permiso(p_tenant_id,'reports.view');
  if p_operacion_id is null or nullif(btrim(p_motivo),'') is null or p_pendientes_revisados is distinct from true then
    raise exception 'ID, motivo y revisión explícita de pendientes Sheets requeridos'; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.admin.operacion:'||p_operacion_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('platform.admin:'||p_tenant_id::text,0));
  -- Igual orden que una escritura Sheets: lock administrativo antes de las
  -- consultas Platform que podrían materializar un cambio comercial vencido.
  perform public.platform_exigir_modulo(p_tenant_id,'CAMPAIGN');
  perform public.platform_exigir_modulo(p_tenant_id,'WORKFORCE');
  perform public.platform_exigir_modulo(p_tenant_id,'HARVEST');
  perform 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id for update;
  if not found then raise exception using errcode='42501',message='Campaña de otra empresa'; end if;
  -- Una identidad técnica registrada nunca se convierte en autoridad Portal.
  if to_regclass('public.integraciones_api') is not null then
    if exists(select 1 from public.integraciones_api where auth_user_id=auth.uid()) then
      raise exception using errcode='42501',message='La integración técnica no puede activar el cutover'; end if;
  end if;
  select * into v_corte from public.platform_cutovers_administrativos where operacion_id=p_operacion_id or campania_id=p_campania_id;
  if found then
    if v_corte.operacion_id<>p_operacion_id or v_corte.tenant_id<>p_tenant_id or v_corte.campania_id<>p_campania_id
      or v_corte.actor_usuario_id<>v_actor or v_corte.motivo<>btrim(p_motivo) then raise exception 'Cutover existente o ID reutilizado con otra intención'; end if;
    return public.platform_cutover_admin_consultar(p_tenant_id,p_campania_id);
  end if;
  insert into public.platform_cutovers_administrativos(operacion_id,tenant_id,campania_id,actor_usuario_id,motivo,reconciliacion)
    values(p_operacion_id,p_tenant_id,p_campania_id,v_actor,btrim(p_motivo),'{"pendientesRevisados":true,"paridad":"F7.7"}');
  if to_regclass('public.integracion_campania') is not null then
    -- Mantener lectura y auditoría. Incluye cuentas acceso_global, sin quitar
    -- acceso de escritura a sus otras campañas todavía no migradas.
    insert into public.integracion_campania(tenant_id,integracion_id,campania_id,activo,escritura_habilitada)
      select p_tenant_id,id,p_campania_id,true,false from public.integraciones_api
      where tenant_id=p_tenant_id and acceso_global
      on conflict(integracion_id,campania_id) do update set escritura_habilitada=false;
    update public.integracion_campania set escritura_habilitada=false where tenant_id=p_tenant_id and campania_id=p_campania_id;
  end if;
  return public.platform_cutover_admin_consultar(p_tenant_id,p_campania_id);
end $$;

-- Se identifica la credencial por auth.uid() persistida, nunca por un header,
-- tenantId, modo de cliente o GUC que pudiera elegir quien llama.
create function public.platform_exigir_escritura_integracion(p_campania uuid default null)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_tenant uuid; v_contexto uuid:=p_campania;
begin
  if to_regclass('public.integraciones_api') is null then return; end if;
  select tenant_id into v_tenant from public.integraciones_api where auth_user_id=auth.uid();
  if v_tenant is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.admin:'||v_tenant::text,0));
  -- Sólo ayuda a enrutar aliases anidados. La credencial y los triggers sobre
  -- OLD/NEW persistidos siguen siendo autoridad ante cualquier contexto falso.
  v_contexto:=coalesce(v_contexto,nullif(current_setting('scc.hoja_campania_id',true),'')::uuid);
  if v_contexto is null then
    if exists(select 1 from public.platform_cutovers_administrativos where tenant_id=v_tenant) then
      raise exception using errcode='42501',message='Sheets sin contexto no puede escribir después de un cutover administrativo'; end if;
  else
    if not exists(select 1 from public.campanias where id=v_contexto and tenant_id=v_tenant) then
      raise exception using errcode='42501',message='Campaña de otra empresa'; end if;
    if exists(select 1 from public.platform_cutovers_administrativos where tenant_id=v_tenant and campania_id=v_contexto) then
      raise exception using errcode='42501',message='Campaña migrada al Portal: escritura Sheets retirada'; end if;
    if to_regclass('public.integracion_campania') is not null then
      if exists(select 1 from public.integracion_campania c join public.integraciones_api i on i.id=c.integracion_id
        where c.campania_id=v_contexto and i.auth_user_id=auth.uid() and not c.escritura_habilitada) then
        raise exception using errcode='42501',message='Escritura de integración deshabilitada'; end if;
    end if;
  end if;
end $$;

-- Todas las entradas legacy de escritura, incluyendo *_hoja y aliases antiguos.
-- Se conserva su cuerpo, firma y ACL. No se cambian consultas ni RPC de campo.
do $$ declare r record; v_def text; v_arg text; begin
  for r in select p.oid,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.proname like 'admin_guardar_%' and l.lanname='plpgsql' loop
    v_arg:=case when 'p_contexto_campania_id'=any(r.proargnames) then 'p_contexto_campania_id'
      when 'p_campania_id'=any(r.proargnames) then 'p_campania_id' else 'null' end;
    v_def:=pg_get_functiondef(r.oid);
    execute regexp_replace(v_def,'\mbegin\M','begin perform public.platform_exigir_escritura_integracion('||v_arg||');','i');
  end loop;
end $$;

-- Defensa sobre filas reales contra aliases, UUID movidos, GUC falsos, cuentas
-- globales y maestros compartidos que afectarían indirectamente otra campaña.
create function public.platform_proteger_maestro_migrado()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_tenant uuid; d jsonb; v_id uuid; v_camp uuid; v_bloqueado boolean;
begin
  if to_regclass('public.integraciones_api') is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select tenant_id into v_tenant from public.integraciones_api where auth_user_id=auth.uid();
  if v_tenant is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.admin:'||v_tenant::text,0));
  for d in select x from jsonb_array_elements(case tg_op when 'INSERT' then jsonb_build_array(to_jsonb(new))
    when 'DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x loop
    if (d->>'tenant_id')::uuid is distinct from v_tenant then raise exception using errcode='42501',message='Maestro de otra empresa'; end if;
    v_id:=(d->>'id')::uuid; v_camp:=(d->>'campania_id')::uuid;
    if tg_table_name='campanias' then v_camp:=v_id; end if;
    if tg_table_name='lote_variedades' then select campania_id into v_camp from public.lotes where id=(d->>'lote_id')::uuid; end if;
    v_bloqueado:=exists(select 1 from public.platform_cutovers_administrativos where tenant_id=v_tenant and campania_id=v_camp);
    if tg_table_name in ('trabajadores','usuarios_app') then
      if tg_table_name='usuarios_app' then v_id:=(d->>'trabajador_id')::uuid; end if;
      v_bloqueado:=v_bloqueado or exists(select 1 from public.trabajador_campania_rol r join public.platform_cutovers_administrativos c
        on c.campania_id=r.campania_id and c.tenant_id=r.tenant_id where r.trabajador_id=v_id and r.tenant_id=v_tenant);
      if to_regclass('public.trabajadores_campania_hoja') is not null then
        v_bloqueado:=v_bloqueado or exists(select 1 from public.trabajadores_campania_hoja r join public.platform_cutovers_administrativos c
          on c.campania_id=r.campania_id and c.tenant_id=r.tenant_id where r.trabajador_id=v_id and r.tenant_id=v_tenant);
      end if;
    elsif tg_table_name='variedades' then
      v_bloqueado:=v_bloqueado or exists(select 1 from public.campanias c join public.platform_cutovers_administrativos a
        on a.campania_id=c.id and a.tenant_id=c.tenant_id where c.tenant_id=v_tenant and c.cultivo_id=(d->>'cultivo_id')::uuid);
    end if;
    if v_bloqueado then raise exception using errcode='42501',message='Maestro de campaña migrada al Portal: escritura Sheets retirada'; end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create function public.platform_no_rehabilitar_integracion_migrada()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.platform_cutovers_administrativos where tenant_id=new.tenant_id and campania_id=new.campania_id) then
    new.escritura_habilitada:=false;
  end if;
  return new;
end $$;
if to_regclass('public.integracion_campania') is not null then
  create trigger z_integracion_solo_lectura before insert or update on public.integracion_campania
    for each row execute function public.platform_no_rehabilitar_integracion_migrada();
end if;
do $$ declare t text; begin
  foreach t in array array['campanias','trabajadores','usuarios_app','variedades','lotes','lote_variedades','trabajador_campania_rol','trabajadores_campania_hoja'] loop
    if to_regclass('public.'||t) is not null then execute format('create trigger z_portal_autoridad before insert or update or delete on public.%I for each row execute function public.platform_proteger_maestro_migrado()',t); end if;
  end loop;
end $$;
create function public.portal_f77_version() returns integer language sql immutable as $$ select 1; $$;
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
    p.proname in ('campaign_admin_guardar_lote','workforce_admin_jornada_jabero','platform_cutover_admin_consultar',
      'platform_cutover_admin_activar','platform_exigir_escritura_integracion','platform_proteger_maestro_migrado','platform_no_rehabilitar_integracion_migrada','platform_cutover_admin_inmutable','portal_f77_version') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname in ('campaign_admin_guardar_lote','workforce_admin_jornada_jabero','platform_cutover_admin_consultar','platform_cutover_admin_activar') then
      execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
if exists(select 1 from pg_roles where rolname='service_role') then revoke all on public.platform_cutovers_administrativos from service_role; end if;
end $portal_f77$;
notify pgrst,'reload schema';
commit;
