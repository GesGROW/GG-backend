create or replace function public.admin_guardar_rol_campania(
  p_rol_id uuid,
  p_trabajador_id uuid,
  p_campania_id uuid,
  p_rol public.rol_trabajador,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.trabajador_campania_rol%rowtype;
  v_trabajador public.trabajadores%rowtype;
  v_campania public.campanias%rowtype;
  v_accion text;
  v_es_nuevo boolean := false;
  v_reactivacion boolean := false;
  v_cambio_identidad boolean := false;
  v_trabajador_id_anterior uuid;
  v_acceso_app boolean := false;
begin
  perform public.autorizar_integracion_gestion_maestros();

  if p_trabajador_id is null then
    raise exception 'El trabajador es obligatorio';
  end if;
  if p_campania_id is null then
    raise exception 'La campaña es obligatoria';
  end if;
  if p_rol is null then
    raise exception 'El rol es obligatorio';
  end if;
  if p_activo is null then
    raise exception 'Activo es obligatorio';
  end if;

  select t.* into v_trabajador
  from public.trabajadores t
  where t.id = p_trabajador_id;
  if not found then
    raise exception 'El trabajador seleccionado no existe';
  end if;

  select c.* into v_campania
  from public.campanias c
  where c.id = p_campania_id;
  if not found then
    raise exception 'La campaña seleccionada no existe';
  end if;

  if p_rol_id is not null then
    select tcr.* into v_rol
    from public.trabajador_campania_rol tcr
    where tcr.id = p_rol_id;

    if not found then
      raise exception 'El rol de campaña indicado no existe';
    end if;

    v_trabajador_id_anterior := v_rol.trabajador_id;
    v_cambio_identidad :=
      v_rol.trabajador_id is distinct from p_trabajador_id
      or v_rol.campania_id is distinct from p_campania_id
      or v_rol.rol is distinct from p_rol;
    v_reactivacion := v_rol.activo is not true and p_activo is true;
  else
    select tcr.* into v_rol
    from public.trabajador_campania_rol tcr
    where tcr.trabajador_id = p_trabajador_id
      and tcr.campania_id = p_campania_id
      and tcr.rol = p_rol;

    if found then
      v_trabajador_id_anterior := v_rol.trabajador_id;
      v_reactivacion := v_rol.activo is not true and p_activo is true;
    else
      v_es_nuevo := true;
      v_trabajador_id_anterior := p_trabajador_id;
    end if;
  end if;

  if v_es_nuevo or v_reactivacion or v_cambio_identidad then
    if v_campania.estado::text <> 'ACTIVA' then
      raise exception 'La campaña seleccionada no está activa';
    end if;
    if v_trabajador.activo is not true then
      raise exception 'El trabajador seleccionado no está activo';
    end if;
  end if;

  if v_es_nuevo then
    begin
      insert into public.trabajador_campania_rol (
        trabajador_id,
        campania_id,
        rol,
        activo,
        registrado_por_usuario_id
      ) values (
        p_trabajador_id,
        p_campania_id,
        p_rol,
        p_activo,
        null
      )
      returning * into v_rol;
    exception
      when unique_violation then
        raise exception 'El trabajador ya tiene ese rol en la campaña seleccionada';
    end;
    v_accion := 'CREADO';
  else
    begin
      update public.trabajador_campania_rol
      set trabajador_id = p_trabajador_id,
          campania_id = p_campania_id,
          rol = p_rol,
          activo = p_activo
      where id = v_rol.id
      returning * into v_rol;
    exception
      when unique_violation then
        raise exception 'El trabajador ya tiene ese rol en la campaña seleccionada';
    end;
    v_accion := 'ACTUALIZADO';
  end if;

  if exists (
    select 1
    from public.trabajador_campania_rol tcr
    join public.campanias c on c.id = tcr.campania_id
    where tcr.trabajador_id = p_trabajador_id
      and tcr.activo = true
      and tcr.rol in (
        'JABERO'::public.rol_trabajador,
        'SUPERVISORA'::public.rol_trabajador
      )
      and c.estado::text = 'ACTIVA'
  ) then
    insert into public.usuarios_app (trabajador_id, activo)
    values (p_trabajador_id, true)
    on conflict (trabajador_id)
    do update set activo = true;
  else
    update public.usuarios_app
    set activo = false
    where trabajador_id = p_trabajador_id;
  end if;

  if v_trabajador_id_anterior is distinct from p_trabajador_id then
    if exists (
      select 1
      from public.trabajador_campania_rol tcr
      join public.campanias c on c.id = tcr.campania_id
      where tcr.trabajador_id = v_trabajador_id_anterior
        and tcr.activo = true
        and tcr.rol in (
          'JABERO'::public.rol_trabajador,
          'SUPERVISORA'::public.rol_trabajador
        )
        and c.estado::text = 'ACTIVA'
    ) then
      insert into public.usuarios_app (trabajador_id, activo)
      values (v_trabajador_id_anterior, true)
      on conflict (trabajador_id)
      do update set activo = true;
    else
      update public.usuarios_app
      set activo = false
      where trabajador_id = v_trabajador_id_anterior;
    end if;
  end if;

  select coalesce(ua.activo, false)
  into v_acceso_app
  from public.usuarios_app ua
  where ua.trabajador_id = p_trabajador_id;
  if not found then
    v_acceso_app := false;
  end if;

  select t.* into v_trabajador
  from public.trabajadores t
  where t.id = v_rol.trabajador_id;

  select c.* into v_campania
  from public.campanias c
  where c.id = v_rol.campania_id;

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'rol_campania', jsonb_build_object(
      'id', v_rol.id,
      'trabajador_id', v_rol.trabajador_id,
      'dni', v_trabajador.dni,
      'trabajador', btrim(concat_ws(' ', v_trabajador.nombres, v_trabajador.apellidos)),
      'campania_id', v_rol.campania_id,
      'campania_codigo', v_campania.codigo,
      'rol', v_rol.rol,
      'activo', v_rol.activo,
      'acceso_app', v_acceso_app
    )
  );
end;
$$;

create or replace function public.admin_listar_roles_campania()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tcr.id,
        'trabajador_id', tcr.trabajador_id,
        'dni', t.dni,
        'trabajador', btrim(concat_ws(' ', t.nombres, t.apellidos)),
        'campania_id', tcr.campania_id,
        'campania_codigo', c.codigo,
        'campania_estado', c.estado,
        'rol', tcr.rol,
        'activo', tcr.activo,
        'acceso_app', coalesce(ua.activo, false)
      )
      order by c.codigo asc, tcr.rol::text asc,
        btrim(concat_ws(' ', t.nombres, t.apellidos)) asc
    ),
    '[]'::jsonb
  )
  into v_roles
  from public.trabajador_campania_rol tcr
  join public.trabajadores t on t.id = tcr.trabajador_id
  join public.campanias c on c.id = tcr.campania_id
  left join public.usuarios_app ua on ua.trabajador_id = tcr.trabajador_id;

  return jsonb_build_object(
    'ok', true,
    'roles', v_roles
  );
end;
$$;

revoke all
on function public.admin_guardar_rol_campania(
  uuid,
  uuid,
  uuid,
  public.rol_trabajador,
  boolean
)
from public, anon, authenticated;

revoke all
on function public.admin_listar_roles_campania()
from public, anon, authenticated;

grant execute
on function public.admin_guardar_rol_campania(
  uuid,
  uuid,
  uuid,
  public.rol_trabajador,
  boolean
)
to authenticated;

grant execute
on function public.admin_listar_roles_campania()
to authenticated;

notify pgrst, 'reload schema';
