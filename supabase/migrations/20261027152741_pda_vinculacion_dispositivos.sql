begin;

-- Los secretos y las funciones privilegiadas no se exponen por la Data API.
create schema pda_privado;
revoke all on schema pda_privado from public, anon, authenticated;
grant usage on schema pda_privado to authenticated;

create table pda_privado.vinculaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  creada_por uuid not null,
  creada_en timestamptz not null default clock_timestamp(),
  vence_en timestamptz not null,
  revocada_en timestamptz,
  foreign key (creada_por, tenant_id) references public.identity_membresias(usuario_id, tenant_id),
  check (vence_en > creada_en)
);
create unique index pda_vinculacion_vigente on pda_privado.vinculaciones(tenant_id)
  where revocada_en is null;
create index pda_vinculaciones_actor on pda_privado.vinculaciones(creada_por, tenant_id);

create table pda_privado.dispositivos (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  credencial_hash bytea not null check (octet_length(credencial_hash) = 32),
  vinculado_por uuid not null,
  vinculado_en timestamptz not null default clock_timestamp(),
  ultimo_acceso_en timestamptz,
  revocado_en timestamptz,
  revocado_por uuid,
  unique (tenant_id, id),
  foreign key (vinculado_por, tenant_id) references public.identity_membresias(usuario_id, tenant_id),
  foreign key (revocado_por, tenant_id) references public.identity_membresias(usuario_id, tenant_id),
  check ((revocado_en is null) = (revocado_por is null))
);
create index pda_dispositivos_actor on pda_privado.dispositivos(vinculado_por, tenant_id);
create index pda_dispositivos_revocador on pda_privado.dispositivos(revocado_por, tenant_id);

-- Activación explícita por empresa después de actualizar sus clientes de campo.
create table pda_privado.configuracion (
  tenant_id uuid primary key references public.tenants(id),
  obligatorio boolean not null,
  actualizado_por uuid not null,
  actualizado_en timestamptz not null default clock_timestamp(),
  foreign key (actualizado_por, tenant_id) references public.identity_membresias(usuario_id, tenant_id)
);
create index pda_configuracion_actor on pda_privado.configuracion(actualizado_por, tenant_id);

-- Recibos del nuevo contrato: conservan el actor original aun en un PDA compartido.
create table pda_privado.operaciones (
  id uuid primary key,
  tenant_id uuid not null,
  dispositivo_id uuid not null,
  usuario_id uuid not null,
  campania_id uuid not null,
  tipo text not null check (tipo in ('ASIGNAR_LOTE', 'INICIAR_SESION', 'REGISTRAR_COSECHA', 'CERRAR_SESION')),
  datos jsonb not null,
  resultado jsonb not null,
  creada_en timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, dispositivo_id) references pda_privado.dispositivos(tenant_id, id),
  foreign key (usuario_id, tenant_id) references public.identity_membresias(usuario_id, tenant_id),
  foreign key (tenant_id, campania_id) references public.campanias(tenant_id, id)
);
create index pda_operaciones_dispositivo on pda_privado.operaciones(tenant_id, dispositivo_id);
create index pda_operaciones_actor on pda_privado.operaciones(usuario_id, tenant_id);
create index pda_operaciones_campania on pda_privado.operaciones(tenant_id, campania_id);

alter table pda_privado.vinculaciones enable row level security;
alter table pda_privado.dispositivos enable row level security;
alter table pda_privado.operaciones enable row level security;
alter table pda_privado.configuracion enable row level security;
revoke all on all tables in schema pda_privado from public, anon, authenticated;

create function pda_privado.dispositivo_json(p_dispositivo pda_privado.dispositivos)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('id', p_dispositivo.id, 'tenantId', p_dispositivo.tenant_id,
    'nombre', p_dispositivo.nombre, 'vinculadoPor', p_dispositivo.vinculado_por,
    'vinculadoEn', p_dispositivo.vinculado_en, 'ultimoAccesoEn', p_dispositivo.ultimo_acceso_en,
    'revocadoEn', p_dispositivo.revocado_en,
    'estado', case when p_dispositivo.revocado_en is null then 'ACTIVO' else 'REVOCADO' end);
$$;

create function pda_privado.generar_vinculacion(p_tenant_id uuid, p_vigencia_horas integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
  v_token text;
  v_fila pda_privado.vinculaciones;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión autenticada requerida'; end if;
  v_usuario := public.iam_exigir_permiso(p_tenant_id, 'company.manage');
  perform public.platform_exigir_modulo(p_tenant_id, 'HARVEST');
  if p_vigencia_horas is null or p_vigencia_horas not between 1 and 168 then
    raise exception 'La vigencia del QR debe ser de 1 a 168 horas';
  end if;
  -- Serializa regeneraciones simultáneas de la misma empresa.
  perform 1 from public.tenants where id = p_tenant_id for update;
  update pda_privado.vinculaciones set revocada_en = clock_timestamp()
    where tenant_id = p_tenant_id and revocada_en is null;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into pda_privado.vinculaciones(tenant_id, token_hash, creada_por, vence_en)
    values (p_tenant_id, sha256(convert_to(v_token, 'UTF8')), v_usuario,
      clock_timestamp() + make_interval(hours => p_vigencia_horas)) returning * into v_fila;
  -- El texto del QR se entrega una sola vez, no se almacena ni se incluye en listados.
  return jsonb_build_object('id', v_fila.id, 'tenantId', p_tenant_id,
    'token', v_token, 'venceEn', v_fila.vence_en);
end;
$$;

create function pda_privado.administrar(p_tenant_id uuid, p_dispositivo_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
  v_dispositivo pda_privado.dispositivos;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión autenticada requerida'; end if;
  v_usuario := public.iam_exigir_permiso(p_tenant_id, 'company.manage');
  if p_dispositivo_id is not null then
    select * into v_dispositivo from pda_privado.dispositivos
      where tenant_id = p_tenant_id and id = p_dispositivo_id for update;
    if not found then raise exception using errcode = '42501', message = 'Dispositivo no disponible en esta empresa'; end if;
    update pda_privado.dispositivos
      set revocado_en = coalesce(revocado_en, clock_timestamp()), revocado_por = coalesce(revocado_por, v_usuario)
      where id = p_dispositivo_id returning * into v_dispositivo;
    return pda_privado.dispositivo_json(v_dispositivo);
  end if;
  return jsonb_build_object('tenantId', p_tenant_id,
    'accesoVinculadoObligatorio', coalesce((select c.obligatorio from pda_privado.configuracion c where c.tenant_id = p_tenant_id), false),
    'vinculacion', (select jsonb_build_object('id', v.id, 'venceEn', v.vence_en,
      'estado', case when v.vence_en > clock_timestamp() then 'ACTIVA' else 'VENCIDA' end)
      from pda_privado.vinculaciones v where v.tenant_id = p_tenant_id and v.revocada_en is null),
    'dispositivos', coalesce((select jsonb_agg(pda_privado.dispositivo_json(d) order by d.vinculado_en, d.id)
      from pda_privado.dispositivos d where d.tenant_id = p_tenant_id), '[]'::jsonb));
end;
$$;

create function pda_privado.configurar(p_tenant_id uuid, p_obligatorio boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión autenticada requerida'; end if;
  v_usuario := public.iam_exigir_permiso(p_tenant_id, 'company.manage');
  if p_obligatorio is null then raise exception 'Estado de acceso vinculado requerido'; end if;
  if p_obligatorio then perform public.platform_exigir_modulo(p_tenant_id, 'HARVEST'); end if;
  insert into pda_privado.configuracion(tenant_id, obligatorio, actualizado_por)
    values (p_tenant_id, p_obligatorio, v_usuario)
    on conflict (tenant_id) do update set obligatorio = excluded.obligatorio,
      actualizado_por = excluded.actualizado_por, actualizado_en = clock_timestamp();
  return jsonb_build_object('tenantId', p_tenant_id, 'accesoVinculadoObligatorio', p_obligatorio);
end;
$$;

create function pda_privado.vincular(p_token text, p_dispositivo_id uuid, p_credencial text, p_nombre text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_vinculacion pda_privado.vinculaciones;
  v_dispositivo pda_privado.dispositivos;
  v_contexto jsonb;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión autenticada requerida'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'QR no disponible o vencido';
  end if;
  if p_dispositivo_id is null or p_credencial is null or p_credencial !~ '^[0-9a-f]{64}$'
    or p_nombre is null or length(btrim(p_nombre)) not between 1 and 80 then
    raise exception 'Identificador, credencial de 32 bytes y nombre de dispositivo requeridos';
  end if;
  -- El bloqueo compartido coordina la vinculación con la regeneración del QR.
  select * into v_vinculacion from pda_privado.vinculaciones
    where token_hash = sha256(convert_to(p_token, 'UTF8')) and revocada_en is null for share;
  if not found or v_vinculacion.vence_en <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'QR no disponible o vencido';
  end if;
  perform public.iam_exigir_permiso(v_vinculacion.tenant_id, 'harvest.operate');
  perform public.platform_exigir_modulo(v_vinculacion.tenant_id, 'HARVEST');
  v_contexto := public.iam_resolver_tenant_context(v_vinculacion.tenant_id);
  perform pg_advisory_xact_lock(hashtextextended('pda:' || p_dispositivo_id::text, 0));
  select * into v_dispositivo from pda_privado.dispositivos where id = p_dispositivo_id for update;
  if found then
    if v_dispositivo.tenant_id <> v_vinculacion.tenant_id or v_dispositivo.revocado_en is not null
      or v_dispositivo.credencial_hash <> sha256(convert_to(p_credencial, 'UTF8')) then
      raise exception using errcode = '42501', message = 'La instalación ya está vinculada o revocada';
    end if;
    -- Reintento tras una respuesta perdida: no rota la credencial ni cambia el actor.
  else
    insert into pda_privado.dispositivos(id, tenant_id, nombre, credencial_hash, vinculado_por)
      values (p_dispositivo_id, v_vinculacion.tenant_id, btrim(p_nombre),
        sha256(convert_to(p_credencial, 'UTF8')), (v_contexto->>'usuarioId')::uuid)
      returning * into v_dispositivo;
  end if;
  return jsonb_build_object('dispositivo', pda_privado.dispositivo_json(v_dispositivo), 'contexto', v_contexto);
end;
$$;

create function pda_privado.exigir_dispositivo(p_dispositivo_id uuid, p_credencial text)
returns pda_privado.dispositivos language plpgsql security definer set search_path = '' as $$
declare v_dispositivo pda_privado.dispositivos;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Sesión autenticada requerida'; end if;
  if p_credencial is null or p_credencial !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'Dispositivo no autorizado';
  end if;
  -- Serializa las escrituras de último acceso y la revocación, evitando upgrades
  -- de bloqueos compartidos entre solicitudes simultáneas del mismo equipo.
  select * into v_dispositivo from pda_privado.dispositivos
    where id = p_dispositivo_id and credencial_hash = sha256(convert_to(p_credencial, 'UTF8'))
      and revocado_en is null for no key update;
  if not found then raise exception using errcode = '42501', message = 'Dispositivo no autorizado'; end if;
  perform public.iam_exigir_permiso(v_dispositivo.tenant_id, 'harvest.operate');
  perform public.platform_exigir_modulo(v_dispositivo.tenant_id, 'HARVEST');
  return v_dispositivo;
end;
$$;

create function pda_privado.obtener_contexto(p_dispositivo_id uuid, p_credencial text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_dispositivo pda_privado.dispositivos;
begin
  v_dispositivo := pda_privado.exigir_dispositivo(p_dispositivo_id, p_credencial);
  update pda_privado.dispositivos set ultimo_acceso_en = clock_timestamp()
    where id = v_dispositivo.id returning * into v_dispositivo;
  return jsonb_build_object('dispositivo', pda_privado.dispositivo_json(v_dispositivo),
    'contexto', public.iam_resolver_tenant_context(v_dispositivo.tenant_id),
    'campanias', public.iam_listar_campanias(v_dispositivo.tenant_id),
    'validadoEn', clock_timestamp(),
    'autorizadoHasta', ((clock_timestamp() at time zone 'America/Lima')::date + 1)::timestamp at time zone 'America/Lima');
end;
$$;

-- Se ejecuta también desde las rutas IAM existentes cuando la empresa activa el
-- nuevo acceso. La autoridad proviene siempre de la credencial, nunca de la GUC.
create function pda_privado.exigir_solicitud(p_campania_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := public.platform_tenant_campania(p_campania_id);
  v_datos jsonb;
  v_dispositivo pda_privado.dispositivos;
begin
  if not coalesce((select c.obligatorio from pda_privado.configuracion c where c.tenant_id = v_tenant), false) then return; end if;
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Esta empresa requiere sesión autenticada y PDA vinculado';
  end if;
  -- pda_operar instala este contexto sólo durante su llamada y luego lo restaura.
  v_datos := nullif(current_setting('gesgrow.pda_solicitud', true), '')::jsonb;
  if coalesce(v_datos->>'id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '42501', message = 'PDA vinculado requerido: utilice pda_operar';
  end if;
  v_dispositivo := pda_privado.exigir_dispositivo((v_datos->>'id')::uuid, v_datos->>'credencial');
  if v_dispositivo.tenant_id <> v_tenant then
    raise exception using errcode = '42501', message = 'Dispositivo de otra empresa';
  end if;
end;
$$;

create function pda_privado.operar(p_dispositivo_id uuid, p_credencial text, p_campania_id uuid,
  p_operacion_id uuid, p_tipo text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_dispositivo pda_privado.dispositivos;
  v_usuario uuid;
  v_anterior pda_privado.operaciones;
  v_resultado jsonb;
  v_contexto_anterior text := current_setting('gesgrow.pda_solicitud', true);
begin
  v_dispositivo := pda_privado.exigir_dispositivo(p_dispositivo_id, p_credencial);
  if p_operacion_id is null or p_tipo is null or p_tipo not in
    ('ASIGNAR_LOTE', 'INICIAR_SESION', 'REGISTRAR_COSECHA', 'CERRAR_SESION')
    or p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Operación de PDA inválida';
  end if;
  if public.platform_tenant_campania(p_campania_id) is distinct from v_dispositivo.tenant_id then
    raise exception using errcode = '42501', message = 'Campaña de otra empresa';
  end if;
  perform set_config('gesgrow.pda_solicitud', jsonb_build_object('id', v_dispositivo.id, 'credencial', p_credencial)::text, true);
  v_usuario := public.iam_exigir_campania(p_campania_id, 'harvest.operate');
  perform pg_advisory_xact_lock(hashtextextended('pda.operacion:' || p_operacion_id::text, 0));
  select * into v_anterior from pda_privado.operaciones where id = p_operacion_id;
  if found then
    if v_anterior.dispositivo_id <> v_dispositivo.id or v_anterior.usuario_id <> v_usuario
      or v_anterior.campania_id <> p_campania_id or v_anterior.tipo <> p_tipo or v_anterior.datos <> p_datos then
      raise exception using errcode = '42501', message = 'ID de operación reutilizado por otro actor, dispositivo o datos';
    end if;
    perform set_config('gesgrow.pda_solicitud', coalesce(v_contexto_anterior, ''), true);
    return v_anterior.resultado;
  end if;
  -- No atribuir al dispositivo un comando que entró antes por otra ruta.
  if exists(select 1 from public.operaciones_pda_campania where id = p_operacion_id)
    or (p_tipo = 'INICIAR_SESION' and exists(select 1 from public.sesiones_lectura where id = p_operacion_id)) then
    raise exception using errcode = '42501', message = 'ID de operación existente fuera del contrato de este PDA';
  end if;
  case p_tipo
    when 'ASIGNAR_LOTE' then
      if nullif(p_datos->>'trabajadorId', '') is null or nullif(p_datos->>'codigo', '') is null then
        raise exception 'Trabajador y código requeridos';
      end if;
      v_resultado := public.iam_asignar_lote(p_campania_id, (p_datos->>'trabajadorId')::uuid,
        p_datos->>'codigo', p_operacion_id);
    when 'INICIAR_SESION' then
      if nullif(p_datos->>'loteId', '') is null or nullif(p_datos->>'variedadId', '') is null
        or nullif(p_datos->>'jaberoRolId', '') is null then raise exception 'Lote, variedad y jabero requeridos'; end if;
      v_resultado := public.iam_iniciar_sesion_lectura(p_campania_id, (p_datos->>'loteId')::uuid,
        (p_datos->>'variedadId')::uuid, (p_datos->>'jaberoRolId')::uuid, p_operacion_id);
    when 'REGISTRAR_COSECHA' then
      if nullif(p_datos->>'sesionId', '') is null or nullif(p_datos->>'codigo', '') is null
        or nullif(p_datos->>'fecha', '') is null then raise exception 'Sesión, código y fecha requeridos'; end if;
      v_resultado := public.iam_registrar_cosecha(p_campania_id, (p_datos->>'sesionId')::uuid,
        p_datos->>'codigo', p_operacion_id, p_operacion_id, (p_datos->>'fecha')::timestamptz);
    when 'CERRAR_SESION' then
      if nullif(p_datos->>'sesionId', '') is null then raise exception 'Sesión requerida'; end if;
      v_resultado := public.iam_cerrar_sesion_lectura(p_campania_id, (p_datos->>'sesionId')::uuid);
  end case;
  insert into pda_privado.operaciones(id, tenant_id, dispositivo_id, usuario_id, campania_id, tipo, datos, resultado)
    values (p_operacion_id, v_dispositivo.tenant_id, v_dispositivo.id, v_usuario, p_campania_id, p_tipo, p_datos, v_resultado);
  update pda_privado.dispositivos set ultimo_acceso_en = clock_timestamp() where id = v_dispositivo.id;
  perform set_config('gesgrow.pda_solicitud', coalesce(v_contexto_anterior, ''), true);
  return v_resultado;
exception when others then
  perform set_config('gesgrow.pda_solicitud', coalesce(v_contexto_anterior, ''), true);
  raise;
end;
$$;

-- Mantener firmas, ACL y validaciones de permisos, módulo y participación que
-- ya instalaron las migraciones anteriores. Sin activación no cambia su conducta.
do $guardas$
declare v_firma text; v_original text; v_nuevo text;
begin
  foreach v_firma in array array['public.iam_exigir_campania(uuid,text)',
    'public.autorizar_operador_campania(character varying,uuid)', 'public.validar_operador(character varying)'] loop
    v_original := pg_get_functiondef(v_firma::regprocedure);
    v_nuevo := regexp_replace(v_original, '\mbegin\M',
      case when v_firma like 'public.iam_%' then
        'begin if p_permiso = ''harvest.operate'' then perform pda_privado.exigir_solicitud(p_campania_id); end if;'
      when v_firma like 'public.validar_operador(%' then
        'begin perform pda_privado.exigir_solicitud(public.campania_operativa_id());'
      else 'begin perform pda_privado.exigir_solicitud(p_campania_id);' end, 'i');
    if v_nuevo = v_original then raise exception 'No se pudo instalar la guarda PDA en %', v_firma; end if;
    execute v_nuevo;
  end loop;
end;
$guardas$;

-- Fachadas invoker: sin acceso directo a tablas, ni parámetros de actor o permisos.
create function public.pda_generar_vinculacion(p_tenant_id uuid, p_vigencia_horas integer default 24)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.generar_vinculacion(p_tenant_id, p_vigencia_horas);
$$;
create function public.pda_administrar_dispositivos(p_tenant_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.administrar(p_tenant_id);
$$;
create function public.pda_revocar_dispositivo(p_tenant_id uuid, p_dispositivo_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_dispositivo_id is null then raise exception 'Dispositivo requerido'; end if;
  return pda_privado.administrar(p_tenant_id, p_dispositivo_id);
end;
$$;
create function public.pda_vincular_dispositivo(p_token text, p_dispositivo_id uuid, p_credencial text, p_nombre text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.vincular(p_token, p_dispositivo_id, p_credencial, p_nombre);
$$;
create function public.pda_obtener_contexto(p_dispositivo_id uuid, p_credencial text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.obtener_contexto(p_dispositivo_id, p_credencial);
$$;
create function public.pda_operar(p_dispositivo_id uuid, p_credencial text, p_campania_id uuid,
  p_operacion_id uuid, p_tipo text, p_datos jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.operar(p_dispositivo_id, p_credencial, p_campania_id, p_operacion_id, p_tipo, p_datos);
$$;
create function public.pda_configurar_acceso(p_tenant_id uuid, p_obligatorio boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.configurar(p_tenant_id, p_obligatorio);
$$;

revoke all on all functions in schema pda_privado from public, anon, authenticated;
grant execute on function pda_privado.generar_vinculacion(uuid, integer),
  pda_privado.administrar(uuid, uuid), pda_privado.vincular(text, uuid, text, text),
  pda_privado.obtener_contexto(uuid, text), pda_privado.operar(uuid, text, uuid, uuid, text, jsonb),
  pda_privado.configurar(uuid, boolean) to authenticated;
revoke all on function public.pda_generar_vinculacion(uuid, integer), public.pda_administrar_dispositivos(uuid),
  public.pda_revocar_dispositivo(uuid, uuid), public.pda_vincular_dispositivo(text, uuid, text, text),
  public.pda_obtener_contexto(uuid, text), public.pda_operar(uuid, text, uuid, uuid, text, jsonb),
  public.pda_configurar_acceso(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.pda_generar_vinculacion(uuid, integer), public.pda_administrar_dispositivos(uuid),
  public.pda_revocar_dispositivo(uuid, uuid), public.pda_vincular_dispositivo(text, uuid, text, text),
  public.pda_obtener_contexto(uuid, text), public.pda_operar(uuid, text, uuid, uuid, text, jsonb),
  public.pda_configurar_acceso(uuid, boolean) to authenticated;

comment on schema pda_privado is 'Credenciales y recibos del PDA. No exponer en la Data API.';
notify pgrst, 'reload schema';
commit;
