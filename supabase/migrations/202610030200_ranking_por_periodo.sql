create or replace function public.obtener_ranking_cosechadores_periodo(
  p_dni_operador varchar,
  p_periodo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo text := upper(btrim(coalesce(p_periodo, '')));
  v_hoy date := (statement_timestamp() at time zone 'America/Lima')::date;
  v_desde date;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_campania_id uuid;
  v_campania_nombre text;
  v_ranking jsonb;
begin
  perform public.autorizar_operador_del_dia(p_dni_operador);
  if v_periodo not in ('HOY', 'SEMANA', 'MES', 'CAMPANIA') then
    raise exception 'Período de ranking inválido';
  end if;
  v_desde := case v_periodo
    when 'HOY' then v_hoy
    when 'SEMANA' then date_trunc('week', v_hoy::timestamp)::date
    when 'MES' then date_trunc('month', v_hoy::timestamp)::date
    else null
  end;
  if v_desde is not null then
    v_inicio := v_desde::timestamp at time zone 'America/Lima';
    v_fin := (v_hoy + 1)::timestamp at time zone 'America/Lima';
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
      and (v_inicio is null or lj.fecha_hora >= v_inicio)
      and (v_fin is null or lj.fecha_hora < v_fin)
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
    'periodo', v_periodo,
    'fecha_desde', v_desde,
    'fecha_hasta', case when v_desde is not null then v_hoy else null end,
    'zona_horaria', 'America/Lima',
    'ranking', v_ranking
  );
end;
$$;

revoke execute
on function public.obtener_ranking_cosechadores_periodo(varchar, text)
from public, anon, authenticated;

grant execute
on function public.obtener_ranking_cosechadores_periodo(varchar, text)
to anon;

notify pgrst, 'reload schema';
