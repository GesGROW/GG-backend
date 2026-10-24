begin;

-- El vínculo lo confirma el propio receptor al aceptar; no permite elegir otro
-- trabajador ni alterar roles, nombre o estado de personal ya registrado.
create or replace function public.iam_vincular_dni_supervisor(p_tenant uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid:=public.iam_usuario_actual(); v_dni text; v_nombre text; v_trabajador uuid; v_asignado uuid; v_activo boolean;
begin
  select dni,nombre into v_dni,v_nombre from public.identity_usuarios where id=v_usuario;
  if v_dni is null or not public.iam_tiene_permiso(p_tenant,'harvest.manage')
    or not public.iam_tiene_permiso(p_tenant,'harvest.operate') then return; end if;
  perform public.platform_exigir_modulo(p_tenant,'HARVEST');
  perform pg_advisory_xact_lock(hashtextextended('identity.worker:'||p_tenant::text||':'||v_dni,0));
  select trabajador_id into v_asignado from public.identity_membresias
    where usuario_id=v_usuario and tenant_id=p_tenant and activo for update;
  if not found then raise exception using errcode='42501',message='Membresía activa requerida'; end if;
  select id,activo into v_trabajador,v_activo from public.trabajadores where tenant_id=p_tenant and dni=v_dni for update;
  if v_trabajador is null then
    insert into public.trabajadores(tenant_id,dni,nombres,apellidos,activo)
      values(p_tenant,v_dni,left(v_nombre,100),'',true) returning id into v_trabajador;
  elsif not v_activo then raise exception 'El trabajador está inactivo. Contacta con el administrador'; end if;
  if v_asignado is not null and v_asignado<>v_trabajador then
    raise exception 'La cuenta ya está vinculada a otro trabajador'; end if;
  if exists(select 1 from public.identity_membresias where tenant_id=p_tenant
    and trabajador_id=v_trabajador and usuario_id<>v_usuario) then
    raise exception 'No se pudo vincular el DNI. Contacta con el administrador'; end if;
  update public.identity_membresias set trabajador_id=v_trabajador where usuario_id=v_usuario and tenant_id=p_tenant;
  if exists(select 1 from public.usuarios_app where tenant_id=p_tenant and trabajador_id=v_trabajador and not activo) then
    raise exception 'El acceso al PWA está inactivo. Contacta con el administrador'; end if;
  insert into public.usuarios_app(tenant_id,trabajador_id,activo) values(p_tenant,v_trabajador,true)
    on conflict(trabajador_id) do nothing;
end $$;

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
  perform public.iam_vincular_dni_supervisor(i.tenant_id);
  update public.identity_invitaciones set aceptada_en=coalesce(aceptada_en,clock_timestamp()) where id=v_id;
  return jsonb_build_object('estado','ACEPTADA','tenantId',v_datos->>'tenantId');
end $$;


-- Proyección del acceso del supervisor hacia el contrato existente del PWA.
-- No se materializan roles laborales: una revocación de cuenta, membresía,
-- permisos, módulo o participación surte efecto en el siguiente RPC online.
-- NULL identifica a un operador legacy; un portal sin campañas devuelve [].
create or replace function public.iam_operador_pwa_campanias(p_dni varchar)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_usuario uuid; v_nombre text; v_tenant uuid; v_campanias jsonb;
begin
  select u.id,u.nombre,m.tenant_id into v_usuario,v_nombre,v_tenant from public.identity_usuarios u
    join public.identity_membresias m on m.usuario_id=u.id
    join public.trabajadores t on t.id=m.trabajador_id and t.tenant_id=m.tenant_id
    where t.dni=btrim(p_dni) order by m.tenant_id limit 1;
  if v_usuario is null then return null; end if;
  select coalesce(jsonb_agg(fila order by fila->>'cultivo_nombre',fila->>'codigo'),'[]'::jsonb) into v_campanias from (
    select jsonb_build_object('tenant_id',c.tenant_id,'id',c.id,'codigo',c.codigo,'nombre',c.nombre,
      'cultivo_id',cu.id,'cultivo_nombre',cu.nombre,'roles',jsonb_build_array('SUPERVISORA')) fila
    from public.campanias c join public.cultivos cu on cu.id=c.cultivo_id and cu.activo
    join public.tenants e on e.id=c.tenant_id and e.estado='ACTIVA'
    join public.identity_membresias m on m.tenant_id=c.tenant_id and m.usuario_id=v_usuario and m.activo
    join public.identity_usuarios u on u.id=m.usuario_id and u.activo
    join public.trabajadores t on t.id=m.trabajador_id and t.tenant_id=m.tenant_id and t.activo and t.dni=btrim(p_dni) and (u.dni is null or u.dni=t.dni)
    join public.usuarios_app a on a.tenant_id=t.tenant_id and a.trabajador_id=t.id and a.activo
    join public.harvest_cultivo_supervisores s on s.tenant_id=c.tenant_id and s.cultivo_id=c.cultivo_id and s.usuario_id=u.id
    where c.estado='ACTIVA' and public.platform_modulo_habilitado(c.tenant_id,'HARVEST')
      and not exists(select 1 from public.identity_invitaciones i where i.usuario_id=u.id
        and i.estado='COMPLETADA' and i.tipo_entrega='ACTIVACION' and u.activacion_completada_en is null)
      and exists(select 1 from public.identity_membresia_roles mr
        join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
        join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id
        where mr.tenant_id=m.tenant_id and mr.membresia_id=m.id and rp.permiso='harvest.manage')
      and exists(select 1 from public.identity_membresia_roles mr
        join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
        join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id
        where mr.tenant_id=m.tenant_id and mr.membresia_id=m.id and rp.permiso='harvest.operate')
  ) opciones;
  return jsonb_build_object('tenant_id',v_tenant,'dni',btrim(p_dni),'nombre',v_nombre,
    'campanias',v_campanias,'autorizado_para_fecha',(clock_timestamp() at time zone 'America/Lima')::date);
end $$;

-- Conservar íntegros los contratos legacy instalados, incluyendo ownership,
-- contexto transaccional y bloqueo de mezcla con sesiones de cuenta.
do $preservar$
declare v_def text;
begin
  if to_regprocedure('public.iam_legacy_pwa_validar_operador(varchar)') is null then
    v_def:=pg_get_functiondef('public.validar_operador_campanias(varchar)'::regprocedure);
    execute replace(v_def,'FUNCTION public.validar_operador_campanias(', 'FUNCTION public.iam_legacy_pwa_validar_operador(');
  end if;
  if to_regprocedure('public.iam_legacy_pwa_autorizar_operador(varchar,uuid)') is null then
    v_def:=pg_get_functiondef('public.autorizar_operador_campania(varchar,uuid)'::regprocedure);
    execute replace(v_def,'FUNCTION public.autorizar_operador_campania(', 'FUNCTION public.iam_legacy_pwa_autorizar_operador(');
  end if;
end $preservar$;

create or replace function public.autorizar_operador_campania(p_dni varchar,p_campania_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_datos jsonb;
begin
  perform public.iam_exigir_legacy_pda();
  v_datos:=public.iam_operador_pwa_campanias(p_dni);
  if v_datos is not null then
    if exists(select 1 from jsonb_array_elements(v_datos->'campanias') c where (c->>'id')::uuid=p_campania_id) then return; end if;
    raise exception 'El operador no está autorizado para esta campaña en el día de hoy';
  end if;
  perform public.iam_legacy_pwa_autorizar_operador(p_dni,p_campania_id);
end $$;

create or replace function public.validar_operador_campanias(p_dni varchar)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_operador jsonb;
begin
  perform public.iam_exigir_legacy_pda();
  v_operador:=public.iam_operador_pwa_campanias(p_dni);
  if v_operador is not null then
    if jsonb_array_length(v_operador->'campanias')=0 then
      raise exception 'No tiene campañas activas asignadas para el día de hoy'; end if;
    return v_operador;
  end if;
  return public.iam_legacy_pwa_validar_operador(p_dni);
end $$;

revoke all on function public.iam_legacy_pwa_validar_operador(varchar),public.iam_legacy_pwa_autorizar_operador(varchar,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.iam_vincular_dni_supervisor(uuid),public.iam_operador_pwa_campanias(varchar)
  from public,anon,authenticated,service_role;
revoke all on function public.autorizar_operador_campania(varchar,uuid),public.validar_operador_campanias(varchar)
  from public,anon,authenticated,service_role;
grant execute on function public.validar_operador_campanias(varchar) to anon;
notify pgrst,'reload schema';
commit;
