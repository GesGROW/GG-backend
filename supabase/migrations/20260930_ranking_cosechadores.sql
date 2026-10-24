create or replace function public.obtener_ranking_cosechadores(
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
  v_ranking jsonb;
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
      t.dni::text as cosechador_dni,
      concat_ws(' ', t.nombres, t.apellidos) as cosechador,
      count(lj.id)::bigint as total_jabas,
      max(lj.fecha_hora) as ultima_lectura
    from lecturas_jaba lj
    join asignaciones_ticket at
      on at.id = lj.asignacion_ticket_id
    join trabajador_campania_rol tcr
      on tcr.id = at.cosechador_rol_id
    join trabajadores t
      on t.id = tcr.trabajador_id
    where at.campania_id = v_campania_id
    group by
      t.id,
      t.dni,
      t.nombres,
      t.apellidos
  ),
  ranking as (
    select
      dense_rank() over (
        order by a.total_jabas desc
      )::bigint as posicion,
      a.cosechador_dni,
      a.cosechador,
      a.total_jabas,
      a.ultima_lectura
    from agregados a
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'posicion', r.posicion,
        'cosechador_dni', r.cosechador_dni,
        'cosechador', r.cosechador,
        'total_jabas', r.total_jabas,
        'ultima_lectura', r.ultima_lectura
      )
      order by
        r.total_jabas desc,
        r.cosechador asc,
        r.cosechador_dni asc
    ),
    '[]'::jsonb
  )
  into v_ranking
  from ranking r;

  return jsonb_build_object(
    'ok', true,
    'campania', v_campania_nombre,
    'ranking', v_ranking
  );
end;
$$;

revoke execute
on function public.obtener_ranking_cosechadores(varchar)
from public, anon, authenticated;

grant execute
on function public.obtener_ranking_cosechadores(varchar)
to anon;

notify pgrst, 'reload schema';
