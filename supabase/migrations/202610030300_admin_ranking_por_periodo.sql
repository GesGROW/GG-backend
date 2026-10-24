-- Ranking administrativo para Sheets; conserva la RPC anterior y el acceso de la PWA.
create or replace function public.admin_obtener_ranking_cosechadores_periodo(
  p_periodo text default 'CAMPANIA',
  p_zona_horaria text default 'America/Lima'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo text := upper(btrim(coalesce(p_periodo, '')));
  v_zona text := btrim(coalesce(p_zona_horaria, ''));
  v_hoy date;
  v_desde date;
  v_anterior_desde date;
  v_anterior_hasta date;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_anterior_inicio timestamptz;
  v_anterior_fin timestamptz;
  v_campania_id uuid;
  v_campania_nombre text;
  v_campania_inicio date;
  v_ranking jsonb;
begin
  perform public.autorizar_integracion_reportes();
  if v_periodo not in ('HOY', 'SEMANA', 'MES', 'CAMPANIA') then
    raise exception 'Período de ranking inválido';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zona) then
    raise exception 'Zona horaria inválida';
  end if;
  v_hoy := (statement_timestamp() at time zone v_zona)::date;

  select c.id, c.nombre, c.fecha_inicio
  into v_campania_id, v_campania_nombre, v_campania_inicio
  from public.campanias c where c.estado = 'ACTIVA';
  if v_campania_id is null then
    raise exception 'No hay una campaña activa';
  end if;

  case v_periodo
    when 'HOY' then
      v_desde := v_hoy;
      v_anterior_desde := v_hoy - 1;
      v_anterior_hasta := v_hoy - 1;
    when 'SEMANA' then
      v_desde := date_trunc('week', v_hoy::timestamp)::date;
      v_anterior_desde := v_desde - 7;
      v_anterior_hasta := v_hoy - 7;
    when 'MES' then
      v_desde := date_trunc('month', v_hoy::timestamp)::date;
      v_anterior_desde := (v_desde - interval '1 month')::date;
      -- El mes anterior puede tener menos días (incluido febrero bisiesto).
      v_anterior_hasta := least(v_desde - 1, v_anterior_desde + (v_hoy - v_desde));
    when 'CAMPANIA' then
      -- Usa toda la producción de la misma campaña como el reporte original.
      select least(v_hoy, coalesce(v_campania_inicio, v_hoy),
        coalesce(min((lj.fecha_hora at time zone v_zona)::date), v_hoy))
      into v_desde
      from public.lecturas_jaba lj
      join public.asignaciones_ticket at on at.id = lj.asignacion_ticket_id
      where at.campania_id = v_campania_id;
      v_anterior_desde := v_desde;
      v_anterior_hasta := v_hoy - 1;
  end case;

  if v_anterior_hasta < v_anterior_desde then
    v_anterior_desde := null;
    v_anterior_hasta := null;
  end if;
  v_inicio := v_desde::timestamp at time zone v_zona;
  v_fin := (v_hoy + 1)::timestamp at time zone v_zona;
  v_anterior_inicio := v_anterior_desde::timestamp at time zone v_zona;
  v_anterior_fin := (v_anterior_hasta + 1)::timestamp at time zone v_zona;

  with agregados as (
    select t.id as trabajador_id, t.dni::text as cosechador_dni,
      btrim(concat_ws(' ', t.nombres, t.apellidos)) as cosechador,
      count(lj.id) filter (where lj.fecha_hora >= v_inicio and lj.fecha_hora < v_fin) as total_jabas,
      count(lj.id) filter (where lj.fecha_hora >= v_anterior_inicio and lj.fecha_hora < v_anterior_fin) as jabas_anteriores,
      max(lj.fecha_hora) filter (where lj.fecha_hora >= v_inicio and lj.fecha_hora < v_fin) as ultima_lectura
    from public.lecturas_jaba lj
    join public.asignaciones_ticket at on at.id = lj.asignacion_ticket_id
    join public.trabajador_campania_rol tcr on tcr.id = at.cosechador_rol_id
    join public.trabajadores t on t.id = tcr.trabajador_id
    where at.campania_id = v_campania_id
      and ((lj.fecha_hora >= v_inicio and lj.fecha_hora < v_fin)
        or (lj.fecha_hora >= v_anterior_inicio and lj.fecha_hora < v_anterior_fin))
    group by t.id, t.dni, t.nombres, t.apellidos
  ), actual as (
    select a.*, dense_rank() over (order by a.total_jabas desc) as posicion
    from agregados a where a.total_jabas > 0
  ), anterior as (
    -- Incluye a quienes solo produjeron en el período anterior.
    select a.trabajador_id, dense_rank() over (order by a.jabas_anteriores desc) as posicion
    from agregados a where a.jabas_anteriores > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'posicion', a.posicion,
    'cosechador_dni', a.cosechador_dni,
    'cosechador', a.cosechador,
    'total_jabas', a.total_jabas,
    'ultima_lectura', a.ultima_lectura,
    'posicion_anterior', b.posicion,
    'cambio_posicion', b.posicion - a.posicion
  ) order by a.total_jabas desc, a.cosechador asc, a.cosechador_dni asc), '[]'::jsonb)
  into v_ranking
  from actual a left join anterior b on b.trabajador_id = a.trabajador_id;

  return jsonb_build_object(
    'ok', true, 'campania', v_campania_nombre, 'periodo', v_periodo,
    'zona_horaria', v_zona, 'fecha_desde', v_desde, 'fecha_hasta', v_hoy,
    'comparacion_disponible', v_anterior_desde is not null,
    'fecha_anterior_desde', v_anterior_desde, 'fecha_anterior_hasta', v_anterior_hasta,
    'ranking', v_ranking
  );
end;
$$;

revoke execute on function public.admin_obtener_ranking_cosechadores_periodo(text, text)
from public, anon, authenticated;
grant execute on function public.admin_obtener_ranking_cosechadores_periodo(text, text)
to authenticated;

notify pgrst, 'reload schema';
