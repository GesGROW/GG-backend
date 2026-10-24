begin;
do $identity_f62$
begin
  if obj_description(to_regclass('public.identity_usuarios'),'pg_class') = 'GesGROW F6.2: identidad y permisos v1' then return; end if;
  if to_regclass('public.tenants') is null then raise exception 'Aplique F6.1 antes de Identity & Access'; end if;

-- Usuario es un principal global. La pertenencia organizacional está en Membresía.
-- Ninguna de estas cuentas se crea a partir de DNI, usuarios_app o roles laborales.
create table public.identity_usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Usuario', email text,
  activo boolean not null default true, created_at timestamptz not null default now()
);
create table public.identity_identidades (
  proveedor text not null check(proveedor='SUPABASE'), sujeto uuid not null,
  usuario_id uuid not null references public.identity_usuarios(id),
  primary key(proveedor,sujeto), unique(proveedor,usuario_id)
);
create table public.identity_membresias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.identity_usuarios(id),
  tenant_id uuid not null references public.tenants(id),
  activo boolean not null default true, trabajador_id uuid,
  created_at timestamptz not null default now(),
  unique(usuario_id,tenant_id), unique(tenant_id,id),
  foreign key(tenant_id,trabajador_id) references public.trabajadores(tenant_id,id)
);
create table public.identity_permisos (
  codigo text primary key check(codigo in ('company.manage','campaign.manage','workforce.manage','harvest.operate','harvest.view','reports.view'))
);
create table public.identity_roles (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  codigo text not null, activo boolean not null default true,
  unique(tenant_id,codigo), unique(tenant_id,id)
);
create table public.identity_rol_permisos (
  tenant_id uuid not null, rol_id uuid not null, permiso text not null references public.identity_permisos(codigo),
  primary key(tenant_id,rol_id,permiso),
  foreign key(tenant_id,rol_id) references public.identity_roles(tenant_id,id)
);
create table public.identity_membresia_roles (
  tenant_id uuid not null, membresia_id uuid not null, rol_id uuid not null,
  primary key(tenant_id,membresia_id,rol_id),
  foreign key(tenant_id,membresia_id) references public.identity_membresias(tenant_id,id),
  foreign key(tenant_id,rol_id) references public.identity_roles(tenant_id,id)
);
insert into public.identity_permisos values
 ('company.manage'),('campaign.manage'),('workforce.manage'),('harvest.operate'),('harvest.view'),('reports.view');

-- Plantillas pequeñas; los códigos de rol no se comparan al autorizar acciones.
create function public.iam_sembrar_roles(p_tenant uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.identity_roles(tenant_id,codigo)
    select p_tenant,codigo from unnest(array['ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA']) codigo
    on conflict(tenant_id,codigo) do nothing;
  insert into public.identity_rol_permisos(tenant_id,rol_id,permiso)
    select p_tenant,r.id,p.codigo from public.identity_roles r cross join public.identity_permisos p
    where r.tenant_id=p_tenant and (
      r.codigo='ADMIN_EMPRESA'
      or (r.codigo='GESTOR' and p.codigo in ('campaign.manage','workforce.manage','harvest.view','reports.view'))
      or (r.codigo='OPERADOR_CAMPO' and p.codigo in ('harvest.operate','harvest.view'))
      or (r.codigo='CONSULTA' and p.codigo in ('harvest.view','reports.view'))
    ) on conflict do nothing;
end $$;
perform public.iam_sembrar_roles(id) from public.tenants;
create function public.iam_roles_nueva_empresa()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.iam_sembrar_roles(new.id); return new; end $$;
create trigger identity_roles_empresa after insert on public.tenants
for each row execute function public.iam_roles_nueva_empresa();

-- El proveedor verifica la sesión y PostgREST establece auth.uid(). Ningún RPC
-- recibe usuario/sujeto para decidir quién es el actor de la solicitud.
create function public.iam_usuario_actual()
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select u.id from public.identity_identidades i join public.identity_usuarios u on u.id=i.usuario_id
  where i.proveedor='SUPABASE' and i.sujeto=auth.uid() and u.activo;
$$;
create function public.iam_es_miembro(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.identity_membresias m join public.tenants t on t.id=m.tenant_id
    where m.usuario_id=public.iam_usuario_actual() and m.tenant_id=p_tenant_id and m.activo and t.estado='ACTIVA');
$$;
create function public.iam_permisos_efectivos(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(codigo order by codigo),'[]'::jsonb) from (
    select distinct rp.permiso codigo from public.identity_membresias m
    join public.identity_membresia_roles mr on mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
    join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
    join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id
    where m.usuario_id=public.iam_usuario_actual() and m.tenant_id=p_tenant_id and m.activo
      and public.iam_es_miembro(p_tenant_id)
  ) permisos;
$$;
create function public.iam_tiene_permiso(p_tenant_id uuid,p_permiso text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select public.iam_permisos_efectivos(p_tenant_id) ? p_permiso;
$$;
create function public.iam_resolver_tenant_context(p_tenant_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid := public.iam_usuario_actual(); v_tenant uuid := p_tenant_id; v_total integer; v_contexto jsonb;
begin
  if v_usuario is null then raise exception using errcode='42501',message='Sesión autenticada requerida o usuario inactivo'; end if;
  if v_tenant is null then
    select count(*),(array_agg(m.tenant_id))[1] into v_total,v_tenant
    from public.identity_membresias m join public.tenants t on t.id=m.tenant_id
    where m.usuario_id=v_usuario and m.activo and t.estado='ACTIVA';
    if v_total=0 then raise exception using errcode='42501',message='Usuario sin membresía activa'; end if;
    if v_total<>1 then raise exception using errcode='42501',message='Seleccione una empresa autorizada'; end if;
  end if;
  select jsonb_build_object('usuarioId',v_usuario,'membresiaId',m.id,'tenantId',t.id,
    'empresa',t.nombre,'permisos',public.iam_permisos_efectivos(t.id)) into v_contexto
  from public.identity_membresias m join public.tenants t on t.id=m.tenant_id
  where m.usuario_id=v_usuario and m.tenant_id=v_tenant and m.activo and t.estado='ACTIVA';
  if v_contexto is null then raise exception using errcode='42501',message='Empresa no autorizada o membresía inactiva'; end if;
  return v_contexto;
end $$;
create function public.iam_exigir_permiso(p_tenant uuid,p_permiso text)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_contexto jsonb := public.iam_resolver_tenant_context(p_tenant);
begin
  if not (v_contexto->'permisos' ? p_permiso) then
    raise exception using errcode='42501',message='Permiso de aplicación denegado',detail=p_permiso;
  end if;
  return (v_contexto->>'usuarioId')::uuid;
end $$;
create function public.iam_exigir_campania(p_campania_id uuid,p_permiso text)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin return public.iam_exigir_permiso(public.platform_tenant_campania(p_campania_id),p_permiso); end $$;

-- Alta de perfil de cuenta verificada: no concede membresías ni crea trabajador.
create function public.iam_obtener_identidad()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_sujeto uuid := auth.uid(); v_usuario uuid; v_resultado jsonb;
begin
  if v_sujeto is null then raise exception using errcode='42501',message='Sesión autenticada requerida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('identity:'||v_sujeto::text,0));
  select usuario_id into v_usuario from public.identity_identidades where proveedor='SUPABASE' and sujeto=v_sujeto;
  if not found then
    insert into public.identity_usuarios(email)
      values(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email') returning id into v_usuario;
    insert into public.identity_identidades(proveedor,sujeto,usuario_id) values('SUPABASE',v_sujeto,v_usuario);
  end if;
  if not exists(select 1 from public.identity_usuarios where id=v_usuario and activo) then
    raise exception using errcode='42501',message='Usuario inactivo';
  end if;
  select jsonb_build_object('usuario',jsonb_build_object('id',u.id,'nombre',u.nombre,'email',u.email,'activo',u.activo),
    'membresias',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'usuarioId',m.usuario_id,
      'tenantId',m.tenant_id,'trabajadorId',m.trabajador_id,'activo',m.activo) order by m.tenant_id)
      from public.identity_membresias m join public.tenants t on t.id=m.tenant_id
      where m.usuario_id=u.id and m.activo and t.estado='ACTIVA'),'[]'::jsonb),
    'empresas',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'nombre',t.nombre,'codigo',t.codigo) order by t.nombre,t.id)
      from public.tenants t where public.iam_es_miembro(t.id)),'[]'::jsonb)) into v_resultado
  from public.identity_usuarios u where u.id=v_usuario;
  return v_resultado;
end $$;

-- Tablas Identity: solo lecturas acotadas por RLS. Las mutaciones se realizan
-- mediante RPC con permiso efectivo company.manage; no hay DML directo de UI.
do $$ declare tabla text; begin
  foreach tabla in array array['identity_usuarios','identity_identidades','identity_membresias',
    'identity_permisos','identity_roles','identity_rol_permisos','identity_membresia_roles'] loop
    execute format('alter table public.%I enable row level security',tabla);
    execute format('revoke all on public.%I from public,anon,authenticated',tabla);
    execute format('grant select on public.%I to authenticated',tabla);
  end loop;
end $$;
create policy identity_usuario_lectura on public.identity_usuarios for select to authenticated using (
  id=public.iam_usuario_actual() or exists(select 1 from public.identity_membresias m
    where m.usuario_id=identity_usuarios.id and public.iam_tiene_permiso(m.tenant_id,'company.manage'))
);
create policy identity_sujeto_lectura on public.identity_identidades for select to authenticated using(usuario_id=public.iam_usuario_actual());
create policy identity_membresia_lectura on public.identity_membresias for select to authenticated using (
  usuario_id=public.iam_usuario_actual() or public.iam_tiene_permiso(tenant_id,'company.manage')
);
create policy identity_permiso_catalogo on public.identity_permisos for select to authenticated using(auth.uid() is not null);
create policy identity_rol_lectura on public.identity_roles for select to authenticated using(public.iam_es_miembro(tenant_id));
create policy identity_rol_permiso_lectura on public.identity_rol_permisos for select to authenticated using(public.iam_es_miembro(tenant_id));
create policy identity_membresia_rol_lectura on public.identity_membresia_roles for select to authenticated using(public.iam_es_miembro(tenant_id));

create function public.iam_guardar_membresia(p_tenant_id uuid,p_usuario_id uuid,p_activo boolean,p_roles uuid[],p_trabajador_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  if p_activo is null or p_roles is null or array_position(p_roles,null) is not null then raise exception 'Membresía y roles inválidos'; end if;
  if exists(select 1 from unnest(p_roles) seleccion(rol_id) where not exists(
    select 1 from public.identity_roles r where r.id=seleccion.rol_id and r.tenant_id=p_tenant_id and r.activo)) then
    raise exception using errcode='42501',message='Rol no autorizado para esta empresa';
  end if;
  insert into public.identity_membresias(usuario_id,tenant_id,activo,trabajador_id)
    values(p_usuario_id,p_tenant_id,p_activo,p_trabajador_id)
    on conflict(usuario_id,tenant_id) do update set activo=excluded.activo,trabajador_id=excluded.trabajador_id returning id into v_id;
  delete from public.identity_membresia_roles where tenant_id=p_tenant_id and membresia_id=v_id;
  insert into public.identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select distinct p_tenant_id,v_id,id from unnest(p_roles) id;
  return jsonb_build_object('id',v_id,'usuarioId',p_usuario_id,'tenantId',p_tenant_id,'activo',p_activo,'trabajadorId',p_trabajador_id);
end $$;
create function public.iam_listar_equipo(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  return jsonb_build_object('miembros',coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'usuarioId',u.id,'nombre',u.nombre,'email',u.email,'activo',m.activo,'trabajadorId',m.trabajador_id,
    'roles',coalesce((select jsonb_agg(mr.rol_id) from public.identity_membresia_roles mr where mr.tenant_id=m.tenant_id and mr.membresia_id=m.id),'[]'::jsonb)))
    from public.identity_membresias m join public.identity_usuarios u on u.id=m.usuario_id where m.tenant_id=p_tenant_id),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(to_jsonb(r) order by r.codigo) from public.identity_roles r where r.tenant_id=p_tenant_id and r.activo),'[]'::jsonb));
end $$;
create function public.iam_obtener_empresa(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  return (select to_jsonb(t) from public.tenants t where t.id=p_tenant_id); end $$;
create function public.iam_guardar_empresa(p_tenant_id uuid,p_nombre text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_empresa jsonb;
begin perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  if nullif(btrim(p_nombre),'') is null then raise exception 'Nombre de empresa obligatorio'; end if;
  update public.tenants t set nombre=btrim(p_nombre) where id=p_tenant_id returning to_jsonb(t) into v_empresa;
  return v_empresa; end $$;

create function public.iam_listar_campanias(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_resolver_tenant_context(p_tenant_id);
  if not(public.iam_tiene_permiso(p_tenant_id,'harvest.view') or public.iam_tiene_permiso(p_tenant_id,'campaign.manage')
    or public.iam_tiene_permiso(p_tenant_id,'reports.view') or public.iam_tiene_permiso(p_tenant_id,'harvest.operate')) then
    raise exception using errcode='42501',message='Permiso de aplicación denegado'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.codigo) from public.campanias c where c.tenant_id=p_tenant_id),'[]'::jsonb);
end $$;
create function public.iam_guardar_campania(p_tenant_id uuid,p_id uuid,p_codigo text,p_nombre text,p_cultivo_id uuid,p_estado public.estado_campania)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_campania jsonb;
begin
  perform public.iam_exigir_permiso(p_tenant_id,'campaign.manage');
  if nullif(btrim(p_codigo),'') is null or nullif(btrim(p_nombre),'') is null or p_estado is null then raise exception 'Campaña inválida'; end if;
  if p_id is null then
    insert into public.campanias(tenant_id,codigo,nombre,cultivo_id,estado)
      values(p_tenant_id,btrim(p_codigo),btrim(p_nombre),p_cultivo_id,p_estado) returning to_jsonb(campanias) into v_campania;
  else
    update public.campanias c set codigo=btrim(p_codigo),nombre=btrim(p_nombre),cultivo_id=p_cultivo_id,estado=p_estado
      where c.id=p_id and c.tenant_id=p_tenant_id returning to_jsonb(c) into v_campania;
    if v_campania is null then raise exception using errcode='42501',message='Campaña de otra empresa'; end if;
  end if;
  return v_campania;
end $$;
create function public.iam_listar_trabajadores(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.iam_exigir_permiso(p_tenant_id,'workforce.manage');
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.dni) from public.trabajadores t where t.tenant_id=p_tenant_id),'[]'::jsonb); end $$;
create function public.iam_guardar_trabajador(p_tenant_id uuid,p_id uuid,p_dni varchar,p_nombres varchar,p_apellidos varchar,p_activo boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_trabajador jsonb;
begin perform public.iam_exigir_permiso(p_tenant_id,'workforce.manage');
  if p_dni !~ '^[0-9]{8}$' or p_dni is null or p_activo is null then raise exception 'Trabajador inválido'; end if;
  if p_id is null then
    insert into public.trabajadores(tenant_id,dni,nombres,apellidos,activo) values(p_tenant_id,p_dni,p_nombres,p_apellidos,p_activo)
      on conflict(tenant_id,dni) do update set nombres=excluded.nombres,apellidos=excluded.apellidos,activo=excluded.activo
      returning to_jsonb(trabajadores) into v_trabajador;
  else
    update public.trabajadores t set dni=p_dni,nombres=p_nombres,apellidos=p_apellidos,activo=p_activo
      where t.id=p_id and t.tenant_id=p_tenant_id returning to_jsonb(t) into v_trabajador;
    if v_trabajador is null then raise exception using errcode='42501',message='Trabajador de otra empresa'; end if;
  end if;
  return v_trabajador;
end $$;
create function public.iam_obtener_reporte(p_campania_id uuid,p_tipo text,p_periodo text default 'CAMPANIA')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.iam_exigir_campania(p_campania_id,'reports.view');
  case p_tipo
    when 'RESUMEN' then return public.harvest_proyectar_resumen(p_campania_id,'America/Lima');
    when 'DIARIA' then return public.harvest_proyectar_diaria(p_campania_id,'America/Lima');
    when 'LOTES' then return public.harvest_proyectar_lotes(p_campania_id);
    when 'RANKING' then return public.harvest_proyectar_ranking(p_campania_id,p_periodo);
    else raise exception 'Reporte desconocido';
  end case;
end $$;

-- Autores de cosecha autenticados sin identidad agrícola obligatoria. Se
-- conserva la atribución legacy existente; no se reescribe histórico ni cola.
alter table public.sesiones_lectura add column identity_usuario_id uuid references public.identity_usuarios(id);
alter table public.sesiones_lectura alter column iniciada_por_usuario_id drop not null;
alter table public.sesiones_lectura add constraint sesion_identidad_exclusiva check(identity_usuario_id is null or iniciada_por_usuario_id is null);
alter table public.operaciones_pda_campania add column identity_usuario_id uuid references public.identity_usuarios(id);
alter table public.operaciones_pda_campania alter column dni_operador drop not null;
alter table public.operaciones_pda_campania add constraint operacion_identidad_exclusiva check(identity_usuario_id is null or dni_operador is null);
alter table public.sesiones_lectura add constraint sesion_identity_tenant foreign key(identity_usuario_id,tenant_id)
  references public.identity_membresias(usuario_id,tenant_id);
alter table public.operaciones_pda_campania add constraint operacion_identity_tenant foreign key(identity_usuario_id,tenant_id)
  references public.identity_membresias(usuario_id,tenant_id);
do $$ declare tabla text; begin
  foreach tabla in array array['identity_membresias','identity_roles','identity_rol_permisos','identity_membresia_roles'] loop
    execute format('create trigger a_platform_propietario before insert or update on public.%I
      for each row execute function public.platform_heredar_tenant()',tabla);
  end loop;
end $$;

create function public.iam_fijar_operacion(p_id uuid,p_campania uuid,p_tipo text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid := public.iam_exigir_campania(p_campania,'harvest.operate'); v_anterior public.operaciones_pda_campania%rowtype;
begin
  if p_id is null then raise exception 'Falta ID de operación'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  insert into public.operaciones_pda_campania(id,campania_id,tipo,identity_usuario_id)
    values(p_id,p_campania,p_tipo,v_usuario) on conflict(id) do nothing;
  select * into v_anterior from public.operaciones_pda_campania where id=p_id for update;
  if v_anterior.campania_id is distinct from p_campania or v_anterior.tipo is distinct from p_tipo
    or v_anterior.identity_usuario_id is distinct from v_usuario then raise exception 'ID de operación reutilizado por otro actor o campaña'; end if;
  return v_usuario;
end $$;

create function public.iam_consultar_ticket(p_campania_id uuid,p_codigo text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_resultado jsonb;
begin
  perform public.iam_exigir_campania(p_campania_id,'harvest.view');
  select jsonb_build_object('lote',to_jsonb(l),'ticket',to_jsonb(t),'asignacion',to_jsonb(a),'registro',to_jsonb(r)) into v_resultado
  from public.harvest_tickets t join public.harvest_lotes_tickets l on l.id=t.lote_id
    left join public.harvest_asignaciones_lote a on a.lote_id=l.id
    left join public.harvest_registros_cosecha r on r.codigo_ticket=t.codigo
  where t.campania_id=p_campania_id and t.codigo=p_codigo;
  return v_resultado;
end $$;
create function public.iam_recursos_campania(p_campania_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_campania(p_campania_id,'harvest.view');
  return jsonb_build_object(
    'trabajadores',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'dni',t.dni,'nombre',concat_ws(' ',t.nombres,t.apellidos)))
      from public.trabajadores t where t.tenant_id=public.platform_tenant_campania(p_campania_id) and t.activo),'[]'::jsonb),
    'lotes',coalesce((select jsonb_agg(to_jsonb(l)) from public.lotes l where l.campania_id=p_campania_id and l.activo),'[]'::jsonb),
    'variedades',coalesce((select jsonb_agg(to_jsonb(lv)) from public.lote_variedades lv join public.lotes l on l.id=lv.lote_id
      where l.campania_id=p_campania_id and lv.activo),'[]'::jsonb),
    'jaberos',coalesce((select jsonb_agg(to_jsonb(r)) from public.trabajador_campania_rol r
      where r.campania_id=p_campania_id and r.activo and r.rol='JABERO'),'[]'::jsonb),
    'sesiones',coalesce((select jsonb_agg(to_jsonb(s)) from public.sesiones_lectura s join public.lotes l on l.id=s.lote_id
      where l.campania_id=p_campania_id),'[]'::jsonb));
end $$;
create function public.iam_activar_harvest(p_campania_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_corte public.harvest_cutovers%rowtype;
begin
  perform public.iam_exigir_campania(p_campania_id,'campaign.manage');
  perform 1 from public.campanias where id=p_campania_id for update;
  select * into v_corte from public.harvest_cutovers where campania_id=p_campania_id;
  if not found then
    insert into public.harvest_cutovers(campania_id,version,activado_en,activado_por)
      values(p_campania_id,1,clock_timestamp(),auth.uid()) returning * into v_corte;
  end if;
  return to_jsonb(v_corte);
end $$;

-- Harvest F5: mismos agregados, bloqueos, consumo único, recibos y frontera de
-- cutover. Estas rutas no llaman a validación de operador ni a login por DNI.
create function public.iam_asignar_lote(p_campania_id uuid,p_trabajador_id uuid,p_codigo text,p_operacion_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid := public.iam_fijar_operacion(p_operacion_id,p_campania_id,'ASIGNAR_TICKET');
  v_lote uuid; v_huella text; v_anterior public.operaciones_pda_procesadas%rowtype; v_resultado jsonb;
begin
  select lote_id into v_lote from public.harvest_tickets where codigo=p_codigo and campania_id=p_campania_id for share;
  if not found then raise exception 'harvest_ticket_no_encontrado'; end if;
  perform 1 from public.harvest_lotes_tickets where id=v_lote for update;
  if not exists(select 1 from public.campanias where id=p_campania_id and estado='ACTIVA') then raise exception 'Campaña no activa'; end if;
  if not exists(select 1 from public.trabajadores where id=p_trabajador_id and tenant_id=public.platform_tenant_campania(p_campania_id) and activo) then
    raise exception using errcode='42501',message='Trabajador de otra empresa o inactivo'; end if;
  v_huella := md5(jsonb_build_array(p_campania_id,v_usuario,p_trabajador_id,v_lote)::text);
  select * into v_anterior from public.operaciones_pda_procesadas where id=p_operacion_id;
  if found then
    if v_anterior.tipo<>'ASIGNAR_TICKET' or v_anterior.argumentos_md5<>v_huella then raise exception 'ID de operación reutilizado con otros datos'; end if;
  else
    if exists(select 1 from public.harvest_asignaciones_lote where lote_id=v_lote) then raise exception 'harvest_lote_ya_asignado'; end if;
    -- El rol COSECHADOR sigue siendo una atribución laboral de Workforce.
    insert into public.trabajador_campania_rol(trabajador_id,campania_id,rol,activo)
      values(p_trabajador_id,p_campania_id,'COSECHADOR',true)
      on conflict(trabajador_id,campania_id,rol) do update set activo=true;
    insert into public.harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id)
      values(v_lote,p_campania_id,p_trabajador_id,p_operacion_id);
    insert into public.operaciones_pda_procesadas(id,tipo,argumentos_md5,resultado)
      values(p_operacion_id,'ASIGNAR_TICKET',v_huella,jsonb_build_object('loteId',v_lote,'trabajadorId',p_trabajador_id,'usuarioId',v_usuario));
  end if;
  select jsonb_build_object('lote',to_jsonb(l),'ticket',to_jsonb(t),'asignacion',to_jsonb(a),'registro',to_jsonb(r)) into v_resultado
  from public.harvest_tickets t join public.harvest_lotes_tickets l on l.id=t.lote_id
    join public.harvest_asignaciones_lote a on a.lote_id=l.id
    left join public.harvest_registros_cosecha r on r.codigo_ticket=t.codigo
  where t.codigo=p_codigo and t.campania_id=p_campania_id and a.operacion_id=p_operacion_id;
  return v_resultado;
end $$;
create function public.iam_iniciar_sesion_lectura(p_campania_id uuid,p_lote_id uuid,p_variedad_id uuid,p_jabero_rol_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid := public.iam_exigir_campania(p_campania_id,'harvest.operate'); v_sesion public.sesiones_lectura%rowtype;
begin
  if not exists(select 1 from public.lotes where id=p_lote_id and campania_id=p_campania_id and activo) then raise exception 'Lote de otra campaña o inactivo'; end if;
  if not exists(select 1 from public.lote_variedades where lote_id=p_lote_id and variedad_id=p_variedad_id and activo) then raise exception 'Variedad no válida para el lote'; end if;
  perform public.workforce_validar_jabero_campania(p_jabero_rol_id,p_campania_id);
  perform 1 from public.trabajador_campania_rol where id=p_jabero_rol_id for update;
  select * into v_sesion from public.sesiones_lectura where id=p_id;
  if found then
    if v_sesion.identity_usuario_id is distinct from v_usuario or v_sesion.lote_id<>p_lote_id or v_sesion.variedad_id<>p_variedad_id
      or v_sesion.jabero_rol_id<>p_jabero_rol_id then raise exception 'ID de sesión reutilizado'; end if;
    return to_jsonb(v_sesion);
  end if;
  if exists(select 1 from public.sesiones_lectura where jabero_rol_id=p_jabero_rol_id and estado='ACTIVA') then raise exception 'El jabero ya tiene una sesión activa'; end if;
  insert into public.sesiones_lectura(id,lote_id,variedad_id,jabero_rol_id,identity_usuario_id)
    values(p_id,p_lote_id,p_variedad_id,p_jabero_rol_id,v_usuario) returning * into v_sesion;
  return to_jsonb(v_sesion);
end $$;
create function public.iam_cerrar_sesion_lectura(p_campania_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid := public.iam_exigir_campania(p_campania_id,'harvest.operate'); v_sesion jsonb;
begin
  update public.sesiones_lectura s set estado='CERRADA',fecha_fin=coalesce(fecha_fin,clock_timestamp())
  where s.id=p_id and s.identity_usuario_id=v_usuario and exists(select 1 from public.lotes where id=s.lote_id and campania_id=p_campania_id)
    returning to_jsonb(s) into v_sesion;
  if v_sesion is null then raise exception using errcode='42501',message='Sesión de otra cuenta o campaña'; end if;
  return v_sesion;
end $$;
create function public.iam_registrar_cosecha(p_campania_id uuid,p_sesion_id uuid,p_codigo text,p_id uuid,p_operacion_id uuid,p_fecha timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid := public.iam_fijar_operacion(p_operacion_id,p_campania_id,'REGISTRAR_JABA');
  v_ticket public.harvest_tickets%rowtype; v_asignacion public.harvest_asignaciones_lote%rowtype;
  v_huella text; v_anterior public.operaciones_pda_procesadas%rowtype; v_resultado jsonb; v_constraint text;
begin
  v_huella := md5(jsonb_build_array(p_campania_id,v_usuario,p_sesion_id,p_codigo)::text);
  select * into v_anterior from public.operaciones_pda_procesadas where id=p_operacion_id;
  if found then
    if v_anterior.tipo<>'REGISTRAR_JABA' or v_anterior.argumentos_md5<>v_huella then raise exception 'ID de operación reutilizado con otros datos'; end if;
    return v_anterior.resultado;
  end if;
  select * into v_ticket from public.harvest_tickets where codigo=p_codigo and campania_id=p_campania_id for update;
  if not found then raise exception 'harvest_ticket_no_encontrado'; end if;
  select * into v_asignacion from public.harvest_asignaciones_lote where lote_id=v_ticket.lote_id for share;
  if not found then raise exception 'harvest_lote_sin_asignar'; end if;
  if exists(select 1 from public.harvest_registros_cosecha where codigo_ticket=p_codigo) then raise exception 'harvest_ticket_ya_utilizado'; end if;
  perform 1 from public.sesiones_lectura s join public.lotes l on l.id=s.lote_id
    where s.id=p_sesion_id and l.campania_id=p_campania_id and s.identity_usuario_id=v_usuario and s.estado='ACTIVA' for share of s;
  if not found then raise exception 'harvest_sesion_invalida'; end if;
  perform public.workforce_validar_jabero_campania((select jabero_rol_id from public.sesiones_lectura where id=p_sesion_id),p_campania_id);
  begin
    insert into public.harvest_registros_cosecha(id,codigo_ticket,lote_id,campania_id,trabajador_id,asignacion_operacion_id,fecha_hora,sesion_id,operacion_id)
      values(p_id,p_codigo,v_ticket.lote_id,p_campania_id,v_asignacion.trabajador_id,v_asignacion.operacion_id,p_fecha,p_sesion_id,p_operacion_id);
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='harvest_registro_ticket_unico' then raise exception 'harvest_ticket_ya_utilizado'; end if;
    raise;
  end;
  select jsonb_build_object('lote',to_jsonb(l),'ticket',to_jsonb(t),'asignacion',to_jsonb(v_asignacion),'registro',to_jsonb(r)) into v_resultado
    from public.harvest_tickets t join public.harvest_lotes_tickets l on l.id=t.lote_id
    join public.harvest_registros_cosecha r on r.codigo_ticket=t.codigo where t.codigo=p_codigo;
  insert into public.operaciones_pda_procesadas(id,tipo,argumentos_md5,resultado) values(p_operacion_id,'REGISTRAR_JABA',v_huella,v_resultado);
  return v_resultado;
end $$;

-- Compatibilidad DNI: permitir al PDA anónimo, nunca usarla como downgrade de
-- una cuenta Identity autenticada. Los archivos Sheets conservan sus adapters.
create function public.iam_exigir_legacy_pda()
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.identity_identidades where proveedor='SUPABASE' and sujeto=auth.uid()) then
    raise exception using errcode='42501',message='Use el acceso de cuenta; DNI es compatibilidad provisional del PDA';
  end if;
end $$;
do $$ declare r record; original text; actualizado text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('validar_operador','validar_operador_campanias','autorizar_operador_campania') loop
    original:=pg_get_functiondef(r.oid);
    actualizado:=regexp_replace(original,'\mbegin\M','begin perform public.iam_exigir_legacy_pda();','i');
    execute actualizado;
  end loop;
end $$;

-- ACL explícitas: internos y mutaciones no son RPC públicos; los endpoints
-- requieren authenticated, y las lecturas RLS usan solo helpers sin efectos.
do $$ declare r record; firma text; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'iam_%' loop
    firma:=r.oid::regprocedure::text;
    execute format('revoke all on function %s from public,anon,authenticated',firma);
    if r.proname in ('iam_usuario_actual','iam_es_miembro','iam_tiene_permiso',
      'iam_obtener_identidad','iam_resolver_tenant_context','iam_guardar_membresia','iam_listar_equipo',
      'iam_obtener_empresa','iam_guardar_empresa','iam_listar_campanias','iam_guardar_campania',
      'iam_listar_trabajadores','iam_guardar_trabajador','iam_obtener_reporte',
      'iam_consultar_ticket','iam_recursos_campania','iam_activar_harvest',
      'iam_asignar_lote','iam_iniciar_sesion_lectura','iam_cerrar_sesion_lectura','iam_registrar_cosecha') then
      execute format('grant execute on function %s to authenticated',firma);
    end if;
  end loop;
end $$;
comment on table public.identity_usuarios is 'GesGROW F6.2: identidad y permisos v1';
end $identity_f62$;
notify pgrst,'reload schema';
commit;
