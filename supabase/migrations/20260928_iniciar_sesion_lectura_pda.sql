drop function if exists public.iniciar_sesion_lectura(
  varchar,
  varchar,
  uuid
);

create or replace function public.iniciar_sesion_lectura(
  p_dni_operador varchar,
  p_dni_jabero varchar,
  p_lote_id uuid,
  p_sesion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;

  v_campania_id uuid;
  v_campania_nombre varchar(100);

  v_lote_codigo varchar(30);
  v_lote_nombre varchar(100);
  v_variedad_nombre varchar(100);

  v_jabero_rol_id uuid;
  v_jabero_nombre text;
begin

  -- ----------------------------------------------------------
  -- Si esta misma sesión ya llegó antes, devolverla.
  -- Esto permite reintentos sin duplicarla.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from sesiones_lectura
    where id = p_sesion_id
  ) then

    select
      concat_ws(' ', t.nombres, t.apellidos),
      l.codigo,
      l.nombre,
      v.nombre,
      c.nombre
    into
      v_jabero_nombre,
      v_lote_codigo,
      v_lote_nombre,
      v_variedad_nombre,
      v_campania_nombre
    from sesiones_lectura sl
    join trabajador_campania_rol tcr
      on tcr.id = sl.jabero_rol_id
    join trabajadores t
      on t.id = tcr.trabajador_id
    join lotes l
      on l.id = sl.lote_id
    join variedades v
      on v.id = l.variedad_id
    join campanias c
      on c.id = l.campania_id
    where sl.id = p_sesion_id;

    return jsonb_build_object(
      'ok', true,
      'sesion_id', p_sesion_id,
      'jabero', v_jabero_nombre,
      'lote_codigo', v_lote_codigo,
      'lote_nombre', v_lote_nombre,
      'variedad', v_variedad_nombre,
      'campania', v_campania_nombre
    );

  end if;


  -- ----------------------------------------------------------
  -- OPERADOR
  -- ----------------------------------------------------------

  select ua.id
  into v_usuario_id
  from usuarios_app ua
  join trabajadores t
    on t.id = ua.trabajador_id
  where t.dni = btrim(p_dni_operador)
    and t.activo = true
    and ua.activo = true;

  if v_usuario_id is null then
    raise exception
      'Usuario no autorizado para utilizar la aplicación';
  end if;


  -- ----------------------------------------------------------
  -- LOTE / CAMPAÑA / VARIEDAD
  -- ----------------------------------------------------------

  select
    l.campania_id,
    c.nombre,
    l.codigo,
    l.nombre,
    v.nombre
  into
    v_campania_id,
    v_campania_nombre,
    v_lote_codigo,
    v_lote_nombre,
    v_variedad_nombre
  from lotes l
  join campanias c
    on c.id = l.campania_id
  join variedades v
    on v.id = l.variedad_id
  where l.id = p_lote_id
    and l.activo = true
    and v.activo = true
    and c.estado = 'ACTIVA';

  if v_campania_id is null then
    raise exception
      'El lote no existe o no pertenece a una campaña activa';
  end if;


  -- ----------------------------------------------------------
  -- JABERO
  -- ----------------------------------------------------------

  select
    tcr.id,
    concat_ws(' ', t.nombres, t.apellidos)
  into
    v_jabero_rol_id,
    v_jabero_nombre
  from trabajador_campania_rol tcr
  join trabajadores t
    on t.id = tcr.trabajador_id
  where t.dni = btrim(p_dni_jabero)
    and t.activo = true
    and tcr.activo = true
    and tcr.rol = 'JABERO'
    and tcr.campania_id = v_campania_id;

  if v_jabero_rol_id is null then
    raise exception
      'El trabajador no está registrado como jabero en la campaña del lote';
  end if;


  if exists (
    select 1
    from sesiones_lectura
    where jabero_rol_id = v_jabero_rol_id
      and estado = 'ACTIVA'
  ) then
    raise exception
      'El jabero ya tiene una sesión de lectura activa';
  end if;


  -- ----------------------------------------------------------
  -- CREAR USANDO EL UUID GENERADO EN EL PDA
  -- ----------------------------------------------------------

  insert into sesiones_lectura (
    id,
    lote_id,
    jabero_rol_id,
    iniciada_por_usuario_id
  )
  values (
    p_sesion_id,
    p_lote_id,
    v_jabero_rol_id,
    v_usuario_id
  );


  return jsonb_build_object(
    'ok', true,
    'sesion_id', p_sesion_id,
    'jabero', v_jabero_nombre,
    'lote_codigo', v_lote_codigo,
    'lote_nombre', v_lote_nombre,
    'variedad', v_variedad_nombre,
    'campania', v_campania_nombre
  );

end;
$$;


revoke execute
on function public.iniciar_sesion_lectura(
  varchar,
  varchar,
  uuid,
  uuid
)
from public, anon, authenticated;


grant execute
on function public.iniciar_sesion_lectura(
  varchar,
  varchar,
  uuid,
  uuid
)
to anon;
