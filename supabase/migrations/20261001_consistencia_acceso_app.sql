create or replace function public.recalcular_acceso_app_trabajador(
  p_trabajador_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_trabajador_activo boolean;
  v_debe_tener_acceso boolean := false;
begin
  if p_trabajador_id is null then
    raise exception 'El trabajador es obligatorio para recalcular el acceso a la app';
  end if;

  select t.activo
  into v_trabajador_activo
  from public.trabajadores t
  where t.id = p_trabajador_id;

  if not found then
    raise exception 'El trabajador indicado no existe';
  end if;

  if v_trabajador_activo is true then
    select exists (
      select 1
      from public.trabajador_campania_rol tcr
      join public.campanias c on c.id = tcr.campania_id
      where tcr.trabajador_id = p_trabajador_id
        and tcr.activo = true
        and tcr.rol in (
          'JABERO'::public.rol_trabajador,
          'SUPERVISORA'::public.rol_trabajador
        )
        and c.estado = 'ACTIVA'::public.estado_campania
    )
    into v_debe_tener_acceso;
  end if;

  if v_debe_tener_acceso then
    insert into public.usuarios_app (trabajador_id, activo)
    values (p_trabajador_id, true)
    on conflict (trabajador_id)
    do update set activo = true;
  else
    update public.usuarios_app
    set activo = false
    where trabajador_id = p_trabajador_id;
  end if;
end;
$$;

create or replace function public.recalcular_accesos_app_campania(
  p_campania_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_trabajador_id uuid;
begin
  if p_campania_id is null then
    raise exception 'La campaña es obligatoria para recalcular accesos';
  end if;

  if not exists (
    select 1
    from public.campanias c
    where c.id = p_campania_id
  ) then
    raise exception 'La campaña indicada no existe';
  end if;

  for v_trabajador_id in
    select distinct tcr.trabajador_id
    from public.trabajador_campania_rol tcr
    where tcr.campania_id = p_campania_id
      and tcr.rol in (
        'JABERO'::public.rol_trabajador,
        'SUPERVISORA'::public.rol_trabajador
      )
  loop
    perform public.recalcular_acceso_app_trabajador(v_trabajador_id);
  end loop;
end;
$$;

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
set search_path = pg_catalog, public
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

  perform public.recalcular_acceso_app_trabajador(p_trabajador_id);

  if v_trabajador_id_anterior is distinct from p_trabajador_id then
    perform public.recalcular_acceso_app_trabajador(v_trabajador_id_anterior);
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

create or replace function public.admin_guardar_campania(
  p_campania_id uuid,
  p_codigo varchar,
  p_nombre varchar,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_estado public.estado_campania
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_codigo varchar;
  v_nombre varchar;
  v_campania public.campanias%rowtype;
  v_accion text;
  v_estado_anterior public.estado_campania;
  v_estado_cambio boolean := false;
begin
  perform public.autorizar_integracion_gestion_maestros();

  v_codigo := btrim(coalesce(p_codigo, ''));
  v_nombre := btrim(coalesce(p_nombre, ''));

  if v_codigo = '' then
    raise exception 'El código de campaña es obligatorio';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre de campaña es obligatorio';
  end if;

  if p_fecha_inicio is null then
    raise exception 'La fecha de inicio es obligatoria';
  end if;

  if p_fecha_fin is not null and p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if p_estado is null then
    raise exception 'El estado de campaña es obligatorio';
  end if;

  if p_campania_id is not null then
    select c.*
    into v_campania
    from public.campanias c
    where c.id = p_campania_id;

    if not found then
      raise exception 'La campaña indicada no existe';
    end if;

    v_estado_anterior := v_campania.estado;

    if exists (
      select 1
      from public.campanias c
      where c.codigo = v_codigo
        and c.id <> p_campania_id
    ) then
      raise exception 'El código de campaña ya pertenece a otra campaña';
    end if;

    if p_estado = 'ACTIVA'::public.estado_campania
       and exists (
         select 1
         from public.campanias c
         where c.estado = 'ACTIVA'::public.estado_campania
           and c.id <> p_campania_id
       ) then
      raise exception 'Ya existe otra campaña activa';
    end if;

    begin
      update public.campanias
      set codigo = v_codigo,
          nombre = v_nombre,
          fecha_inicio = p_fecha_inicio,
          fecha_fin = p_fecha_fin,
          estado = p_estado
      where id = p_campania_id
      returning * into v_campania;
    exception
      when unique_violation then
        if p_estado = 'ACTIVA'::public.estado_campania then
          raise exception 'Ya existe otra campaña activa';
        end if;
        raise exception 'El código de campaña ya pertenece a otra campaña';
    end;

    v_estado_cambio := v_estado_anterior is distinct from v_campania.estado;
    v_accion := 'ACTUALIZADO';
  else
    select c.*
    into v_campania
    from public.campanias c
    where c.codigo = v_codigo;

    if found then
      v_estado_anterior := v_campania.estado;

      if p_estado = 'ACTIVA'::public.estado_campania
         and exists (
           select 1
           from public.campanias c
           where c.estado = 'ACTIVA'::public.estado_campania
             and c.id <> v_campania.id
         ) then
        raise exception 'Ya existe otra campaña activa';
      end if;

      begin
        update public.campanias
        set nombre = v_nombre,
            fecha_inicio = p_fecha_inicio,
            fecha_fin = p_fecha_fin,
            estado = p_estado
        where id = v_campania.id
        returning * into v_campania;
      exception
        when unique_violation then
          if p_estado = 'ACTIVA'::public.estado_campania then
            raise exception 'Ya existe otra campaña activa';
          end if;
          raise exception 'El código de campaña ya pertenece a otra campaña';
      end;

      v_estado_cambio := v_estado_anterior is distinct from v_campania.estado;
      v_accion := 'ACTUALIZADO';
    else
      if p_estado = 'ACTIVA'::public.estado_campania
         and exists (
           select 1
           from public.campanias c
           where c.estado = 'ACTIVA'::public.estado_campania
         ) then
        raise exception 'Ya existe otra campaña activa';
      end if;

      begin
        insert into public.campanias (
          codigo,
          nombre,
          fecha_inicio,
          fecha_fin,
          estado
        ) values (
          v_codigo,
          v_nombre,
          p_fecha_inicio,
          p_fecha_fin,
          p_estado
        )
        returning * into v_campania;
      exception
        when unique_violation then
          if p_estado = 'ACTIVA'::public.estado_campania
             and exists (
               select 1
               from public.campanias c
               where c.estado = 'ACTIVA'::public.estado_campania
             ) then
            raise exception 'Ya existe otra campaña activa';
          end if;
          raise exception 'El código de campaña ya pertenece a otra campaña';
      end;

      v_accion := 'CREADO';
    end if;
  end if;

  if v_estado_cambio then
    perform public.recalcular_accesos_app_campania(v_campania.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'campania', jsonb_build_object(
      'id', v_campania.id,
      'codigo', v_campania.codigo,
      'nombre', v_campania.nombre,
      'fecha_inicio', v_campania.fecha_inicio,
      'fecha_fin', v_campania.fecha_fin,
      'estado', v_campania.estado
    )
  );
end;
$$;

create or replace function public.admin_guardar_trabajador(
  p_trabajador_id uuid,
  p_dni varchar,
  p_nombres varchar,
  p_apellidos varchar,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dni varchar;
  v_nombres varchar;
  v_apellidos varchar;
  v_trabajador public.trabajadores%rowtype;
  v_accion text;
begin
  perform public.autorizar_integracion_gestion_maestros();

  v_dni := btrim(coalesce(p_dni, ''));
  v_nombres := btrim(coalesce(p_nombres, ''));
  v_apellidos := btrim(coalesce(p_apellidos, ''));

  if v_dni !~ '^[0-9]{8}$' then
    raise exception 'DNI debe contener exactamente 8 dígitos';
  end if;

  if v_nombres = '' then
    raise exception 'Los nombres son obligatorios';
  end if;

  if v_apellidos = '' then
    raise exception 'Los apellidos son obligatorios';
  end if;

  if p_activo is null then
    raise exception 'Activo es obligatorio';
  end if;

  if p_trabajador_id is not null then
    select t.*
    into v_trabajador
    from public.trabajadores t
    where t.id = p_trabajador_id;

    if not found then
      raise exception 'El trabajador indicado no existe';
    end if;

    if exists (
      select 1
      from public.trabajadores t
      where t.dni = v_dni
        and t.id <> p_trabajador_id
    ) then
      raise exception 'El DNI ya pertenece a otro trabajador';
    end if;

    update public.trabajadores
    set dni = v_dni,
        nombres = v_nombres,
        apellidos = v_apellidos,
        activo = p_activo,
        updated_at = now()
    where id = p_trabajador_id
    returning * into v_trabajador;

    v_accion := 'ACTUALIZADO';
  else
    select t.*
    into v_trabajador
    from public.trabajadores t
    where t.dni = v_dni;

    if found then
      update public.trabajadores
      set nombres = v_nombres,
          apellidos = v_apellidos,
          activo = p_activo,
          updated_at = now()
      where id = v_trabajador.id
      returning * into v_trabajador;

      v_accion := 'ACTUALIZADO';
    else
      begin
        insert into public.trabajadores (
          dni,
          nombres,
          apellidos,
          activo
        ) values (
          v_dni,
          v_nombres,
          v_apellidos,
          p_activo
        )
        returning * into v_trabajador;

        v_accion := 'CREADO';
      exception
        when unique_violation then
          raise exception 'El DNI ya pertenece a otro trabajador';
      end;
    end if;
  end if;

  perform public.recalcular_acceso_app_trabajador(v_trabajador.id);

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'trabajador', jsonb_build_object(
      'id', v_trabajador.id,
      'dni', v_trabajador.dni,
      'nombres', v_trabajador.nombres,
      'apellidos', v_trabajador.apellidos,
      'activo', v_trabajador.activo
    )
  );
end;
$$;

revoke all
on function public.recalcular_acceso_app_trabajador(uuid)
from public, anon, authenticated;

revoke all
on function public.recalcular_accesos_app_campania(uuid)
from public, anon, authenticated;

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
on function public.admin_guardar_campania(
  uuid,
  varchar,
  varchar,
  date,
  date,
  public.estado_campania
)
from public, anon, authenticated;

revoke all
on function public.admin_guardar_trabajador(uuid, varchar, varchar, varchar, boolean)
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
on function public.admin_guardar_campania(
  uuid,
  varchar,
  varchar,
  date,
  date,
  public.estado_campania
)
to authenticated;

grant execute
on function public.admin_guardar_trabajador(uuid, varchar, varchar, varchar, boolean)
to authenticated;

notify pgrst, 'reload schema';
