begin;

alter table public.identity_invitaciones add column if not exists aceptada_en timestamptz;

-- El supervisor pertenece a Cosecha, sin administración de la organización.
create or replace function public.iam_sembrar_roles(p_tenant uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.identity_roles(tenant_id,codigo)
    select p_tenant,codigo from unnest(array['ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA','SUPERVISOR_COSECHA']) codigo
    on conflict(tenant_id,codigo) do nothing;
  insert into public.identity_rol_permisos(tenant_id,rol_id,permiso)
    select p_tenant,r.id,p.codigo from public.identity_roles r cross join public.identity_permisos p
    where r.tenant_id=p_tenant and (
      (r.codigo='ADMIN_EMPRESA' and p.codigo in ('company.manage','reports.view'))
      or (r.codigo='GESTOR' and p.codigo in ('campaign.manage','workforce.manage','harvest.view','reports.view'))
      or (r.codigo='OPERADOR_CAMPO' and p.codigo in ('harvest.operate','harvest.view'))
      or (r.codigo='CONSULTA' and p.codigo in ('harvest.view','reports.view'))
      or (r.codigo='SUPERVISOR_COSECHA' and p.codigo in ('harvest.view','harvest.manage','harvest.operate','reports.view'))
    ) on conflict do nothing;
end $$;
do $$ begin perform public.iam_sembrar_roles(id) from public.tenants; end $$;

create or replace function public.iam_admin_validar_roles(p_tenant uuid,p_roles uuid[])
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if p_roles is null or array_position(p_roles,null) is not null or exists(
    select 1 from unnest(p_roles) s(rol_id) where not exists(select 1 from public.identity_roles r
      where r.id=s.rol_id and r.tenant_id=p_tenant and r.activo
        and r.codigo in ('ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA','SUPERVISOR_COSECHA'))) then
    raise exception using errcode='42501',message='Rol no permitido para esta empresa'; end if;
  if exists(select 1 from public.identity_roles where tenant_id=p_tenant and id=any(p_roles)
    and codigo='SUPERVISOR_COSECHA') and not public.platform_modulo_habilitado(p_tenant,'HARVEST') then
    raise exception using errcode='42501',message='Cosecha no está habilitado para esta empresa'; end if;
end $$;

create or replace function public.iam_admin_accesos_cosecha(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_habilitado boolean; v_rol uuid; v_filas jsonb;
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  v_habilitado:=public.platform_modulo_habilitado(p_tenant_id,'HARVEST');
  select id into v_rol from public.identity_roles where tenant_id=p_tenant_id and codigo='SUPERVISOR_COSECHA' and activo;
  select coalesce(jsonb_agg(fila order by nombre,email),'[]'::jsonb) into v_filas from (
    select coalesce(m.nombre_empresa,u.nombre) nombre,coalesce(u.email,i.email) email,
      jsonb_build_object('id',m.id,'usuarioId',u.id,'nombre',coalesce(m.nombre_empresa,u.nombre),'email',coalesce(u.email,i.email),
        'rol',rol.codigo,'estado',case when not m.activo or not u.activo then 'INACTIVO'
          when i.id is not null and i.aceptada_en is null then 'PENDIENTE' else 'ACEPTADA' end) fila
    from public.identity_membresias m join public.identity_usuarios u on u.id=m.usuario_id
    join lateral (
      select r.codigo from public.identity_membresia_roles mr
        join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
      where mr.tenant_id=m.tenant_id and mr.membresia_id=m.id and r.codigo<>'ADMIN_EMPRESA'
        and exists(select 1 from public.identity_rol_permisos rp where rp.tenant_id=r.tenant_id and rp.rol_id=r.id
          and (rp.permiso like 'harvest.%' or rp.permiso='reports.view'))
      order by (r.codigo='SUPERVISOR_COSECHA') desc,r.codigo limit 1
    ) rol on true
    left join lateral (
      select inv.id,inv.aceptada_en,inv.email from public.identity_invitaciones inv
      where inv.tenant_id=m.tenant_id and inv.usuario_id=m.usuario_id
        and exists(select 1 from public.identity_roles r where r.tenant_id=inv.tenant_id and r.id=any(inv.roles) and r.codigo<>'ADMIN_EMPRESA'
          and exists(select 1 from public.identity_rol_permisos rp where rp.tenant_id=r.tenant_id and rp.rol_id=r.id and (rp.permiso like 'harvest.%' or rp.permiso='reports.view')))
      order by inv.created_at desc,inv.id limit 1
    ) i on true
    where m.tenant_id=p_tenant_id
    union all
    select inv.nombre,inv.email,jsonb_build_object('id',inv.id,'usuarioId',null,'nombre',inv.nombre,'email',inv.email,
      'rol','SUPERVISOR_COSECHA','estado','PENDIENTE')
    from public.identity_invitaciones inv where inv.tenant_id=p_tenant_id and v_rol=any(inv.roles)
      and not exists(select 1 from public.identity_membresias m
        join public.identity_membresia_roles mr on mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
        join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo and r.codigo<>'ADMIN_EMPRESA'
        where m.tenant_id=inv.tenant_id and m.usuario_id=inv.usuario_id
          and exists(select 1 from public.identity_rol_permisos rp where rp.tenant_id=r.tenant_id and rp.rol_id=r.id
            and (rp.permiso like 'harvest.%' or rp.permiso='reports.view')))
      and not exists(select 1 from public.identity_invitaciones newer where newer.tenant_id=inv.tenant_id and newer.email=inv.email
        and v_rol=any(newer.roles) and (newer.created_at,newer.id)>(inv.created_at,inv.id))
  ) filas;
  return jsonb_build_object('modulo','HARVEST','habilitado',v_habilitado,'rolSupervisorId',v_rol,'usuarios',v_filas);
end $$;

-- El editor administrativo existente también reconoce los roles asignados.
create or replace function public.iam_admin_catalogo_accesos(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant_id,'company.manage');
  return jsonb_build_object('roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'codigo',r.codigo,
    'permisos',coalesce((select jsonb_agg(rp.permiso order by rp.permiso) from public.identity_rol_permisos rp
      where rp.tenant_id=r.tenant_id and rp.rol_id=r.id),'[]'::jsonb)) order by r.codigo)
    from public.identity_roles r where r.tenant_id=p_tenant_id and r.activo
      and r.codigo in ('ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA','SUPERVISOR_COSECHA')),'[]'::jsonb),
    'trabajadores',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'dni',t.dni,
      'nombre',concat_ws(' ',t.nombres,t.apellidos),'activo',t.activo) order by t.dni)
      from public.trabajadores t where t.tenant_id=p_tenant_id),'[]'::jsonb));
end $$;

-- La aceptación se registra sólo para el receptor autenticado, nunca al enviar
-- el correo ni por una acción del owner. Nuevas cuentas deben definir contraseña.
create or replace function public.iam_aceptar_invitacion(p_invitacion_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_datos jsonb; v_usuario uuid; v_id uuid; i public.identity_invitaciones%rowtype;
begin
  v_datos:=public.iam_obtener_activacion_cuenta(p_invitacion_id);
  if (v_datos->>'requiereActivacion')::boolean then
    raise exception using errcode='42501',message='Activa tu cuenta antes de aceptar la invitación'; end if;
  v_usuario:=public.iam_usuario_actual();
  select id into v_id from public.identity_invitaciones
    where usuario_id=v_usuario and tenant_id=(v_datos->>'tenantId')::uuid and estado='COMPLETADA'
      and (p_invitacion_id is null or id=p_invitacion_id)
    order by completada_en desc,id limit 1 for update;
  if v_id is null then raise exception using errcode='42501',message='Invitación no disponible'; end if;
  select * into strict i from public.identity_invitaciones where id=v_id;
  if exists(select 1 from public.identity_roles r where r.tenant_id=i.tenant_id and r.id=any(i.roles) and r.codigo='SUPERVISOR_COSECHA') then
    if not public.iam_admin_actor_valido(i.tenant_id,i.actor_usuario_id) then
      raise exception using errcode='42501',message='Autorización del administrador revocada'; end if;
    perform public.iam_admin_validar_roles(i.tenant_id,i.roles);
    -- Una cuenta ya vinculada a la empresa incorpora el nuevo rol sin perder
    -- los que tenía. El owner no puede aceptar ni concederlo por el receptor.
    insert into public.identity_membresia_roles(tenant_id,membresia_id,rol_id)
      select i.tenant_id,m.id,r.id from public.identity_membresias m join public.identity_roles r on r.tenant_id=m.tenant_id
      where m.tenant_id=i.tenant_id and m.usuario_id=v_usuario and m.activo and r.activo
        and r.id=any(i.roles) and r.codigo='SUPERVISOR_COSECHA'
      on conflict do nothing;
  end if;
  update public.identity_invitaciones set aceptada_en=coalesce(aceptada_en,clock_timestamp()) where id=v_id;
  return jsonb_build_object('estado','ACEPTADA','tenantId',v_datos->>'tenantId');
end $$;

revoke all on function public.iam_admin_accesos_cosecha(uuid),public.iam_aceptar_invitacion(uuid) from public,anon,authenticated;
grant execute on function public.iam_admin_accesos_cosecha(uuid),public.iam_aceptar_invitacion(uuid) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on function public.iam_admin_accesos_cosecha(uuid),public.iam_aceptar_invitacion(uuid) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
