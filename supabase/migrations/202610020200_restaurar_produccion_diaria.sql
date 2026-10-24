-- Restores the PDA RPC independently of the administrative Sheets RPC.
-- Keep operator authorization and the existing two-argument public contract.
create or replace function public.obtener_produccion_diaria(
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
  v_zona_horaria text;
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
      (lj.fecha_hora at time zone v_zona_horaria)::date as fecha,
      count(lj.id)::bigint as total_jabas,
      count(distinct at.cosechador_rol_id)::bigint as total_cosechadores,
      count(distinct lj.sesion_id)::bigint as total_sesiones
    from lecturas_jaba lj
    join asignaciones_ticket at
      on at.id = lj.asignacion_ticket_id
    where at.campania_id = v_campania_id
    group by
      (lj.fecha_hora at time zone v_zona_horaria)::date
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'fecha', a.fecha,
        'total_jabas', a.total_jabas,
        'total_cosechadores', a.total_cosechadores,
        'total_sesiones', a.total_sesiones
      )
      order by a.fecha desc
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
    'zona_horaria', v_zona_horaria,
    'produccion', v_produccion
  );
end;
$$;

revoke execute
on function public.obtener_produccion_diaria(varchar, text)
from public, anon, authenticated;

grant execute
on function public.obtener_produccion_diaria(varchar, text)
to anon;

notify pgrst, 'reload schema';
