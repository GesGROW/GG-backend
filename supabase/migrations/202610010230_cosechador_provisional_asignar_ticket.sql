create or replace function public.obtener_o_registrar_cosechador_activo(
  p_dni_cosechador varchar
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dni varchar := btrim(coalesce(p_dni_cosechador, ''));
  v_campania public.campanias%rowtype;
  v_trabajador public.trabajadores%rowtype;
  v_rol public.trabajador_campania_rol%rowtype;
  v_nombre text;
begin
  if v_dni !~ '^[0-9]{8}$' then
    raise exception 'DNI de cosechador debe contener exactamente 8 dígitos';
  end if;

  select c.*
  into v_campania
  from public.campanias c
  where c.estado = 'ACTIVA'::public.estado_campania
  order by c.id
  limit 1;

  if not found then
    raise exception 'No existe una campaña activa';
  end if;

  if exists (
    select 1
    from public.campanias c
    where c.estado = 'ACTIVA'::public.estado_campania
      and c.id <> v_campania.id
  ) then
    raise exception 'Existe más de una campaña activa';
  end if;

  insert into public.trabajadores (dni, nombres, apellidos, activo)
  values (v_dni, '', '', true)
  on conflict (dni) do nothing;

  select t.*
  into v_trabajador
  from public.trabajadores t
  where t.dni = v_dni;

  if not found then
    raise exception 'No se pudo obtener el trabajador para el DNI indicado';
  end if;

  if v_trabajador.activo is not true then
    raise exception 'El trabajador está inactivo';
  end if;

  insert into public.trabajador_campania_rol (
    trabajador_id,
    campania_id,
    rol,
    activo,
    registrado_por_usuario_id
  ) values (
    v_trabajador.id,
    v_campania.id,
    'COSECHADOR'::public.rol_trabajador,
    true,
    null
  )
  on conflict (trabajador_id, campania_id, rol)
  do update set activo = true
  returning * into v_rol;

  v_nombre := btrim(concat_ws(' ', v_trabajador.nombres, v_trabajador.apellidos));
  if v_nombre = '' then
    v_nombre := 'DNI ' || v_dni;
  end if;

  return jsonb_build_object(
    'id', v_trabajador.id,
    'dni', v_trabajador.dni,
    'nombre', v_nombre,
    'rol_id', v_rol.id,
    'rol', v_rol.rol,
    'campania_id', v_campania.id,
    'campania', v_campania.nombre
  );
end;
$$;

revoke all
on function public.obtener_o_registrar_cosechador_activo(varchar)
from public, anon, authenticated;

create or replace function public.asignar_ticket(
  p_dni_operador varchar,
  p_dni_cosechador varchar,
  p_codigo_ticket varchar,
  p_operacion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_huella text := md5(jsonb_build_array(
    p_dni_operador,
    p_dni_cosechador,
    p_codigo_ticket
  )::text);
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_resultado jsonb;
begin
  if p_operacion_id is null then
    raise exception 'Falta el ID de operación';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operacion_id::text, 0));

  select *
  into v_anterior
  from public.operaciones_pda_procesadas
  where id = p_operacion_id;

  if found then
    if v_anterior.tipo <> 'ASIGNAR_TICKET'
       or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
    return v_anterior.resultado;
  end if;

  perform public.obtener_o_registrar_cosechador_activo(p_dni_cosechador);

  select to_jsonb(
    public.asignar_ticket(
      p_dni_operador,
      p_dni_cosechador,
      p_codigo_ticket
    )
  )
  into v_resultado;

  insert into public.operaciones_pda_procesadas (
    id,
    tipo,
    argumentos_md5,
    resultado
  ) values (
    p_operacion_id,
    'ASIGNAR_TICKET',
    v_huella,
    v_resultado
  );

  return v_resultado;
end;
$$;

revoke execute
on function public.asignar_ticket(varchar, varchar, varchar, uuid)
from public, anon, authenticated;

grant execute
on function public.asignar_ticket(varchar, varchar, varchar, uuid)
to anon;

notify pgrst, 'reload schema';
