begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table pda_privado.pines (
  tenant_id uuid not null,
  usuario_id uuid not null,
  hash text not null,
  version uuid not null default gen_random_uuid(),
  fallos integer not null default 0 check (fallos >= 0),
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default clock_timestamp(),
  primary key (tenant_id, usuario_id),
  foreign key (usuario_id, tenant_id) references public.identity_membresias(usuario_id, tenant_id)
);
create table pda_privado.intentos_pin (
  dispositivo_id uuid primary key references pda_privado.dispositivos(id),
  fallos integer not null default 0 check (fallos >= 0),
  bloqueado_hasta timestamptz
);
create table pda_privado.sesiones_pin (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  dispositivo_id uuid not null,
  usuario_id uuid not null,
  sujeto uuid not null,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  pin_version uuid not null,
  creada_en timestamptz not null default clock_timestamp(),
  vence_en timestamptz not null,
  revocada_en timestamptz,
  foreign key (tenant_id, dispositivo_id) references pda_privado.dispositivos(tenant_id, id),
  foreign key (usuario_id, tenant_id) references public.identity_membresias(usuario_id, tenant_id)
);
create unique index pda_sesion_pin_activa on pda_privado.sesiones_pin(dispositivo_id) where revocada_en is null;
create index pda_sesiones_pin_actor on pda_privado.sesiones_pin(usuario_id, tenant_id);
alter table pda_privado.pines enable row level security;
alter table pda_privado.intentos_pin enable row level security;
alter table pda_privado.sesiones_pin enable row level security;
revoke all on pda_privado.pines, pda_privado.intentos_pin, pda_privado.sesiones_pin from public, anon, authenticated;

-- Solo un secreto de instalación ya vinculado permite consultar el ingreso PIN.
create function pda_privado.equipo_pin(p_dispositivo_id uuid, p_credencial text)
returns pda_privado.dispositivos language plpgsql security definer set search_path = '' as $$
declare v_equipo pda_privado.dispositivos;
begin
  if p_credencial is null or p_credencial !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '42501', message = 'PDA no autorizado';
  end if;
  select * into v_equipo from pda_privado.dispositivos
    where id = p_dispositivo_id and credencial_hash = sha256(convert_to(p_credencial, 'UTF8'))
      and revocado_en is null for update;
  if not found then raise exception using errcode = '42501', message = 'PDA no autorizado o revocado'; end if;
  return v_equipo;
end;
$$;

create function pda_privado.configurar_pin(p_dispositivo_id uuid, p_credencial text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_equipo pda_privado.dispositivos; v_usuario uuid; v_dni text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Valida tu cuenta para configurar el PIN'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'El PIN debe contener 4 dígitos'; end if;
  v_equipo := pda_privado.exigir_dispositivo(p_dispositivo_id, p_credencial);
  v_usuario := public.iam_usuario_actual();
  select coalesce(u.dni, t.dni) into v_dni
    from public.identity_usuarios u join public.identity_membresias m on m.usuario_id = u.id
    join public.trabajadores t on t.id = m.trabajador_id and t.tenant_id = m.tenant_id and t.activo
    where u.id = v_usuario and m.tenant_id = v_equipo.tenant_id and m.activo;
  if v_dni is null then raise exception 'Activa tu cuenta con DNI y su acceso a Cosecha antes de crear el PIN'; end if;
  insert into pda_privado.pines(tenant_id, usuario_id, hash)
    values(v_equipo.tenant_id, v_usuario, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
    on conflict(tenant_id, usuario_id) do update set hash = excluded.hash, version = gen_random_uuid(),
      fallos = 0, bloqueado_hasta = null, actualizado_en = clock_timestamp();
  update pda_privado.sesiones_pin set revocada_en = clock_timestamp()
    where tenant_id = v_equipo.tenant_id and usuario_id = v_usuario and revocada_en is null;
  return jsonb_build_object('dni', v_dni);
end;
$$;

-- Contexto transaccional del actor elegido exclusivamente por el secreto PIN.
-- Nunca se acepta usuario/sujeto/empresa desde el cliente ni se emite un JWT.
create function pda_privado.contexto_pin(p_sujeto uuid, p_dispositivo_id uuid, p_credencial text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true); v_resultado jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_sujeto::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_sujeto)::text, true);
  v_resultado := pda_privado.ingresar(p_dispositivo_id, p_credencial);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  return v_resultado;
exception when others then
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  raise;
end;
$$;

create function pda_privado.login_pin(p_dispositivo_id uuid, p_credencial text, p_dni text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_equipo pda_privado.dispositivos; v_pin pda_privado.pines;
  v_intentos pda_privado.intentos_pin; v_usuario uuid; v_sujeto uuid;
  v_resultado jsonb; v_token text; v_vence timestamptz;
begin
  v_equipo := pda_privado.equipo_pin(p_dispositivo_id, p_credencial);
  insert into pda_privado.intentos_pin(dispositivo_id) values(v_equipo.id) on conflict do nothing;
  select * into v_intentos from pda_privado.intentos_pin where dispositivo_id = v_equipo.id for update;
  if v_intentos.bloqueado_hasta > clock_timestamp() then
    return jsonb_build_object('ok', false, 'mensaje', 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
  end if;
  if v_intentos.bloqueado_hasta is not null then
    update pda_privado.intentos_pin set fallos = 0, bloqueado_hasta = null where dispositivo_id = v_equipo.id;
  end if;
  select u.id, i.sujeto into v_usuario, v_sujeto
    from public.identity_usuarios u
    join public.identity_membresias m on m.usuario_id = u.id and m.tenant_id = v_equipo.tenant_id and m.activo
    join public.trabajadores t on t.id = m.trabajador_id and t.tenant_id = m.tenant_id and t.activo
    join public.identity_identidades i on i.usuario_id = u.id and i.proveedor = 'SUPABASE'
    where u.activo and coalesce(u.dni, t.dni) = btrim(p_dni) order by i.sujeto limit 1;
  select * into v_pin from pda_privado.pines where tenant_id = v_equipo.tenant_id and usuario_id = v_usuario for update;
  if v_pin.bloqueado_hasta > clock_timestamp() then
    return jsonb_build_object('ok', false, 'mensaje', 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.');
  end if;
  if v_pin.bloqueado_hasta is not null then
    update pda_privado.pines set fallos = 0, bloqueado_hasta = null where tenant_id = v_equipo.tenant_id and usuario_id = v_usuario;
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or p_dni is null or p_dni !~ '^[0-9]{8}$'
    or v_pin.usuario_id is null or extensions.crypt(p_pin, v_pin.hash) is distinct from v_pin.hash then
    -- Retornar el rechazo para confirmar los contadores; RAISE los revertiría.
    update pda_privado.intentos_pin set fallos = fallos + 1,
      bloqueado_hasta = case when fallos + 1 >= 10 then clock_timestamp() + interval '15 minutes' end
      where dispositivo_id = v_equipo.id;
    update pda_privado.pines set fallos = fallos + 1,
      bloqueado_hasta = case when fallos + 1 >= 5 then clock_timestamp() + interval '15 minutes' end
      where tenant_id = v_equipo.tenant_id and usuario_id = v_usuario;
    return jsonb_build_object('ok', false, 'mensaje', 'DNI o PIN incorrectos. Si aún no tienes PIN, configura tu acceso.');
  end if;
  v_resultado := pda_privado.contexto_pin(v_sujeto, v_equipo.id, p_credencial);
  if v_resultado->'operador' is null or v_resultado->'operador' = 'null'::jsonb then
    return jsonb_build_object('ok', false, 'mensaje', 'No tienes campañas activas de supervisor asignadas en esta empresa.');
  end if;
  update pda_privado.pines set fallos = 0, bloqueado_hasta = null where tenant_id = v_equipo.tenant_id and usuario_id = v_usuario;
  update pda_privado.intentos_pin set fallos = 0, bloqueado_hasta = null where dispositivo_id = v_equipo.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_vence := least(clock_timestamp() + interval '12 hours', (v_resultado->>'autorizadoHasta')::timestamptz);
  update pda_privado.sesiones_pin set revocada_en = clock_timestamp() where dispositivo_id = v_equipo.id and revocada_en is null;
  insert into pda_privado.sesiones_pin(tenant_id, dispositivo_id, usuario_id, sujeto, token_hash, pin_version, vence_en)
    values(v_equipo.tenant_id, v_equipo.id, v_usuario, v_sujeto, sha256(convert_to(v_token, 'UTF8')), v_pin.version, v_vence);
  return jsonb_build_object('ok', true, 'sesion', v_token, 'datos', v_resultado || jsonb_build_object('autorizadoHasta', v_vence));
end;
$$;

create function pda_privado.validar_pin(p_dispositivo_id uuid, p_credencial text, p_sesion text, p_cerrar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_equipo pda_privado.dispositivos; v_sesion pda_privado.sesiones_pin; v_resultado jsonb;
begin
  v_equipo := pda_privado.equipo_pin(p_dispositivo_id, p_credencial);
  select s.* into v_sesion from pda_privado.sesiones_pin s join pda_privado.pines p
    on p.tenant_id = s.tenant_id and p.usuario_id = s.usuario_id and p.version = s.pin_version
    where s.dispositivo_id = v_equipo.id and s.token_hash = sha256(convert_to(p_sesion, 'UTF8'))
      and s.revocada_en is null and s.vence_en > clock_timestamp() for update of s;
  if not found then raise exception using errcode = '42501', message = 'La sesión venció. Ingresa tu DNI y PIN'; end if;
  if p_cerrar then
    update pda_privado.sesiones_pin set revocada_en = clock_timestamp() where id = v_sesion.id;
    return jsonb_build_object('ok', true);
  end if;
  v_resultado := pda_privado.contexto_pin(v_sesion.sujeto, v_equipo.id, p_credencial);
  return v_resultado || jsonb_build_object('autorizadoHasta', v_sesion.vence_en);
end;
$$;

create function public.pda_configurar_pin(p_dispositivo_id uuid, p_credencial text, p_pin text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.configurar_pin(p_dispositivo_id, p_credencial, p_pin);
$$;
create function public.pda_iniciar_sesion_pin(p_dispositivo_id uuid, p_credencial text, p_dni text, p_pin text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.login_pin(p_dispositivo_id, p_credencial, p_dni, p_pin);
$$;
create function public.pda_preparar_ingreso_pin(p_dispositivo_id uuid, p_credencial text, p_sesion text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.validar_pin(p_dispositivo_id, p_credencial, p_sesion);
$$;
create function public.pda_cerrar_sesion_pin(p_dispositivo_id uuid, p_credencial text, p_sesion text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.validar_pin(p_dispositivo_id, p_credencial, p_sesion, true);
$$;

revoke all on function pda_privado.equipo_pin(uuid,text), pda_privado.configurar_pin(uuid,text,text),
  pda_privado.contexto_pin(uuid,uuid,text), pda_privado.login_pin(uuid,text,text,text),
  pda_privado.validar_pin(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.pda_configurar_pin(uuid,text,text), public.pda_iniciar_sesion_pin(uuid,text,text,text),
  public.pda_preparar_ingreso_pin(uuid,text,text), public.pda_cerrar_sesion_pin(uuid,text,text) from public, anon, authenticated;
grant usage on schema pda_privado to anon;
grant execute on function pda_privado.configurar_pin(uuid,text,text), public.pda_configurar_pin(uuid,text,text) to authenticated;
grant execute on function pda_privado.login_pin(uuid,text,text,text), pda_privado.validar_pin(uuid,text,text,boolean),
  public.pda_iniciar_sesion_pin(uuid,text,text,text), public.pda_preparar_ingreso_pin(uuid,text,text),
  public.pda_cerrar_sesion_pin(uuid,text,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
