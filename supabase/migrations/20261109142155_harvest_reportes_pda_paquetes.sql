begin;
-- A separate contract keeps older crate-only clients and integrations intact.
create function harvest_bonos_privado.reportes_pda(
 p_campania_id uuid,p_dni_operador varchar,p_tipo text,p_periodo text default 'HOY'
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r jsonb; datos jsonb; desde date; hoy date := (statement_timestamp() at time zone 'America/Lima')::date;
begin
 if auth.uid() is null then raise exception 'Autenticación requerida' using errcode='42501'; end if;
 if p_tipo is null or p_tipo not in ('RESUMEN','RANKING','DIARIA','LOTES') then raise exception 'Reporte inválido'; end if;
 -- Enforces operator identity, campaign membership and Harvest subscription.
 r:=public.obtener_resumen_campania_campania(p_campania_id,p_dni_operador,'America/Lima');
 if p_tipo='RESUMEN' then
  select jsonb_build_object('total_paquetes',count(*),
   'total_jabas',count(*) filter(where coalesce(tipo_recipiente,'JABA')='JABA'),
   'total_jarras',count(*) filter(where tipo_recipiente='JARRA'),
   'kg_estimados',case when count(*)=count(peso_kg) then coalesce(sum(peso_kg),0) else null end)
  into datos from public.harvest_produccion_reportable where campania_id=p_campania_id;
  return jsonb_set(r,'{resumen}',(r->'resumen')||datos);
 end if;
 if p_tipo='RANKING' then
  if p_periodo is null or p_periodo not in ('HOY','SEMANA','MES','CAMPANIA') then raise exception 'Período inválido'; end if;
  desde:=case p_periodo when 'HOY' then hoy when 'SEMANA' then date_trunc('week',hoy::timestamp)::date
   when 'MES' then date_trunc('month',hoy::timestamp)::date else null end;
  with personas as (
   select t.id,t.dni cosechador_dni,btrim(concat_ws(' ',t.nombres,t.apellidos)) cosechador,
    count(*) total_paquetes,count(*) filter(where coalesce(p.tipo_recipiente,'JABA')='JABA') total_jabas,
    count(*) filter(where p.tipo_recipiente='JARRA') total_jarras,
    case when count(*)=count(p.peso_kg) then coalesce(sum(p.peso_kg),0) else null end kg_estimados,
    count(distinct (p.fecha_hora at time zone 'America/Lima')::date) dias_con_registros,
    round(count(*)::numeric / nullif(count(distinct (p.fecha_hora at time zone 'America/Lima')::date),0),1) promedio_diario,
    max(p.fecha_hora) ultima_lectura
   from public.harvest_produccion_reportable p join public.trabajadores t on t.id=p.trabajador_id
   where p.campania_id=p_campania_id and (desde is null or
    (p.fecha_hora >= desde::timestamp at time zone 'America/Lima' and p.fecha_hora < (hoy+1)::timestamp at time zone 'America/Lima'))
   group by t.id,t.dni,t.nombres,t.apellidos
  ), posiciones as (select *,dense_rank() over(order by total_paquetes desc) posicion from personas)
  select coalesce(jsonb_agg(to_jsonb(x)-'id' order by total_paquetes desc,cosechador,cosechador_dni),'[]'::jsonb) into datos from posiciones x;
  return jsonb_build_object('ok',true,'campania',r#>>'{campania,nombre}','periodo',p_periodo,'zona_horaria','America/Lima','ranking',datos);
 elsif p_tipo='DIARIA' then
  with dias as (
   select (fecha_hora at time zone 'America/Lima')::date fecha,count(*) total_paquetes,
    count(*) filter(where coalesce(tipo_recipiente,'JABA')='JABA') total_jabas,
    count(*) filter(where tipo_recipiente='JARRA') total_jarras,
    case when count(*)=count(peso_kg) then coalesce(sum(peso_kg),0) else null end kg_estimados,
    count(distinct trabajador_id) total_cosechadores,count(distinct sesion_id) total_sesiones
   from public.harvest_produccion_reportable where campania_id=p_campania_id group by 1
  ) select coalesce(jsonb_agg(to_jsonb(x) order by fecha desc),'[]'::jsonb) into datos from dias x;
 else
  with lotes as (
   select l.id lote_id,l.codigo lote_codigo,l.nombre lote_nombre,v.id variedad_id,v.nombre variedad,
    count(*) total_paquetes,count(*) filter(where coalesce(p.tipo_recipiente,'JABA')='JABA') total_jabas,
    count(*) filter(where p.tipo_recipiente='JARRA') total_jarras,
    case when count(*)=count(p.peso_kg) then coalesce(sum(p.peso_kg),0) else null end kg_estimados,
    count(distinct p.trabajador_id) total_cosechadores,count(distinct p.sesion_id) total_sesiones,max(p.fecha_hora) ultima_lectura
   from public.harvest_produccion_reportable p join public.lotes l on l.id=p.lote_id join public.variedades v on v.id=p.variedad_id
   where p.campania_id=p_campania_id group by l.id,l.codigo,l.nombre,v.id,v.nombre
  ) select coalesce(jsonb_agg(to_jsonb(x) order by total_paquetes desc,lote_codigo,variedad),'[]'::jsonb) into datos from lotes x;
 end if;
 return jsonb_build_object('ok',true,'campania',r->'campania','zona_horaria','America/Lima','produccion',datos);
end $$;
revoke all on function harvest_bonos_privado.reportes_pda(uuid,varchar,text,text) from public,anon,authenticated,service_role;
grant execute on function harvest_bonos_privado.reportes_pda(uuid,varchar,text,text) to authenticated;
create function public.harvest_reportes_pda(p_campania_id uuid,p_dni_operador varchar,p_tipo text,p_periodo text default 'HOY')
returns jsonb language sql security invoker set search_path='' as $$
 select harvest_bonos_privado.reportes_pda(p_campania_id,p_dni_operador,p_tipo,p_periodo)
$$;
revoke all on function public.harvest_reportes_pda(uuid,varchar,text,text) from public,anon,authenticated,service_role;
grant execute on function public.harvest_reportes_pda(uuid,varchar,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
