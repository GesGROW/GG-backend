begin;
do $portal_f72$
begin
  if obj_description(to_regclass('public.identity_invitaciones'),'pg_class')=
    'GesGROW F7.2: administración de accesos v1' then return; end if;
  if to_regclass('public.platform_eventos_comerciales') is null then raise exception 'Aplique F6.4 antes de F7.2'; end if;

-- El nombre mostrado por una empresa no modifica el perfil global ni otras
-- membresías. El Usuario sigue siendo independiente de su Trabajador opcional.
alter table public.identity_membresias add column nombre_empresa text check(nombre_empresa is null or btrim(nombre_empresa)<>'');
create table public.identity_invitaciones (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  actor_usuario_id uuid not null,
  email text not null check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  nombre text not null check(btrim(nombre)<>''),
  roles uuid[] not null,
  trabajador_id uuid,
  estado text not null default 'PENDIENTE' check(estado in ('PENDIENTE','COMPLETADA')),
  created_at timestamptz not null default clock_timestamp(),
  completada_en timestamptz,
  usuario_id uuid references public.identity_usuarios(id),
  resultado jsonb,
  foreign key(actor_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id),
  foreign key(usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id),
  foreign key(tenant_id,trabajador_id) references public.trabajadores(tenant_id,id),
  check((estado='PENDIENTE' and resultado is null and usuario_id is null and completada_en is null)
    or (estado='COMPLETADA' and resultado is not null and usuario_id is not null and completada_en is not null))
);
create index identity_invitaciones_tenant on public.identity_invitaciones(tenant_id,created_at);
create trigger a_platform_propietario before insert or update on public.identity_invitaciones
  for each row execute function public.platform_heredar_tenant();

create function public.iam_admin_actor_valido(p_tenant uuid,p_usuario uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.identity_membresias m
    join public.identity_usuarios u on u.id=m.usuario_id and u.activo
    join public.tenants t on t.id=m.tenant_id and t.estado='ACTIVA'
    join public.identity_membresia_roles mr on mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
    join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
    join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id and rp.permiso='company.manage'
    where m.usuario_id=p_usuario and m.tenant_id=p_tenant and m.activo);
$$;
create function public.iam_admin_validar_roles(p_tenant uuid,p_roles uuid[])
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if p_roles is null or array_position(p_roles,null) is not null or exists(
    select 1 from unnest(p_roles) s(rol_id) where not exists(select 1 from public.identity_roles r
      where r.id=s.rol_id and r.tenant_id=p_tenant and r.activo
        and r.codigo in ('ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA'))) then
    raise exception using errcode='42501',message='Rol no permitido para esta empresa'; end if;
end $$;
create function public.iam_admin_permisos_miembro(p_tenant uuid,p_usuario uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(permiso order by permiso),'[]'::jsonb) from (
    select distinct rp.permiso from public.identity_membresias m
    join public.identity_usuarios u on u.id=m.usuario_id and u.activo
    join public.identity_membresia_roles mr on mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
    join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
    join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id
    where m.tenant_id=p_tenant and m.usuario_id=p_usuario and m.activo
  ) permisos;
$$;
create function public.iam_admin_dto_usuario(p_tenant uuid,p_usuario uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('usuarioId',u.id,'membresiaId',m.id,'tenantId',m.tenant_id,
    'nombre',coalesce(m.nombre_empresa,u.nombre),'nombreCuenta',u.nombre,'email',u.email,
    'activo',m.activo,'cuentaActiva',u.activo,'trabajadorId',m.trabajador_id,
    'trabajador',case when t.id is null then null else jsonb_build_object('id',t.id,'dni',t.dni,'nombre',concat_ws(' ',t.nombres,t.apellidos)) end,
    'roles',coalesce((select jsonb_agg(mr.rol_id order by mr.rol_id) from public.identity_membresia_roles mr
      where mr.tenant_id=m.tenant_id and mr.membresia_id=m.id),'[]'::jsonb),
    'permisos',public.iam_admin_permisos_miembro(m.tenant_id,u.id))
  from public.identity_membresias m join public.identity_usuarios u on u.id=m.usuario_id
  left join public.trabajadores t on t.id=m.trabajador_id and t.tenant_id=m.tenant_id
  where m.tenant_id=p_tenant and u.id=p_usuario;
$$;
create function public.iam_admin_listar_usuarios(p_tenant_id uuid,p_busqueda text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_busqueda text:=lower(btrim(coalesce(p_busqueda,'')));
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  if p_offset is null or p_offset<0 then raise exception 'Paginación inválida'; end if;
  return jsonb_build_object('usuarios',coalesce((select jsonb_agg(dto) from (
    select public.iam_admin_dto_usuario(p_tenant_id,u.id) dto from public.identity_membresias m
    join public.identity_usuarios u on u.id=m.usuario_id where m.tenant_id=p_tenant_id
    and position(v_busqueda in lower(concat_ws(' ',coalesce(m.nombre_empresa,u.nombre),u.email)))>0
    order by coalesce(m.nombre_empresa,u.nombre),u.id limit 50 offset p_offset
  ) filas),'[]'::jsonb),'total',(select count(*) from public.identity_membresias m
    join public.identity_usuarios u on u.id=m.usuario_id where m.tenant_id=p_tenant_id
    and position(v_busqueda in lower(concat_ws(' ',coalesce(m.nombre_empresa,u.nombre),u.email)))>0));
end $$;
create function public.iam_admin_obtener_usuario(p_tenant_id uuid,p_usuario_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_dto jsonb;
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  v_dto:=public.iam_admin_dto_usuario(p_tenant_id,p_usuario_id);
  if v_dto is null then raise exception using errcode='42501',message='Usuario no pertenece a la empresa'; end if;
  return v_dto;
end $$;
create function public.iam_admin_catalogo_accesos(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  return jsonb_build_object('roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'codigo',r.codigo,
    'permisos',coalesce((select jsonb_agg(rp.permiso order by rp.permiso) from public.identity_rol_permisos rp
      where rp.tenant_id=r.tenant_id and rp.rol_id=r.id),'[]'::jsonb)) order by r.codigo)
    from public.identity_roles r where r.tenant_id=p_tenant_id and r.activo
      and r.codigo in ('ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA')),'[]'::jsonb),
    'trabajadores',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'dni',t.dni,
      'nombre',concat_ws(' ',t.nombres,t.apellidos),'activo',t.activo) order by t.dni)
      from public.trabajadores t where t.tenant_id=p_tenant_id),'[]'::jsonb));
end $$;
create function public.iam_admin_guardar_membresia(p_tenant_id uuid,p_usuario_id uuid,p_activo boolean,p_roles uuid[],
  p_trabajador_id uuid default null,p_nombre text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  perform public.iam_admin_validar_roles(p_tenant_id,p_roles);
  perform 1 from public.identity_membresias where tenant_id=p_tenant_id and usuario_id=p_usuario_id for update;
  if not found then raise exception using errcode='42501',message='Usuario no pertenece a la empresa'; end if;
  if p_nombre is not null and nullif(btrim(p_nombre),'') is null then raise exception 'Nombre inválido'; end if;
  perform public.iam_guardar_membresia(p_tenant_id,p_usuario_id,p_activo,p_roles,p_trabajador_id);
  update public.identity_membresias set nombre_empresa=nullif(btrim(p_nombre),'')
    where tenant_id=p_tenant_id and usuario_id=p_usuario_id;
  return public.iam_admin_dto_usuario(p_tenant_id,p_usuario_id);
end $$;

-- Intento idempotente antes de invocar al proveedor. No entrega secretos ni
-- descubre identidades globales al navegador; sólo el backend puede completarlo.
create function public.iam_preparar_invitacion(p_id uuid,p_tenant_id uuid,p_email text,p_nombre text,p_roles uuid[],p_trabajador_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.iam_exigir_permiso(p_tenant_id,'company.manage'); i public.identity_invitaciones%rowtype;
  v_email text:=lower(btrim(p_email)); v_roles uuid[];
begin
  if p_id is null or p_email is null or p_nombre is null or nullif(btrim(p_nombre),'') is null then raise exception 'Invitación incompleta'; end if;
  perform public.iam_admin_validar_roles(p_tenant_id,p_roles);
  select coalesce(array_agg(distinct id order by id),array[]::uuid[]) into v_roles from unnest(p_roles) id;
  perform pg_advisory_xact_lock(hashtextextended('identity.invite:'||p_id::text,0));
  select * into i from public.identity_invitaciones where id=p_id;
  if found then
    if i.tenant_id<>p_tenant_id or i.actor_usuario_id<>v_actor or i.email<>v_email or i.nombre<>btrim(p_nombre)
      or i.roles<>v_roles or i.trabajador_id is distinct from p_trabajador_id then raise exception 'ID de invitación reutilizado'; end if;
  else
    insert into public.identity_invitaciones(id,tenant_id,actor_usuario_id,email,nombre,roles,trabajador_id)
      values(p_id,p_tenant_id,v_actor,v_email,btrim(p_nombre),v_roles,p_trabajador_id) returning * into i;
  end if;
  return jsonb_build_object('id',i.id,'estado',i.estado,'resultado',i.resultado);
end $$;
create function public.iam_listar_invitaciones(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'nombre',i.nombre,
    'estado',i.estado,'createdAt',i.created_at,'usuarioId',i.usuario_id,'roles',i.roles,
    'trabajadorId',i.trabajador_id) order by i.created_at desc)
    from public.identity_invitaciones i where i.tenant_id=p_tenant_id),'[]'::jsonb);
end $$;
create function public.iam_destinatario_invitacion(p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.identity_invitaciones%rowtype; v_sujeto uuid;
begin
  select * into strict i from public.identity_invitaciones where id=p_id;
  if not public.iam_admin_actor_valido(i.tenant_id,i.actor_usuario_id) then
    raise exception using errcode='42501',message='Autorización del administrador revocada'; end if;
  -- auth.users es infraestructura de proveedor, nunca una tabla de un BC.
  select id into v_sujeto from auth.users where lower(email)=i.email;
  return jsonb_build_object('id',i.id,'email',i.email,'nombre',i.nombre,'sujeto',v_sujeto,'estado',i.estado,'resultado',i.resultado);
end $$;
create function public.iam_completar_invitacion(p_id uuid,p_sujeto uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.identity_invitaciones%rowtype; v_usuario uuid; v_membresia uuid; v_resultado jsonb;
begin
  select * into strict i from public.identity_invitaciones where id=p_id for update;
  if not public.iam_admin_actor_valido(i.tenant_id,i.actor_usuario_id) then
    raise exception using errcode='42501',message='Autorización del administrador revocada'; end if;
  if not exists(select 1 from auth.users where id=p_sujeto and lower(email)=i.email) then
    raise exception using errcode='42501',message='Identidad del proveedor incompatible con la invitación'; end if;
  if i.estado='COMPLETADA' then return i.resultado; end if;
  perform public.iam_admin_validar_roles(i.tenant_id,i.roles);
  perform pg_advisory_xact_lock(hashtextextended('identity:'||p_sujeto::text,0));
  select usuario_id into v_usuario from public.identity_identidades where proveedor='SUPABASE' and sujeto=p_sujeto;
  if v_usuario is null then
    insert into public.identity_usuarios(nombre,email) values(i.nombre,i.email) returning id into v_usuario;
    insert into public.identity_identidades(proveedor,sujeto,usuario_id) values('SUPABASE',p_sujeto,v_usuario);
  elsif not exists(select 1 from public.identity_usuarios where id=v_usuario and activo) then
    raise exception using errcode='42501',message='Cuenta inactiva; no se puede reactivar desde otra empresa';
  end if;
  -- No sobrescribir roles/estado de una membresía ya existente al reaprovisionar.
  select id into v_membresia from public.identity_membresias where tenant_id=i.tenant_id and usuario_id=v_usuario;
  if v_membresia is null then
    insert into public.identity_membresias(usuario_id,tenant_id,trabajador_id,nombre_empresa)
      values(v_usuario,i.tenant_id,i.trabajador_id,i.nombre) returning id into v_membresia;
    insert into public.identity_membresia_roles(tenant_id,membresia_id,rol_id)
      select i.tenant_id,v_membresia,id from unnest(i.roles) id;
  end if;
  v_resultado:=jsonb_build_object('usuarioId',v_usuario,'membresiaId',v_membresia,'tenantId',i.tenant_id);
  update public.identity_invitaciones set estado='COMPLETADA',usuario_id=v_usuario,completada_en=clock_timestamp(),resultado=v_resultado where id=i.id;
  return v_resultado;
end $$;
alter table public.identity_invitaciones enable row level security;
revoke all on public.identity_invitaciones from public,anon,authenticated;
grant select on public.identity_invitaciones to authenticated;
create policy identity_invitaciones_lectura on public.identity_invitaciones for select to authenticated
  using(public.iam_tiene_permiso(tenant_id,'company.manage'));
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'iam_admin_%' or p.proname in
      ('iam_preparar_invitacion','iam_listar_invitaciones','iam_destinatario_invitacion','iam_completar_invitacion')) loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
  end loop;
end $$;
grant execute on function public.iam_admin_listar_usuarios(uuid,text,integer),public.iam_admin_obtener_usuario(uuid,uuid),
  public.iam_admin_catalogo_accesos(uuid),public.iam_admin_guardar_membresia(uuid,uuid,boolean,uuid[],uuid,text),
  public.iam_preparar_invitacion(uuid,uuid,text,text,uuid[],uuid),public.iam_listar_invitaciones(uuid) to authenticated;
if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on public.identity_invitaciones from service_role;
  grant execute on function public.iam_destinatario_invitacion(uuid),public.iam_completar_invitacion(uuid,uuid) to service_role;
end if;
comment on table public.identity_invitaciones is 'GesGROW F7.2: administración de accesos v1';
end $portal_f72$;
notify pgrst,'reload schema';
commit;
