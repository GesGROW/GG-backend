-- La producción se agrupa por lote y por la variedad persistida en la sesión.
begin;

create or replace function public.obtener_produccion_lotes(
  p_dni_operador varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_campania_id uuid;
  v_campania_nombre text;
  v_produccion jsonb;
begin
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

  select
    c.id,
    c.nombre
  into
    v_campania_id,
    v_campania_nombre
  from campanias c
  where c.estado = 'ACTIVA';

  if v_campania_id is null then
    raise exception
      'No hay una campaña activa';
  end if;

  with agregados as (
    select
      l.id as lote_id,
      l.codigo::text as lote_codigo,
      l.nombre::text as lote_nombre,
      v.id as variedad_id,
      v.nombre::text as variedad,
      count(lj.id)::bigint as total_jabas,
      count(distinct at.cosechador_rol_id)::bigint as total_cosechadores,
      count(distinct lj.sesion_id)::bigint as total_sesiones,
      max(lj.fecha_hora) as ultima_lectura
    from lecturas_jaba lj
    join sesiones_lectura sl
      on sl.id = lj.sesion_id
    join lotes l
      on l.id = sl.lote_id
    join variedades v
      on v.id = sl.variedad_id
    join asignaciones_ticket at
      on at.id = lj.asignacion_ticket_id
    where l.campania_id = v_campania_id
    group by
      l.id,
      l.codigo,
      l.nombre,
      v.id,
      v.nombre
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lote_id', a.lote_id,
        'lote_codigo', a.lote_codigo,
        'lote_nombre', a.lote_nombre,
        'variedad_id', a.variedad_id,
        'variedad', a.variedad,
        'total_jabas', a.total_jabas,
        'total_cosechadores', a.total_cosechadores,
        'total_sesiones', a.total_sesiones,
        'ultima_lectura', a.ultima_lectura
      )
      order by
        a.total_jabas desc,
        a.lote_codigo asc,
        a.variedad asc,
        a.variedad_id asc
    ),
    '[]'::jsonb
  )
  into v_produccion
  from agregados a;

  return jsonb_build_object(
    'ok', true,
    'campania', jsonb_build_object(
      'id', v_campania_id,
      'nombre', v_campania_nombre
    ),
    'produccion', v_produccion
  );
end;
$$;

create or replace function public.admin_obtener_produccion_lotes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campania_id uuid;
  v_campania_nombre text;
  v_produccion jsonb;
begin
  perform public.autorizar_integracion_reportes();

  select
    c.id,
    c.nombre
  into
    v_campania_id,
    v_campania_nombre
  from public.campanias c
  where c.estado = 'ACTIVA';

  if v_campania_id is null then
    raise exception 'No hay una campaña activa';
  end if;

  with agregados as (
    select
      l.id as lote_id,
      l.codigo::text as lote_codigo,
      l.nombre::text as lote_nombre,
      v.id as variedad_id,
      v.nombre::text as variedad,
      count(lj.id)::bigint as total_jabas,
      count(distinct at.cosechador_rol_id)::bigint as total_cosechadores,
      count(distinct lj.sesion_id)::bigint as total_sesiones,
      max(lj.fecha_hora) as ultima_lectura
    from public.lecturas_jaba lj
    join public.sesiones_lectura sl
      on sl.id = lj.sesion_id
    join public.lotes l
      on l.id = sl.lote_id
    join public.variedades v
      on v.id = sl.variedad_id
    join public.asignaciones_ticket at
      on at.id = lj.asignacion_ticket_id
    where l.campania_id = v_campania_id
    group by
      l.id,
      l.codigo,
      l.nombre,
      v.id,
      v.nombre
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'lote_id', a.lote_id,
        'lote_codigo', a.lote_codigo,
        'lote_nombre', a.lote_nombre,
        'variedad_id', a.variedad_id,
        'variedad', a.variedad,
        'total_jabas', a.total_jabas,
        'total_cosechadores', a.total_cosechadores,
        'total_sesiones', a.total_sesiones,
        'ultima_lectura', a.ultima_lectura
      )
      order by
        a.total_jabas desc,
        a.lote_codigo asc,
        a.variedad asc,
        a.variedad_id asc
    ),
    '[]'::jsonb
  )
  into v_produccion
  from agregados a;

  return jsonb_build_object(
    'ok', true,
    'campania', jsonb_build_object(
      'id', v_campania_id,
      'nombre', v_campania_nombre
    ),
    'produccion', v_produccion
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
