create or replace function public.obtener_resumen_campania(
  p_dni_operador varchar,
  p_zona_horaria text
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
  v_campania_fecha_inicio date;
  v_zona_horaria text;
  v_total_jabas bigint;
  v_total_cosechadores bigint;
  v_total_lotes bigint;
  v_total_sesiones bigint;
  v_dias_con_produccion bigint;
  v_ultima_lectura timestamptz;
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
    c.nombre,
    c.fecha_inicio
  into
    v_campania_id,
    v_campania_nombre,
    v_campania_fecha_inicio
  from campanias c
  where c.estado = 'ACTIVA';

  if v_campania_id is null then
    raise exception
      'No hay una campaña activa';
  end if;

  select tz.name
  into v_zona_horaria
  from pg_catalog.pg_timezone_names tz
  where tz.name = btrim(p_zona_horaria)
  limit 1;

  if v_zona_horaria is null then
    raise exception
      'Zona horaria inválida: %',
      coalesce(nullif(btrim(p_zona_horaria), ''), '(vacía)');
  end if;

  select
    count(lj.id)::bigint,
    count(distinct at.cosechador_rol_id)::bigint,
    count(distinct sl.lote_id)::bigint,
    count(distinct lj.sesion_id)::bigint,
    count(
      distinct (lj.fecha_hora at time zone v_zona_horaria)::date
    )::bigint,
    max(lj.fecha_hora)
  into
    v_total_jabas,
    v_total_cosechadores,
    v_total_lotes,
    v_total_sesiones,
    v_dias_con_produccion,
    v_ultima_lectura
  from lecturas_jaba lj
  join asignaciones_ticket at
    on at.id = lj.asignacion_ticket_id
  join sesiones_lectura sl
    on sl.id = lj.sesion_id
  join lotes l
    on l.id = sl.lote_id
  where at.campania_id = v_campania_id
    and l.campania_id = v_campania_id;

  return jsonb_build_object(
    'ok', true,
    'campania', jsonb_build_object(
      'id', v_campania_id,
      'nombre', v_campania_nombre,
      'fecha_inicio', v_campania_fecha_inicio
    ),
    'zona_horaria', v_zona_horaria,
    'resumen', jsonb_build_object(
      'total_jabas', v_total_jabas,
      'total_cosechadores', v_total_cosechadores,
      'total_lotes', v_total_lotes,
      'total_sesiones', v_total_sesiones,
      'dias_con_produccion', v_dias_con_produccion,
      'ultima_lectura', v_ultima_lectura
    )
  );
end;
$$;

revoke execute
on function public.obtener_resumen_campania(varchar, text)
from public, anon, authenticated;

grant execute
on function public.obtener_resumen_campania(varchar, text)
to anon;

notify pgrst, 'reload schema';
