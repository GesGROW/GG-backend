create or replace function public.admin_guardar_variedad(
  p_variedad_id uuid,
  p_nombre varchar,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre varchar;
  v_variedad public.variedades%rowtype;
  v_accion text;
begin
  perform public.autorizar_integracion_gestion_maestros();

  v_nombre := btrim(coalesce(p_nombre, ''));

  if v_nombre = '' then
    raise exception 'El nombre de la variedad es obligatorio';
  end if;

  if p_activo is null then
    raise exception 'Activo es obligatorio';
  end if;

  if p_variedad_id is not null then
    select v.*
    into v_variedad
    from public.variedades v
    where v.id = p_variedad_id;

    if not found then
      raise exception 'La variedad indicada no existe';
    end if;

    if exists (
      select 1
      from public.variedades v
      where v.nombre = v_nombre
        and v.id <> p_variedad_id
    ) then
      raise exception 'Ya existe otra variedad con ese nombre';
    end if;

    begin
      update public.variedades
      set nombre = v_nombre,
          activo = p_activo
      where id = p_variedad_id
      returning * into v_variedad;
    exception
      when unique_violation then
        raise exception 'Ya existe otra variedad con ese nombre';
    end;

    v_accion := 'ACTUALIZADO';
  else
    select v.*
    into v_variedad
    from public.variedades v
    where v.nombre = v_nombre;

    if found then
      update public.variedades
      set activo = p_activo
      where id = v_variedad.id
      returning * into v_variedad;

      v_accion := 'ACTUALIZADO';
    else
      begin
        insert into public.variedades (
          nombre,
          activo
        ) values (
          v_nombre,
          p_activo
        )
        returning * into v_variedad;
      exception
        when unique_violation then
          raise exception 'Ya existe otra variedad con ese nombre';
      end;

      v_accion := 'CREADO';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'variedad', jsonb_build_object(
      'id', v_variedad.id,
      'nombre', v_variedad.nombre,
      'activo', v_variedad.activo
    )
  );
end;
$$;

create or replace function public.admin_listar_variedades()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variedades jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'nombre', v.nombre,
        'activo', v.activo
      )
      order by v.nombre asc
    ),
    '[]'::jsonb
  )
  into v_variedades
  from public.variedades v;

  return jsonb_build_object(
    'ok', true,
    'variedades', v_variedades
  );
end;
$$;

revoke all
on function public.admin_guardar_variedad(uuid, varchar, boolean)
from public, anon, authenticated;

revoke all
on function public.admin_listar_variedades()
from public, anon, authenticated;

grant execute
on function public.admin_guardar_variedad(uuid, varchar, boolean)
to authenticated;

grant execute
on function public.admin_listar_variedades()
to authenticated;

notify pgrst, 'reload schema';
