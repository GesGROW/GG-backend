alter table public.integraciones_api
  add column if not exists puede_consultar_reportes boolean not null default false;

create or replace function public.autorizar_integracion_reportes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
begin
  v_auth_user_id := auth.uid();

  if v_auth_user_id is null
     or not exists (
       select 1
       from public.integraciones_api ia
       where ia.auth_user_id = v_auth_user_id
         and ia.activo = true
         and ia.puede_consultar_reportes = true
     ) then
    raise exception 'Integración no autorizada para consultar reportes';
  end if;
end;
$$;

revoke all
on function public.autorizar_integracion_reportes()
from public, anon, authenticated;

create or replace function public.admin_obtener_resumen_campania(
  p_zona_horaria text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  perform public.autorizar_integracion_reportes();

  select
    c.id,
    c.nombre,
    c.fecha_inicio
  into
    v_campania_id,
    v_campania_nombre,
    v_campania_fecha_inicio
  from public.campanias c
  where c.estado = 'ACTIVA';

  if v_campania_id is null then
    raise exception 'No hay una campaña activa';
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
  from public.lecturas_jaba lj
  join public.asignaciones_ticket at
    on at.id = lj.asignacion_ticket_id
  join public.sesiones_lectura sl
    on sl.id = lj.sesion_id
  join public.lotes l
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

create or replace function public.admin_obtener_ranking_cosechadores()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campania_id uuid;
  v_campania_nombre text;
  v_ranking jsonb;
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
      t.dni::text as cosechador_dni,
      concat_ws(' ', t.nombres, t.apellidos) as cosechador,
      count(lj.id)::bigint as total_jabas,
      max(lj.fecha_hora) as ultima_lectura
    from public.lecturas_jaba lj
    join public.asignaciones_ticket at
      on at.id = lj.asignacion_ticket_id
    join public.trabajador_campania_rol tcr
      on tcr.id = at.cosechador_rol_id
    join public.trabajadores t
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

create or replace function public.admin_obtener_produccion_diaria(
  p_zona_horaria text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campania_id uuid;
  v_campania_nombre text;
  v_zona_horaria text;
  v_produccion jsonb;
begin
  perform public.autorizar_integracion_reportes();

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
  from public.campanias c
  where c.estado = 'ACTIVA';

  if v_campania_id is null then
    raise exception 'No hay una campaña activa';
  end if;

  with agregados as (
    select
      (lj.fecha_hora at time zone v_zona_horaria)::date as fecha,
      count(lj.id)::bigint as total_jabas,
      count(distinct at.cosechador_rol_id)::bigint as total_cosechadores,
      count(distinct lj.sesion_id)::bigint as total_sesiones
    from public.lecturas_jaba lj
    join public.asignaciones_ticket at
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
      on v.id = l.variedad_id
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
        'variedad', a.variedad,
        'total_jabas', a.total_jabas,
        'total_cosechadores', a.total_cosechadores,
        'total_sesiones', a.total_sesiones,
        'ultima_lectura', a.ultima_lectura
      )
      order by
        a.total_jabas desc,
        a.lote_codigo asc
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

revoke all
on function public.admin_obtener_resumen_campania(text)
from public, anon, authenticated;

revoke all
on function public.admin_obtener_ranking_cosechadores()
from public, anon, authenticated;

revoke all
on function public.admin_obtener_produccion_diaria(text)
from public, anon, authenticated;

revoke all
on function public.admin_obtener_produccion_lotes()
from public, anon, authenticated;

grant execute
on function public.admin_obtener_resumen_campania(text)
to authenticated;

grant execute
on function public.admin_obtener_ranking_cosechadores()
to authenticated;

grant execute
on function public.admin_obtener_produccion_diaria(text)
to authenticated;

grant execute
on function public.admin_obtener_produccion_lotes()
to authenticated;

notify pgrst, 'reload schema';
