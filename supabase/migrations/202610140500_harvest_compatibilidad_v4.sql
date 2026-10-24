begin;
-- Solo intenciones sin marcador v5. No transforma ni mezcla históricos.
create function public.harvest_modelo_operacion_v4(p_campania_id uuid, p_operacion_id uuid, p_codigo text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_resultado jsonb; v_nuevo boolean; v_legacy boolean;
begin
  select resultado into v_resultado from public.operaciones_pda_procesadas where id=p_operacion_id;
  if found then
    if v_resultado ? 'loteId' or v_resultado ? 'registro' then return 'HARVEST'; end if;
    return 'LEGACY';
  end if;
  select exists(select 1 from public.harvest_tickets where codigo=p_codigo),
    exists(select 1 from public.asignaciones_ticket where codigo_ticket=p_codigo)
    into v_nuevo,v_legacy;
  if v_nuevo and v_legacy then raise exception 'El comando v4 tiene un código ambiguo entre modelos; requiere revisión'; end if;
  return case when v_nuevo then 'HARVEST' else 'LEGACY' end;
end $$;
revoke all on function public.harvest_modelo_operacion_v4(uuid,uuid,text) from public,anon,authenticated;

create function public.harvest_asignar_v4(p_campania_id uuid,p_dni_operador varchar,p_dni_cosechador varchar,p_codigo_ticket text,p_operacion_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_modelo text; v_resultado jsonb;
begin
  perform public.autorizar_operador_campania(p_dni_operador,p_campania_id);
  -- El delegado fija el alcance con su tipo original (legacy y Harvest usan
  -- nombres distintos). Pre-fijarlo cambiaría los recibos históricos.
  v_modelo := public.harvest_modelo_operacion_v4(p_campania_id,p_operacion_id,p_codigo_ticket);
  if v_modelo='HARVEST' then
    v_resultado := public.harvest_asignar_lote_tickets(p_campania_id,p_dni_operador,p_dni_cosechador,p_codigo_ticket,p_operacion_id);
  else
    v_resultado := public.asignar_ticket_campania(p_campania_id,p_dni_operador,p_dni_cosechador,p_codigo_ticket::varchar,p_operacion_id);
  end if;
  return jsonb_build_object('modelo',v_modelo,'resultado',v_resultado);
end $$;

create function public.harvest_registrar_v4(p_campania_id uuid,p_dni_operador varchar,p_sesion_id uuid,p_codigo_ticket text,p_lectura_id uuid,p_fecha_hora text,p_operacion_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_modelo text; v_resultado jsonb;
begin
  perform public.autorizar_operador_campania(p_dni_operador,p_campania_id);
  v_modelo := public.harvest_modelo_operacion_v4(p_campania_id,p_operacion_id,p_codigo_ticket);
  if v_modelo='HARVEST' then
    v_resultado := public.harvest_registrar_cosecha(p_campania_id,p_dni_operador,p_sesion_id,p_codigo_ticket,p_lectura_id,p_fecha_hora,p_operacion_id);
  else
    v_resultado := public.registrar_lectura_jaba_campania(p_campania_id,p_dni_operador,p_sesion_id,p_codigo_ticket::varchar,p_lectura_id,p_fecha_hora,p_operacion_id);
  end if;
  return jsonb_build_object('modelo',v_modelo,'resultado',v_resultado);
end $$;
revoke all on function public.harvest_asignar_v4(uuid,varchar,varchar,text,uuid) from public,anon,authenticated;
revoke all on function public.harvest_registrar_v4(uuid,varchar,uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.harvest_asignar_v4(uuid,varchar,varchar,text,uuid) to anon,authenticated;
grant execute on function public.harvest_registrar_v4(uuid,varchar,uuid,text,uuid,text,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
