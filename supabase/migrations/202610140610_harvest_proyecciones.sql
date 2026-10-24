begin;

-- El legado queda congelado por el corte transaccional; su fecha de evento
-- NO decide la fuente. Harvest solo aporta registros admitidos con versión.
-- Cada ID es un hecho: no se deduplica por código (el legado admite repetición).
create view public.harvest_produccion_reportable as
select a.campania_id, 'LEGACY'::text as fuente, j.id as hecho_id,
  r.trabajador_id, j.sesion_id, s.lote_id, s.variedad_id, j.fecha_hora,
  0::integer as version_produccion
from public.lecturas_jaba j
join public.asignaciones_ticket a on a.id=j.asignacion_ticket_id
join public.trabajador_campania_rol r on r.id=a.cosechador_rol_id and r.campania_id=a.campania_id
join public.sesiones_lectura s on s.id=j.sesion_id
join public.lotes l on l.id=s.lote_id and l.campania_id=a.campania_id
union all
select c.campania_id, 'HARVEST'::text, c.id, c.trabajador_id,
  c.sesion_id,s.lote_id,s.variedad_id,c.fecha_hora,c.version_produccion
from public.harvest_registros_cosecha c
join public.harvest_cutovers corte on corte.campania_id=c.campania_id and corte.version=c.version_produccion
join public.sesiones_lectura s on s.id=c.sesion_id
join public.lotes l on l.id=s.lote_id and l.campania_id=c.campania_id
where c.creado_en >= corte.activado_en;
revoke all on public.harvest_produccion_reportable from public,anon,authenticated;

create function public.harvest_zona_reporte(p_zona text)
returns text language plpgsql stable set search_path = pg_catalog,public as $$
declare v_zona text;
begin
  select name into v_zona from pg_catalog.pg_timezone_names where name=btrim(p_zona) limit 1;
  if v_zona is null then raise exception 'Zona horaria inválida'; end if;
  return v_zona;
end $$;

create function public.harvest_proyectar_resumen(p_campania uuid,p_zona text)
returns jsonb language sql stable set search_path = pg_catalog,public as $$
  select jsonb_build_object('ok',true,'campania',(select jsonb_build_object('id',id,'nombre',nombre,'fecha_inicio',fecha_inicio) from public.campanias where id=p_campania),
    'zona_horaria',p_zona,'resumen',jsonb_build_object(
      'total_jabas',count(*),'total_cosechadores',count(distinct trabajador_id),
      'total_lotes',count(distinct lote_id),'total_sesiones',count(distinct sesion_id),
      'dias_con_produccion',count(distinct (fecha_hora at time zone p_zona)::date),
      'ultima_lectura',max(fecha_hora)))
  from public.harvest_produccion_reportable where campania_id=p_campania;
$$;

create function public.harvest_proyectar_diaria(p_campania uuid,p_zona text)
returns jsonb language sql stable set search_path = pg_catalog,public as $$
  with dias as (
    select (fecha_hora at time zone p_zona)::date fecha,count(*) total_jabas,
      count(distinct trabajador_id) total_cosechadores,count(distinct sesion_id) total_sesiones
    from public.harvest_produccion_reportable where campania_id=p_campania group by 1
  )
  select jsonb_build_object('ok',true,'campania',(select jsonb_build_object('id',id,'nombre',nombre) from public.campanias where id=p_campania),
    'zona_horaria',p_zona,'produccion',coalesce((select jsonb_agg(to_jsonb(d) order by d.fecha desc) from dias d),'[]'::jsonb));
$$;

create function public.harvest_proyectar_lotes(p_campania uuid)
returns jsonb language sql stable set search_path = pg_catalog,public as $$
  with grupos as (
    select l.id lote_id,l.codigo::text lote_codigo,l.nombre::text lote_nombre,
      v.id variedad_id,v.nombre::text variedad,count(*) total_jabas,
      count(distinct p.trabajador_id) total_cosechadores,count(distinct p.sesion_id) total_sesiones,
      max(p.fecha_hora) ultima_lectura
    from public.harvest_produccion_reportable p join public.lotes l on l.id=p.lote_id
      join public.variedades v on v.id=p.variedad_id
    where p.campania_id=p_campania group by l.id,l.codigo,l.nombre,v.id,v.nombre
  )
  select jsonb_build_object('ok',true,'campania',(select jsonb_build_object('id',id,'nombre',nombre) from public.campanias where id=p_campania),
    'produccion',coalesce((select jsonb_agg(to_jsonb(g) order by g.total_jabas desc,g.lote_codigo,g.variedad,g.variedad_id) from grupos g),'[]'::jsonb));
$$;

create function public.harvest_proyectar_ranking(p_campania uuid,p_periodo text)
returns jsonb language plpgsql stable set search_path = pg_catalog,public as $$
declare v_periodo text := upper(btrim(coalesce(p_periodo,'')));
  v_hoy date := (statement_timestamp() at time zone 'America/Lima')::date;
  v_desde date; v_inicio timestamptz; v_fin timestamptz; v_ranking jsonb;
begin
  if v_periodo not in ('HOY','SEMANA','MES','CAMPANIA') then raise exception 'Período de ranking inválido'; end if;
  v_desde := case v_periodo when 'HOY' then v_hoy when 'SEMANA' then date_trunc('week',v_hoy::timestamp)::date
    when 'MES' then date_trunc('month',v_hoy::timestamp)::date else null end;
  if v_desde is not null then
    v_inicio := v_desde::timestamp at time zone 'America/Lima';
    v_fin := (v_hoy+1)::timestamp at time zone 'America/Lima';
  end if;
  with totales as (
    select t.id,t.dni::text cosechador_dni,concat_ws(' ',t.nombres,t.apellidos) cosechador,
      count(*) total_jabas,max(p.fecha_hora) ultima_lectura
    from public.harvest_produccion_reportable p join public.trabajadores t on t.id=p.trabajador_id
    where p.campania_id=p_campania and (v_inicio is null or p.fecha_hora>=v_inicio) and (v_fin is null or p.fecha_hora<v_fin)
    group by t.id,t.dni,t.nombres,t.apellidos
  ), posiciones as (
    select dense_rank() over(order by total_jabas desc) posicion,cosechador_dni,cosechador,total_jabas,ultima_lectura from totales
  ) select coalesce(jsonb_agg(to_jsonb(r) order by total_jabas desc,cosechador,cosechador_dni),'[]'::jsonb) into v_ranking from posiciones r;
  return jsonb_build_object('ok',true,'campania',(select nombre from public.campanias where id=p_campania),
    'periodo',v_periodo,'fecha_desde',v_desde,'fecha_hasta',case when v_desde is not null then v_hoy else null end,
    'zona_horaria','America/Lima','ranking',v_ranking);
end $$;

-- Los contratos públicos siguen iguales; los adapters por campaña ya llaman
-- estas funciones bajo su contexto y autorización existentes.
create or replace function public.obtener_resumen_campania(p_dni_operador varchar,p_zona_horaria text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_campania uuid := public.campania_operativa_id();
begin
  perform public.autorizar_operador_campania(p_dni_operador,v_campania);
  return public.harvest_proyectar_resumen(v_campania,public.harvest_zona_reporte(p_zona_horaria));
end $$;
create or replace function public.obtener_produccion_diaria(p_dni_operador varchar,p_zona_horaria text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_campania uuid := public.campania_operativa_id();
begin
  perform public.autorizar_operador_campania(p_dni_operador,v_campania);
  return public.harvest_proyectar_diaria(v_campania,public.harvest_zona_reporte(p_zona_horaria));
end $$;
create or replace function public.obtener_produccion_lotes(p_dni_operador varchar)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_campania uuid := public.campania_operativa_id();
begin
  perform public.autorizar_operador_campania(p_dni_operador,v_campania);
  return public.harvest_proyectar_lotes(v_campania);
end $$;
create or replace function public.obtener_ranking_cosechadores_periodo(p_dni_operador varchar,p_periodo text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_campania uuid := public.campania_operativa_id();
begin
  perform public.autorizar_operador_campania(p_dni_operador,v_campania);
  return public.harvest_proyectar_ranking(v_campania,p_periodo);
end $$;

-- Reportes administrativos: misma proyección, con su autorización original.
-- No se modifica ningún archivo de Sheets o Apps Script.
create or replace function public.admin_obtener_resumen_campania(p_zona_horaria text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  perform public.autorizar_integracion_reportes();
  return public.harvest_proyectar_resumen(public.campania_operativa_id(),public.harvest_zona_reporte(p_zona_horaria));
end $$;
create or replace function public.admin_obtener_produccion_diaria(p_zona_horaria text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  perform public.autorizar_integracion_reportes();
  return public.harvest_proyectar_diaria(public.campania_operativa_id(),public.harvest_zona_reporte(p_zona_horaria));
end $$;
create or replace function public.admin_obtener_produccion_lotes()
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  perform public.autorizar_integracion_reportes();
  return public.harvest_proyectar_lotes(public.campania_operativa_id());
end $$;
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
  from public.campanias c where c.id = public.campania_operativa_id();
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
      from public.harvest_produccion_reportable lj
      where lj.campania_id = v_campania_id;
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
      count(lj.hecho_id) filter (where lj.fecha_hora >= v_inicio and lj.fecha_hora < v_fin) as total_jabas,
      count(lj.hecho_id) filter (where lj.fecha_hora >= v_anterior_inicio and lj.fecha_hora < v_anterior_fin) as jabas_anteriores,
      max(lj.fecha_hora) filter (where lj.fecha_hora >= v_inicio and lj.fecha_hora < v_fin) as ultima_lectura
    from public.harvest_produccion_reportable lj
    join public.trabajadores t on t.id = lj.trabajador_id
    where lj.campania_id = v_campania_id
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


-- Los alias antiguos sin período se conservan con semántica de campaña.
create or replace function public.obtener_ranking_cosechadores(p_dni_operador varchar)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
begin return public.obtener_ranking_cosechadores_periodo(p_dni_operador,'CAMPANIA'); end $$;
create or replace function public.admin_obtener_ranking_cosechadores()
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  perform public.autorizar_integracion_reportes();
  return public.harvest_proyectar_ranking(public.campania_operativa_id(),'CAMPANIA');
end $$;

revoke all on function public.harvest_zona_reporte(text),public.harvest_proyectar_resumen(uuid,text),
 public.harvest_proyectar_diaria(uuid,text),public.harvest_proyectar_lotes(uuid),public.harvest_proyectar_ranking(uuid,text)
 from public,anon,authenticated;
revoke all on function public.admin_obtener_resumen_campania(text),public.admin_obtener_produccion_diaria(text),
 public.admin_obtener_produccion_lotes(),public.admin_obtener_ranking_cosechadores_periodo(text,text),public.admin_obtener_ranking_cosechadores()
 from public,anon,authenticated;
grant execute on function public.admin_obtener_resumen_campania(text),public.admin_obtener_produccion_diaria(text),
 public.admin_obtener_produccion_lotes(),public.admin_obtener_ranking_cosechadores_periodo(text,text),public.admin_obtener_ranking_cosechadores()
 to authenticated;
revoke all on function public.obtener_resumen_campania(varchar,text),public.obtener_produccion_diaria(varchar,text),
 public.obtener_produccion_lotes(varchar),public.obtener_ranking_cosechadores_periodo(varchar,text),public.obtener_ranking_cosechadores(varchar)
 from public,anon,authenticated;
grant execute on function public.obtener_resumen_campania(varchar,text),public.obtener_produccion_diaria(varchar,text),
 public.obtener_produccion_lotes(varchar),public.obtener_ranking_cosechadores_periodo(varchar,text),public.obtener_ranking_cosechadores(varchar)
 to anon;
notify pgrst,'reload schema';
commit;
