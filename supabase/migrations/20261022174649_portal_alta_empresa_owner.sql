begin;

do $preflight$ begin
  if to_regprocedure('public.iam_obtener_identidad()') is null
    or to_regprocedure('public.iam_sembrar_roles(uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='identity_membresias' and column_name='nombre_empresa') then
    raise exception 'Complete Identity y 202610211200_usuarios_accesos_modulo.sql antes del alta de empresa';
  end if;
end $preflight$;

-- Recibo privado: una sola alta inicial por usuario, incluso con solicitudes
-- simultáneas o reintentos cuya primera respuesta se perdió en la red.
create table public.identity_altas_empresas (
  operacion_id uuid primary key,
  usuario_id uuid not null unique references public.identity_usuarios(id),
  tenant_id uuid not null unique references public.tenants(id),
  membresia_id uuid not null,
  nombre_empresa text not null,
  nombre_owner text not null,
  creada_en timestamptz not null default clock_timestamp(),
  foreign key(tenant_id,membresia_id) references public.identity_membresias(tenant_id,id)
);
alter table public.identity_altas_empresas enable row level security;
revoke all on public.identity_altas_empresas from public,anon,authenticated;

create function public.iam_crear_empresa_inicial(
  p_operacion_id uuid,p_nombre_empresa text,p_nombre_owner text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_sujeto uuid:=auth.uid(); v_usuario uuid; v_email text; v_confirmada timestamptz;
  v_invitada timestamptz; v_tenant uuid:=gen_random_uuid(); v_membresia uuid; v_rol uuid;
  v_empresa text:=btrim(p_nombre_empresa); v_nombre text:=btrim(p_nombre_owner);
  v_previa public.identity_altas_empresas%rowtype;
begin
  if v_sujeto is null then raise exception using errcode='42501',message='Sesión autenticada requerida'; end if;
  select email,email_confirmed_at,invited_at into v_email,v_confirmada,v_invitada
    from auth.users where id=v_sujeto for share;
  if not found or v_confirmada is null or nullif(btrim(v_email),'') is null then
    raise exception using errcode='42501',message='Confirme su correo antes de crear una empresa'; end if;
  if v_invitada is not null then
    raise exception using errcode='42501',message='Su cuenta fue invitada. Actualice su acceso o contacte a quien le invitó'; end if;
  if p_operacion_id is null or v_empresa is null or length(v_empresa) not between 1 and 120
    or v_nombre is null or length(v_nombre) not between 1 and 120 then
    raise exception 'Indique la empresa y su nombre, de hasta 120 caracteres, y un ID de operación'; end if;

  -- Comparte el lock de provisionamiento de Identity; el actor procede siempre
  -- de auth.uid(), nunca de metadatos editables ni de un usuario/tenant enviado.
  v_usuario:=(public.iam_obtener_identidad()->'usuario'->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('identity.alta:'||p_operacion_id::text,0));
  select * into v_previa from public.identity_altas_empresas where operacion_id=p_operacion_id;
  if found then
    if v_previa.usuario_id<>v_usuario or v_previa.nombre_empresa<>v_empresa or v_previa.nombre_owner<>v_nombre then
      raise exception 'ID de operación reutilizado con otro usuario o datos'; end if;
    perform public.iam_exigir_permiso(v_previa.tenant_id,'company.manage');
    return jsonb_build_object('tenantId',v_previa.tenant_id,'usuarioId',v_usuario,'membresiaId',v_previa.membresia_id);
  end if;
  -- Incluye membresías inactivas: revocar acceso nunca habilita un alta nueva.
  if exists(select 1 from public.identity_membresias where usuario_id=v_usuario)
    or exists(select 1 from public.identity_altas_empresas where usuario_id=v_usuario) then
    raise exception 'Su cuenta ya está vinculada a una empresa. Actualice su acceso o contacte al administrador'; end if;

  insert into public.tenants(id,nombre,codigo) values(v_tenant,v_empresa,'EMP-'||upper(replace(v_tenant::text,'-','')));
  perform public.iam_sembrar_roles(v_tenant);
  select id into strict v_rol from public.identity_roles where tenant_id=v_tenant and codigo='ADMIN_EMPRESA' and activo;
  -- Fallar de forma atómica si una plantilla antigua otorga operación al owner.
  if (select array_agg(permiso order by permiso) from public.identity_rol_permisos
    where tenant_id=v_tenant and rol_id=v_rol) is distinct from array['company.manage','reports.view']::text[] then
    raise exception 'Actualice la plantilla de permisos del owner antes de crear una empresa'; end if;
  update public.identity_usuarios set nombre=v_nombre,email=lower(btrim(v_email)) where id=v_usuario;
  insert into public.identity_membresias(tenant_id,usuario_id,nombre_empresa)
    values(v_tenant,v_usuario,v_nombre) returning id into v_membresia;
  insert into public.identity_membresia_roles(tenant_id,membresia_id,rol_id) values(v_tenant,v_membresia,v_rol);
  insert into public.identity_altas_empresas(operacion_id,usuario_id,tenant_id,membresia_id,nombre_empresa,nombre_owner)
    values(p_operacion_id,v_usuario,v_tenant,v_membresia,v_empresa,v_nombre);
  return jsonb_build_object('tenantId',v_tenant,'usuarioId',v_usuario,'membresiaId',v_membresia);
end $$;
revoke all on function public.iam_crear_empresa_inicial(uuid,text,text) from public,anon,authenticated;
grant execute on function public.iam_crear_empresa_inicial(uuid,text,text) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on public.identity_altas_empresas from service_role;
    revoke all on function public.iam_crear_empresa_inicial(uuid,text,text) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
