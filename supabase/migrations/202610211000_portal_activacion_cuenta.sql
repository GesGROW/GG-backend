begin;

alter table public.identity_invitaciones
  add column if not exists tipo_entrega text check (tipo_entrega in ('ACTIVACION','ACCESO')),
  add column if not exists correo_enviado_en timestamptz;

-- Sólo el servidor decide el tipo de correo y conserva esa decisión al reintentar.
create or replace function public.iam_preparar_entrega_invitacion(p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.identity_invitaciones%rowtype;
begin
  select * into strict i from public.identity_invitaciones where id=p_id for update;
  if not public.iam_admin_actor_valido(i.tenant_id,i.actor_usuario_id) then
    raise exception using errcode='42501',message='Autorización del administrador revocada';
  end if;
  if i.tipo_entrega is null then
    update public.identity_invitaciones set tipo_entrega=case
      when exists(select 1 from auth.users where lower(email)=i.email) then 'ACCESO'
      else 'ACTIVACION' end where id=p_id returning * into i;
  end if;
  return jsonb_build_object('tipo',i.tipo_entrega,'enviada',i.correo_enviado_en is not null);
end $$;

create or replace function public.iam_confirmar_entrega_invitacion(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  update public.identity_invitaciones set correo_enviado_en=coalesce(correo_enviado_en,clock_timestamp())
    where id=p_id and estado='COMPLETADA' and tipo_entrega is not null;
  if not found then raise exception 'La invitación todavía no ha sido completada'; end if;
end $$;

-- El receptor sólo puede consultar una invitación propia ya provisionada y vigente.
-- El UUID del enlace selecciona la invitación; la identidad verificada autoriza.
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
    'requiereActivacion',exists(select 1 from auth.users u where u.id=auth.uid()
      and u.invited_at is not null and coalesce(u.encrypted_password,'')=''),
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

revoke all on function public.iam_preparar_entrega_invitacion(uuid),
  public.iam_confirmar_entrega_invitacion(uuid),public.iam_obtener_activacion_cuenta(uuid)
  from public,anon,authenticated;
grant execute on function public.iam_obtener_activacion_cuenta(uuid) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.iam_preparar_entrega_invitacion(uuid),
      public.iam_confirmar_entrega_invitacion(uuid) to service_role;
    revoke all on function public.iam_obtener_activacion_cuenta(uuid) from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
