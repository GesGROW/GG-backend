begin;

-- Una contraseña interna del proveedor no prueba que el invitado haya elegido
-- sus credenciales. La activación se confirma explícitamente por el receptor.
alter table public.identity_usuarios
  add column if not exists dni text check (dni is null or dni ~ '^[0-9]{8}$'),
  add column if not exists activacion_completada_en timestamptz;
create unique index if not exists identity_usuarios_dni on public.identity_usuarios(dni) where dni is not null;

create or replace function public.iam_obtener_activacion_cuenta(p_invitacion_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare i public.identity_invitaciones%rowtype; v_usuario uuid; v_empresa text;
begin
  select u.id into v_usuario from public.identity_identidades d
    join public.identity_usuarios u on u.id=d.usuario_id and u.activo
    where d.proveedor='SUPABASE' and d.sujeto=auth.uid();
  select inv.* into i from public.identity_invitaciones inv
    join public.identity_membresias m on m.usuario_id=inv.usuario_id and m.tenant_id=inv.tenant_id and m.activo
    join public.tenants t on t.id=m.tenant_id and t.estado='ACTIVA'
    where inv.usuario_id=v_usuario and inv.estado='COMPLETADA'
      and (p_invitacion_id is null or inv.id=p_invitacion_id)
    order by inv.completada_en desc,inv.id limit 1;
  if not found then raise exception using errcode='42501',message='La invitación no está disponible para esta cuenta'; end if;
  select nombre into v_empresa from public.tenants where id=i.tenant_id;
  return jsonb_build_object('tenantId',i.tenant_id,'empresa',v_empresa,
    'invitacionId',i.id,
    'requiereActivacion',exists(select 1 from public.identity_usuarios u where u.id=v_usuario
      and u.activacion_completada_en is null and i.tipo_entrega='ACTIVACION'),
    'roles',coalesce((select jsonb_agg(r.codigo order by r.codigo) from public.identity_roles r
      join public.identity_membresia_roles mr on mr.rol_id=r.id and mr.tenant_id=r.tenant_id
      join public.identity_membresias m on m.id=mr.membresia_id and m.tenant_id=mr.tenant_id
      where m.usuario_id=v_usuario and m.tenant_id=i.tenant_id and r.activo and r.id=any(i.roles)),'[]'::jsonb),
    'modulos',coalesce((select jsonb_agg(codigo order by codigo) from (select distinct pm.codigo
      from public.platform_modulos pm where public.platform_modulo_habilitado(i.tenant_id,pm.codigo)
      and exists(select 1 from public.identity_membresia_roles mr
        join public.identity_membresias m on m.id=mr.membresia_id and m.tenant_id=mr.tenant_id
        join public.identity_roles r on r.id=mr.rol_id and r.tenant_id=mr.tenant_id and r.activo
        join public.identity_rol_permisos rp on rp.rol_id=r.id and rp.tenant_id=r.tenant_id
        where m.usuario_id=v_usuario and m.tenant_id=i.tenant_id and r.id=any(i.roles)
          and (rp.permiso='company.manage' or
            (pm.codigo='HARVEST' and (rp.permiso like 'harvest.%' or rp.permiso='reports.view')) or
            (pm.codigo='CAMPAIGN' and rp.permiso like 'campaign.%') or
            (pm.codigo='WORKFORCE' and rp.permiso like 'workforce.%') or
            (pm.codigo='FARM_STRUCTURE' and rp.permiso like 'farm.%')))) modulos),'[]'::jsonb));
end $$;


-- Recupera el alta incompleta incluso si el enlace ya se consumió o se recargó
-- Home. Una invitación de ACCESO nunca obliga a cambiar una cuenta existente.
create or replace function public.iam_obtener_activacion_pendiente()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Sesión autenticada requerida'; end if;
  select i.id into v_id from public.identity_invitaciones i
    join public.identity_usuarios u on u.id=i.usuario_id and u.activo and u.activacion_completada_en is null
    join public.identity_identidades d on d.usuario_id=u.id and d.proveedor='SUPABASE' and d.sujeto=auth.uid()
    join public.identity_membresias m on m.usuario_id=u.id and m.tenant_id=i.tenant_id and m.activo
    join public.tenants t on t.id=i.tenant_id and t.estado='ACTIVA'
    where i.estado='COMPLETADA' and i.tipo_entrega='ACTIVACION'
    order by i.completada_en desc,i.id limit 1;
  if v_id is null then return null; end if;
  return public.iam_obtener_activacion_cuenta(v_id);
end $$;

-- No recibe actor, empresa, trabajador, roles ni permisos del navegador. Tampoco
-- crea vínculos laborales o acceso operativo a partir de un DNI declarado.
create or replace function public.iam_completar_activacion_cuenta(p_invitacion_id uuid,p_dni text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_datos jsonb; v_usuario uuid; v_dni text:=btrim(p_dni); v_guardado text; v_completa timestamptz;
begin
  v_datos:=public.iam_obtener_activacion_cuenta(p_invitacion_id);
  v_usuario:=public.iam_usuario_actual();
  if v_dni is null or v_dni !~ '^[0-9]{8}$' then raise exception 'Ingresa un DNI de 8 dígitos'; end if;
  select dni,activacion_completada_en into v_guardado,v_completa from public.identity_usuarios where id=v_usuario for update;
  if v_completa is not null then
    if v_guardado is distinct from v_dni then raise exception 'La cuenta ya está activada con otros datos'; end if;
    return public.iam_aceptar_invitacion(p_invitacion_id);
  end if;
  if not (v_datos->>'requiereActivacion')::boolean then
    raise exception using errcode='42501',message='La cuenta existente no necesita activación'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and coalesce(encrypted_password,'')<>'') then
    raise exception 'Establece tu contraseña antes de activar la cuenta'; end if;
  if exists(select 1 from public.identity_usuarios where dni=v_dni and id<>v_usuario) then
    raise exception 'No se pudo registrar ese DNI. Revisa tus datos o contacta con el administrador'; end if;
  update public.identity_usuarios set dni=v_dni,activacion_completada_en=clock_timestamp() where id=v_usuario;
  -- Revalida permisos del invitante, módulo y aceptación en la misma transacción.
  return public.iam_aceptar_invitacion(p_invitacion_id);
exception when unique_violation then
  raise exception 'No se pudo registrar ese DNI. Revisa tus datos o contacta con el administrador';
end $$;

revoke all on function public.iam_obtener_activacion_cuenta(uuid),
  public.iam_obtener_activacion_pendiente(),public.iam_completar_activacion_cuenta(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.iam_obtener_activacion_cuenta(uuid),
  public.iam_obtener_activacion_pendiente(),public.iam_completar_activacion_cuenta(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
