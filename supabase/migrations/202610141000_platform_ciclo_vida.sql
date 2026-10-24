begin;
do $platform_f64$
begin
  if obj_description(to_regclass('public.platform_eventos_comerciales'),'pg_class') =
    'GesGROW F6.4: ciclo comercial y auditoría v1' then return; end if;
  if to_regclass('public.platform_tenant_modulos') is null then
    raise exception 'Aplique Platform F6.3 antes de F6.4'; end if;

-- Delegación comercial de confianza, separada de los roles administrables por
-- el propio Tenant. company.manage por sí solo nunca concede contratación.
create table public.platform_delegaciones_comerciales (
  tenant_id uuid not null references public.tenants(id),
  usuario_id uuid not null,
  permiso text not null default 'subscription.manage' check(permiso='subscription.manage'),
  activo boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  primary key(tenant_id,usuario_id,permiso),
  foreign key(usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
create trigger a_platform_propietario before insert or update on public.platform_delegaciones_comerciales
  for each row execute function public.platform_heredar_tenant();
alter table public.platform_suscripciones add column version_comercial bigint not null default 0 check(version_comercial>=0);
alter table public.platform_suscripciones add column estado_pre_suspension text check(estado_pre_suspension in ('ACTIVA','TRIAL'));
create table public.platform_operaciones_comerciales (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  actor_usuario_id uuid not null,
  actor jsonb not null check(jsonb_typeof(actor)='object'),
  tipo_evento text not null check(tipo_evento in ('CREAR_SUSCRIPCION','CAMBIAR_PLAN','RENOVAR_SUSCRIPCION',
    'SUSPENDER_SUSCRIPCION','REACTIVAR_SUSCRIPCION','CANCELAR_SUSCRIPCION','HABILITAR_MODULO','DESHABILITAR_MODULO')),
  solicitud jsonb not null check(jsonb_typeof(solicitud)='object'),
  parametros jsonb not null check(jsonb_typeof(parametros)='object'),
  modulos_plan jsonb not null default '[]'::jsonb check(jsonb_typeof(modulos_plan)='array'),
  motivo text not null check(btrim(motivo)<>''),
  creada_en timestamptz not null,
  effective_at timestamptz not null,
  version_base bigint not null check(version_base>=0),
  unique(tenant_id,id),
  foreign key(actor_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
create index platform_operaciones_vencimiento on public.platform_operaciones_comerciales(tenant_id,effective_at,id);
create table public.platform_eventos_comerciales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  operacion_id uuid,
  tipo_evento text not null,
  fase text not null check(fase in ('BASELINE','PROGRAMADA','APLICADA','RECHAZADA')),
  actor_usuario_id uuid,
  actor jsonb not null check(jsonb_typeof(actor)='object'),
  fecha_hora timestamptz not null default clock_timestamp(),
  effective_at timestamptz not null,
  estado_anterior jsonb not null,
  estado_nuevo jsonb not null,
  motivo text not null check(btrim(motivo)<>''),
  contexto jsonb not null default '{}'::jsonb,
  version_comercial bigint,
  unique(operacion_id,fase),
  foreign key(tenant_id,operacion_id) references public.platform_operaciones_comerciales(tenant_id,id),
  foreign key(actor_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id),
  check((fase='BASELINE' and operacion_id is null and tipo_evento='ESTADO_IMPORTADO' and version_comercial=0)
    or (fase<>'BASELINE' and operacion_id is not null and actor_usuario_id is not null)),
  check((fase in ('BASELINE','APLICADA') and version_comercial is not null) or
    (fase in ('PROGRAMADA','RECHAZADA') and version_comercial is null))
);
create unique index platform_historial_version on public.platform_eventos_comerciales(tenant_id,version_comercial)
  where version_comercial is not null;

create function public.platform_estado_comercial(p_tenant_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog,public set timezone='UTC' as $$
  select jsonb_build_object('suscripcion',(select to_jsonb(s) from public.platform_suscripciones s where s.tenant_id=p_tenant_id),
    'modulos',coalesce((select jsonb_agg(to_jsonb(e) order by e.modulo_codigo)
      from public.platform_tenant_modulos e where e.tenant_id=p_tenant_id),'[]'::jsonb));
$$;
-- Punto de partida explícito: se captura lo existente, sin inventar historia
-- anterior ni alterar contrato, fechas o módulos SCC/importados de F6.3.
insert into public.platform_eventos_comerciales(tenant_id,tipo_evento,fase,actor,effective_at,
  estado_anterior,estado_nuevo,motivo,contexto,version_comercial)
select s.tenant_id,'ESTADO_IMPORTADO','BASELINE','{"tipo":"MIGRACION_F6.4"}'::jsonb,clock_timestamp(),
  '{"suscripcion":null,"modulos":[]}'::jsonb,public.platform_estado_comercial(s.tenant_id),
  'Estado comercial preservado desde F6.3','{"historiaAnterior":"No disponible; baseline de migración"}'::jsonb,0
from public.platform_suscripciones s;

create function public.platform_historial_inmutable()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception 'Historial comercial inmutable'; end $$;
create trigger platform_eventos_inmutables before update or delete on public.platform_eventos_comerciales
  for each row execute function public.platform_historial_inmutable();
create trigger platform_operaciones_inmutables before update or delete on public.platform_operaciones_comerciales
  for each row execute function public.platform_historial_inmutable();
create trigger platform_eventos_no_truncate before truncate on public.platform_eventos_comerciales
  for each statement execute function public.platform_historial_inmutable();
create trigger platform_operaciones_no_truncate before truncate on public.platform_operaciones_comerciales
  for each statement execute function public.platform_historial_inmutable();
create trigger platform_suscripciones_no_truncate before truncate on public.platform_suscripciones
  for each statement execute function public.platform_historial_inmutable();
create trigger platform_entitlements_no_truncate before truncate on public.platform_tenant_modulos
  for each statement execute function public.platform_historial_inmutable();
create trigger platform_suscripciones_no_delete before delete on public.platform_suscripciones
  for each row execute function public.platform_historial_inmutable();
create trigger platform_entitlements_no_delete before delete on public.platform_tenant_modulos
  for each row execute function public.platform_historial_inmutable();

-- Una escritura manual tampoco puede sobrescribir silenciosamente el estado:
-- al confirmar la transacción su snapshot debe coincidir con el último hecho.
create function public.platform_exigir_estado_auditado()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_estado jsonb; v_historia jsonb;
begin
  v_estado:=public.platform_estado_comercial(new.tenant_id);
  select estado_nuevo into v_historia from public.platform_eventos_comerciales
    where tenant_id=new.tenant_id and version_comercial is not null order by version_comercial desc limit 1;
  if v_historia is distinct from v_estado then raise exception 'Estado comercial sin evento de auditoría'; end if;
  return null;
end $$;
create constraint trigger platform_suscripcion_auditada after insert or update on public.platform_suscripciones
  deferrable initially deferred for each row execute function public.platform_exigir_estado_auditado();
create constraint trigger platform_entitlement_auditado after insert or update on public.platform_tenant_modulos
  deferrable initially deferred for each row execute function public.platform_exigir_estado_auditado();

create function public.platform_actor_comercial_valido(p_tenant_id uuid,p_usuario_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.platform_delegaciones_comerciales d
    join public.identity_membresias m on m.tenant_id=d.tenant_id and m.usuario_id=d.usuario_id
    join public.identity_usuarios u on u.id=m.usuario_id
    join public.tenants t on t.id=m.tenant_id
    where d.tenant_id=p_tenant_id and d.usuario_id=p_usuario_id and d.activo and m.activo and u.activo and t.estado='ACTIVA'
      and exists(select 1 from public.identity_membresia_roles mr
        join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
        join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id
        where mr.tenant_id=m.tenant_id and mr.membresia_id=m.id and rp.permiso='company.manage'));
$$;
create function public.platform_puede_administrar(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.platform_actor_comercial_valido(p_tenant_id,public.iam_usuario_actual());
$$;
create function public.platform_exigir_administracion(p_tenant_id uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.iam_exigir_permiso(p_tenant_id,'company.manage');
begin
  if not public.platform_actor_comercial_valido(p_tenant_id,v_actor) then
    raise exception using errcode='42501',message='Permiso comercial subscription.manage requerido'; end if;
  return v_actor;
end $$;

-- Canonicalización independiente del estado, necesaria para devolver el mismo
-- recibo en reintentos aunque la suscripción/Plan haya cambiado posteriormente.
create function public.platform_normalizar_cambio(p_tipo text,p_parametros jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public set timezone='UTC' as $$
declare v_claves text[]; v_json jsonb; v_hasta timestamptz;
begin
  if p_parametros is null or jsonb_typeof(p_parametros)<>'object' then raise exception 'Parámetros comerciales inválidos'; end if;
  v_claves:=case p_tipo
    when 'CREAR_SUSCRIPCION' then array['planId','estado','hasta']
    when 'CAMBIAR_PLAN' then array['planId']
    when 'RENOVAR_SUSCRIPCION' then array['hasta']
    when 'HABILITAR_MODULO' then array['modulo','origen','hasta']
    when 'DESHABILITAR_MODULO' then array['modulo']
    when 'SUSPENDER_SUSCRIPCION' then array[]::text[]
    when 'REACTIVAR_SUSCRIPCION' then array[]::text[]
    when 'CANCELAR_SUSCRIPCION' then array[]::text[]
  end;
  if v_claves is null or exists(select 1 from jsonb_object_keys(p_parametros) k where not k=any(v_claves)) then
    raise exception 'Evento o parámetros comerciales desconocidos'; end if;
  v_json:='{}'::jsonb;
  if 'planId'=any(v_claves) then
    if p_parametros->>'planId' is null then raise exception 'Plan requerido'; end if;
    v_json:=v_json||jsonb_build_object('planId',(p_parametros->>'planId')::uuid);
  end if;
  if 'estado'=any(v_claves) then v_json:=v_json||jsonb_build_object('estado',coalesce(p_parametros->>'estado','ACTIVA')); end if;
  if 'hasta'=any(v_claves) then
    v_hasta:=(p_parametros->>'hasta')::timestamptz;
    v_json:=v_json||jsonb_build_object('hasta',v_hasta);
  end if;
  if 'modulo'=any(v_claves) then
    if p_parametros->>'modulo' is null then raise exception 'Módulo requerido'; end if;
    v_json:=v_json||jsonb_build_object('modulo',p_parametros->>'modulo');
  end if;
  if 'origen'=any(v_claves) then v_json:=v_json||jsonb_build_object('origen',coalesce(p_parametros->>'origen','ADD_ON')); end if;
  return v_json;
end $$;

create function public.platform_validar_transicion(p_tenant_id uuid,p_tipo text,p_parametros jsonb,p_instante timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.platform_suscripciones%rowtype; v_hasta timestamptz:=(p_parametros->>'hasta')::timestamptz;
begin
  select * into s from public.platform_suscripciones where tenant_id=p_tenant_id;
  if p_tipo='CREAR_SUSCRIPCION' then
    if s.id is not null then raise exception 'La empresa ya tiene una suscripción'; end if;
    if p_parametros->>'estado' not in ('TRIAL','ACTIVA') then raise exception 'Estado inicial inválido'; end if;
    if (p_parametros->>'estado'='TRIAL' and v_hasta is null) or (v_hasta is not null and v_hasta<=p_instante) then
      raise exception 'Vigencia inicial inválida'; end if;
  else
    if s.id is null then raise exception 'Suscripción inexistente'; end if;
    if s.estado='CANCELADA' then raise exception 'La suscripción cancelada es terminal'; end if;
  end if;
  if p_tipo in ('CREAR_SUSCRIPCION','CAMBIAR_PLAN') and not exists(
    select 1 from public.platform_planes where id=(p_parametros->>'planId')::uuid and activo) then
    raise exception 'Plan no disponible'; end if;
  if p_tipo='RENOVAR_SUSCRIPCION' then
    if v_hasta is null or v_hasta<=p_instante or (s.hasta is not null and v_hasta<=s.hasta) then
      raise exception 'La renovación debe extender la vigencia'; end if;
    if s.hasta is null then raise exception 'La suscripción no tiene vencimiento que renovar'; end if;
  elsif p_tipo='SUSPENDER_SUSCRIPCION' then
    if s.estado not in ('ACTIVA','TRIAL') then raise exception 'Sólo una suscripción activa o trial se puede suspender'; end if;
  elsif p_tipo='REACTIVAR_SUSCRIPCION' then
    if s.estado<>'SUSPENDIDA' then raise exception 'Sólo una suscripción suspendida se puede reactivar'; end if;
    if s.desde>p_instante or (s.hasta is not null and s.hasta<=p_instante) then raise exception 'Debe renovar antes de reactivar'; end if;
  elsif p_tipo='HABILITAR_MODULO' then
    if p_parametros->>'origen' not in ('ADD_ON','EXCEPCION') or (v_hasta is not null and v_hasta<=p_instante) then
      raise exception 'Entitlement comercial inválido'; end if;
  elsif p_tipo='DESHABILITAR_MODULO' then
    if not exists(select 1 from public.platform_tenant_modulos where tenant_id=p_tenant_id and modulo_codigo=p_parametros->>'modulo') then
      raise exception 'Entitlement inexistente'; end if;
  end if;
  if p_tipo in ('HABILITAR_MODULO','DESHABILITAR_MODULO') and not exists(
    select 1 from public.platform_modulos where codigo=p_parametros->>'modulo' and disponible) then
    raise exception 'Módulo no disponible'; end if;
end $$;

create function public.platform_aplicar_operacion(p_operacion_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.platform_operaciones_comerciales%rowtype; s public.platform_suscripciones%rowtype;
  v_anterior jsonb; v_nuevo jsonb; v_version bigint; v_error text; v_hasta timestamptz;
begin
  select * into strict o from public.platform_operaciones_comerciales where id=p_operacion_id;
  if o.effective_at>clock_timestamp() then raise exception 'El cambio programado todavía no es efectivo'; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.comercial:'||o.tenant_id::text,0));
  if exists(select 1 from public.platform_eventos_comerciales where operacion_id=o.id and fase in ('APLICADA','RECHAZADA')) then return; end if;
  v_anterior:=public.platform_estado_comercial(o.tenant_id);
  begin
    select * into s from public.platform_suscripciones where tenant_id=o.tenant_id for update;
    v_version:=coalesce(s.version_comercial,0);
    if v_version<>o.version_base then raise exception 'Conflicto de versión: el estado cambió desde la programación'; end if;
    if not public.platform_actor_comercial_valido(o.tenant_id,o.actor_usuario_id) then
      raise exception using errcode='42501',message='Autorización comercial revocada'; end if;
    perform public.platform_validar_transicion(o.tenant_id,o.tipo_evento,o.parametros,o.effective_at);
    v_hasta:=(o.parametros->>'hasta')::timestamptz;
    case o.tipo_evento
      when 'CREAR_SUSCRIPCION' then
        insert into public.platform_suscripciones(tenant_id,plan_id,estado,desde,hasta)
          values(o.tenant_id,(o.parametros->>'planId')::uuid,o.parametros->>'estado',o.effective_at,v_hasta) returning * into s;
      when 'CAMBIAR_PLAN' then
        update public.platform_suscripciones set plan_id=(o.parametros->>'planId')::uuid where tenant_id=o.tenant_id;
        update public.platform_tenant_modulos set habilitado=false where tenant_id=o.tenant_id and origen='PLAN'
          and not (o.modulos_plan ? modulo_codigo);
      when 'RENOVAR_SUSCRIPCION' then
        update public.platform_suscripciones set hasta=v_hasta,
          desde=case when s.estado='VENCIDA' or s.hasta<=o.effective_at then o.effective_at else s.desde end,
          estado_pre_suspension=case when s.estado='SUSPENDIDA' then 'ACTIVA' else null end,
          estado=case when s.estado='SUSPENDIDA' then 'SUSPENDIDA' else 'ACTIVA' end where tenant_id=o.tenant_id;
      when 'SUSPENDER_SUSCRIPCION' then
        update public.platform_suscripciones set estado='SUSPENDIDA',estado_pre_suspension=s.estado where tenant_id=o.tenant_id;
      when 'REACTIVAR_SUSCRIPCION' then
        update public.platform_suscripciones set estado=coalesce(s.estado_pre_suspension,'ACTIVA'),estado_pre_suspension=null where tenant_id=o.tenant_id;
      when 'CANCELAR_SUSCRIPCION' then
        update public.platform_suscripciones set estado='CANCELADA',estado_pre_suspension=null where tenant_id=o.tenant_id;
      when 'HABILITAR_MODULO' then
        insert into public.platform_tenant_modulos(tenant_id,suscripcion_id,modulo_codigo,habilitado,origen,desde,hasta)
          values(o.tenant_id,s.id,o.parametros->>'modulo',true,o.parametros->>'origen',o.effective_at,v_hasta)
          on conflict(tenant_id,modulo_codigo) do update set habilitado=true,origen=excluded.origen,desde=excluded.desde,hasta=excluded.hasta;
      when 'DESHABILITAR_MODULO' then
        update public.platform_tenant_modulos set habilitado=false,origen='EXCEPCION'
          where tenant_id=o.tenant_id and modulo_codigo=o.parametros->>'modulo';
    end case;
    if o.tipo_evento in ('CREAR_SUSCRIPCION','CAMBIAR_PLAN') then
      insert into public.platform_tenant_modulos(tenant_id,suscripcion_id,modulo_codigo,habilitado,origen,desde)
        select o.tenant_id,s.id,m,true,'PLAN',o.effective_at from jsonb_array_elements_text(o.modulos_plan) m
        on conflict(tenant_id,modulo_codigo) do update set habilitado=true,desde=excluded.desde,hasta=null
          where platform_tenant_modulos.origen='PLAN';
    end if;
    update public.platform_suscripciones set version_comercial=v_version+1 where tenant_id=o.tenant_id;
    v_nuevo:=public.platform_estado_comercial(o.tenant_id);
    insert into public.platform_eventos_comerciales(tenant_id,operacion_id,tipo_evento,fase,actor_usuario_id,actor,
      effective_at,estado_anterior,estado_nuevo,motivo,contexto,version_comercial)
    values(o.tenant_id,o.id,o.tipo_evento,'APLICADA',o.actor_usuario_id,o.actor,o.effective_at,v_anterior,v_nuevo,o.motivo,
      jsonb_build_object('versionBase',o.version_base,'parametros',o.parametros,
        'ejecutor',case when o.effective_at>o.creada_en then 'SISTEMA' else 'USUARIO' end),v_version+1);
  exception when raise_exception or insufficient_privilege then
    if o.effective_at<=o.creada_en then raise; end if;
    get stacked diagnostics v_error=message_text;
    insert into public.platform_eventos_comerciales(tenant_id,operacion_id,tipo_evento,fase,actor_usuario_id,actor,
      effective_at,estado_anterior,estado_nuevo,motivo,contexto)
    values(o.tenant_id,o.id,o.tipo_evento,'RECHAZADA',o.actor_usuario_id,o.actor,o.effective_at,v_anterior,v_anterior,o.motivo,
      jsonb_build_object('rechazo',v_error,'ejecutor','SISTEMA','parametros',o.parametros,'versionBase',o.version_base));
  end;
end $$;
create function public.platform_aplicar_pendientes(p_tenant_id uuid)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_operacion record; v_total integer:=0;
begin
  if not exists(select 1 from public.platform_operaciones_comerciales o where o.tenant_id=p_tenant_id
    and o.effective_at<=clock_timestamp() and not exists(select 1 from public.platform_eventos_comerciales e
      where e.operacion_id=o.id and e.fase in ('APLICADA','RECHAZADA'))) then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.comercial:'||p_tenant_id::text,0));
  for v_operacion in select o.id from public.platform_operaciones_comerciales o where o.tenant_id=p_tenant_id
    and o.effective_at<=clock_timestamp() and not exists(select 1 from public.platform_eventos_comerciales e
      where e.operacion_id=o.id and e.fase in ('APLICADA','RECHAZADA')) order by o.effective_at,o.creada_en,o.id loop
    perform public.platform_aplicar_operacion(v_operacion.id); v_total:=v_total+1;
  end loop;
  return v_total;
end $$;
create function public.platform_recibo_comercial(p_operacion_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public set timezone='UTC' as $$
  select jsonb_build_object('operacionId',e.operacion_id,'tenantId',e.tenant_id,'tipoEvento',e.tipo_evento,
    'fase',e.fase,'effectiveAt',e.effective_at,'fechaHora',e.fecha_hora,'estado',e.estado_nuevo)
  from public.platform_eventos_comerciales e where e.operacion_id=p_operacion_id
    order by case when e.fase='PROGRAMADA' then 0 else 1 end,e.fecha_hora,e.id limit 1;
$$;
create function public.platform_solicitar_cambio(p_operacion_id uuid,p_tenant_id uuid,p_tipo text,
  p_parametros jsonb,p_motivo text,p_effective_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set timezone='UTC' as $$
declare v_actor uuid:=public.platform_exigir_administracion(p_tenant_id); v_parametros jsonb;
  v_solicitud jsonb; v_ahora timestamptz; v_effective timestamptz; v_estado jsonb; v_modulos jsonb:='[]'::jsonb;
  o public.platform_operaciones_comerciales%rowtype; v_actor_json jsonb;
begin
  if p_operacion_id is null or p_tenant_id is null or nullif(btrim(p_motivo),'') is null then
    raise exception 'ID de operación, Tenant y motivo requeridos'; end if;
  v_parametros:=public.platform_normalizar_cambio(p_tipo,p_parametros);
  v_solicitud:=jsonb_build_object('tipo',p_tipo,'parametros',v_parametros,'motivo',btrim(p_motivo),'effectiveAt',p_effective_at);
  perform pg_advisory_xact_lock(hashtextextended('platform.operacion:'||p_operacion_id::text,0));
  select * into o from public.platform_operaciones_comerciales where id=p_operacion_id;
  if found then
    if o.tenant_id<>p_tenant_id or o.actor_usuario_id<>v_actor or o.solicitud<>v_solicitud then
      raise exception 'ID de operación comercial reutilizado con otro actor, Tenant o intención'; end if;
    return public.platform_recibo_comercial(o.id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform.comercial:'||p_tenant_id::text,0));
  perform public.platform_aplicar_pendientes(p_tenant_id);
  v_ahora:=clock_timestamp(); v_effective:=coalesce(p_effective_at,v_ahora);
  if v_effective<v_ahora then raise exception 'effective_at no puede estar en el pasado; omítalo para cambio inmediato'; end if;
  perform public.platform_validar_transicion(p_tenant_id,p_tipo,v_parametros,v_effective);
  v_estado:=public.platform_estado_comercial(p_tenant_id);
  if p_tipo in ('CREAR_SUSCRIPCION','CAMBIAR_PLAN') then
    select coalesce(jsonb_agg(pm.modulo_codigo order by pm.modulo_codigo),'[]'::jsonb) into v_modulos
      from public.platform_plan_modulos pm join public.platform_modulos m on m.codigo=pm.modulo_codigo and m.disponible
      where pm.plan_id=(v_parametros->>'planId')::uuid;
  end if;
  v_actor_json:=jsonb_build_object('tipo','USUARIO','usuarioId',v_actor,'sujeto',auth.uid());
  insert into public.platform_operaciones_comerciales(id,tenant_id,actor_usuario_id,actor,tipo_evento,solicitud,
    parametros,modulos_plan,motivo,creada_en,effective_at,version_base)
  values(p_operacion_id,p_tenant_id,v_actor,v_actor_json,p_tipo,v_solicitud,v_parametros,v_modulos,btrim(p_motivo),v_ahora,
    v_effective,coalesce((v_estado->'suscripcion'->>'version_comercial')::bigint,0));
  if v_effective>v_ahora then
    insert into public.platform_eventos_comerciales(tenant_id,operacion_id,tipo_evento,fase,actor_usuario_id,actor,
      effective_at,estado_anterior,estado_nuevo,motivo,contexto)
    values(p_tenant_id,p_operacion_id,p_tipo,'PROGRAMADA',v_actor,v_actor_json,v_effective,v_estado,v_estado,btrim(p_motivo),
      jsonb_build_object('parametros',v_parametros,'modulosPlan',v_modulos,'versionBase',
        coalesce((v_estado->'suscripcion'->>'version_comercial')::bigint,0)));
  else perform public.platform_aplicar_operacion(p_operacion_id); end if;
  return public.platform_recibo_comercial(p_operacion_id);
end $$;

-- Mismo contrato F6.3, ahora materializa cambios vencidos antes de resolver.
-- Aplicar un cambio programado no requiere permiso comercial del lector: la
-- intención persistida y su actor se revalidan en Platform, nunca en la UI.
create or replace function public.platform_modulo_habilitado(p_tenant_id uuid,p_modulo text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_ahora timestamptz;
begin
  perform public.platform_aplicar_pendientes(p_tenant_id); v_ahora:=clock_timestamp();
  return exists(select 1 from public.platform_tenant_modulos e
    join public.platform_suscripciones s on s.tenant_id=e.tenant_id and s.id=e.suscripcion_id
    join public.platform_modulos m on m.codigo=e.modulo_codigo join public.tenants t on t.id=e.tenant_id
    where e.tenant_id=p_tenant_id and e.modulo_codigo=p_modulo and e.habilitado and m.disponible and t.estado='ACTIVA'
      and s.estado in ('TRIAL','ACTIVA') and s.desde<=v_ahora and (s.hasta is null or v_ahora<s.hasta)
      and e.desde<=v_ahora and (e.hasta is null or v_ahora<e.hasta));
end $$;
alter function public.platform_puede_usar_modulo(uuid,text) volatile;
alter function public.platform_exigir_modulo(uuid,text) volatile;
alter function public.platform_exigir_catalogo_campanias(uuid) volatile;
create function public.platform_obtener_comercial(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.platform_exigir_administracion(p_tenant_id);
  perform public.platform_aplicar_pendientes(p_tenant_id);
  return jsonb_build_object('estado',public.platform_estado_comercial(p_tenant_id),
    'historial',coalesce((select jsonb_agg(to_jsonb(e) order by e.fecha_hora,e.id)
      from public.platform_eventos_comerciales e where e.tenant_id=p_tenant_id),'[]'::jsonb),
    'programados',coalesce((select jsonb_agg(to_jsonb(o) order by o.effective_at,o.id) from public.platform_operaciones_comerciales o
      where o.tenant_id=p_tenant_id and not exists(select 1 from public.platform_eventos_comerciales e
        where e.operacion_id=o.id and e.fase in ('APLICADA','RECHAZADA'))),'[]'::jsonb),
    'planes',coalesce((select jsonb_agg(to_jsonb(p) order by p.nombre) from public.platform_planes p),'[]'::jsonb));
end $$;
create function public.platform_procesar_programados()
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record; v_total integer:=0;
begin
  for r in select distinct o.tenant_id from public.platform_operaciones_comerciales o where o.effective_at<=clock_timestamp()
    and not exists(select 1 from public.platform_eventos_comerciales e where e.operacion_id=o.id and e.fase in ('APLICADA','RECHAZADA')) loop
    v_total:=v_total+public.platform_aplicar_pendientes(r.tenant_id);
  end loop;
  return v_total;
end $$;

do $$ declare tabla text; begin
  foreach tabla in array array['platform_delegaciones_comerciales','platform_operaciones_comerciales','platform_eventos_comerciales'] loop
    execute format('alter table public.%I enable row level security',tabla);
    execute format('revoke all on public.%I from public,anon,authenticated',tabla);
    execute format('grant select on public.%I to authenticated',tabla);
  end loop;
end $$;
create policy platform_delegacion_lectura on public.platform_delegaciones_comerciales for select to authenticated
  using(usuario_id=public.iam_usuario_actual() and public.iam_es_miembro(tenant_id));
create policy platform_operacion_lectura on public.platform_operaciones_comerciales for select to authenticated
  using(public.platform_puede_administrar(tenant_id));
create policy platform_evento_lectura on public.platform_eventos_comerciales for select to authenticated
  using(public.platform_puede_administrar(tenant_id));
do $$ declare firma text; begin
  for firma in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('platform_estado_comercial','platform_historial_inmutable',
      'platform_exigir_estado_auditado','platform_actor_comercial_valido','platform_puede_administrar',
      'platform_exigir_administracion','platform_normalizar_cambio','platform_validar_transicion',
      'platform_aplicar_operacion','platform_aplicar_pendientes','platform_recibo_comercial','platform_solicitar_cambio',
      'platform_obtener_comercial','platform_procesar_programados') loop
    execute format('revoke all on function %s from public,anon,authenticated',firma);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function %s from service_role',firma);
    end if;
  end loop;
end $$;
grant execute on function public.platform_puede_administrar(uuid),
  public.platform_solicitar_cambio(uuid,uuid,text,jsonb,text,timestamptz),public.platform_obtener_comercial(uuid) to authenticated;
if exists(select 1 from pg_roles where rolname='service_role') then
  -- Supabase puede aplicar privilegios por defecto al crear tablas/funciones.
  revoke all on public.platform_operaciones_comerciales,public.platform_eventos_comerciales,
    public.platform_delegaciones_comerciales from service_role;
  -- Se cierra el acceso F6.3 que permitiría mutaciones sin recibo/auditoría.
  revoke insert,update,delete,truncate on public.platform_suscripciones,public.platform_tenant_modulos from service_role;
  revoke all on function public.platform_crear_suscripcion(uuid,uuid,text,timestamptz,timestamptz) from service_role;
  grant select,insert,update on public.platform_delegaciones_comerciales to service_role;
  grant execute on function public.platform_procesar_programados() to service_role;
end if;
comment on table public.platform_eventos_comerciales is 'GesGROW F6.4: ciclo comercial y auditoría v1';
end $platform_f64$;
notify pgrst,'reload schema';
commit;
