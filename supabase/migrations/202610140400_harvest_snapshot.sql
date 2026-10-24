begin;
-- Proyección pública mínima de Workforce para enlazar su caché por DNI con
-- las referencias UUID de Harvest. No concede roles ni decide autorización.
create function public.workforce_identidades_campania(p_campania_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'dni',t.dni)),'[]'::jsonb)
  from public.trabajadores t where exists (
    select 1 from public.trabajador_campania_rol r where r.trabajador_id=t.id and r.campania_id=p_campania_id
  );
$$;
revoke all on function public.workforce_identidades_campania(uuid) from public,anon,authenticated;

create function public.harvest_obtener_snapshot(p_campania_id uuid, p_dni_operador varchar)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_snapshot jsonb;
begin
  perform public.autorizar_operador_campania(p_dni_operador, p_campania_id);
  -- Un solo SELECT proporciona una misma instantánea MVCC para todas las listas.
  select jsonb_build_object(
    'versionContrato',1,'tipo','SNAPSHOT','completo',true,'snapshotId',gen_random_uuid(),
    'campaniaId',p_campania_id,'operadorDni',btrim(p_dni_operador),'obtenidoEn',clock_timestamp(),
    'lotesDeTickets',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'campaniaId',l.campania_id,
      'estado',case when a.lote_id is null then 'DISPONIBLE' else 'ASIGNADO' end,'asignacionOperacionId',a.operacion_id))
      from public.harvest_lotes_tickets l left join public.harvest_asignaciones_lote a on a.lote_id=l.id
      where l.campania_id=p_campania_id),'[]'::jsonb),
    'asignacionesDeLote',coalesce((select jsonb_agg(jsonb_build_object('loteId',a.lote_id,'campaniaId',a.campania_id,
      'trabajadorId',a.trabajador_id,'operacionId',a.operacion_id)) from public.harvest_asignaciones_lote a where a.campania_id=p_campania_id),'[]'::jsonb),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object('codigo',t.codigo,'loteId',t.lote_id,'campaniaId',t.campania_id,
      'estado',case when r.id is null then 'DISPONIBLE' else 'UTILIZADO' end,'registroId',r.id,'consumoOperacionId',r.operacion_id))
      from public.harvest_tickets t left join public.harvest_registros_cosecha r on r.codigo_ticket=t.codigo where t.campania_id=p_campania_id),'[]'::jsonb),
    'registrosCosecha',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'codigoTicket',r.codigo_ticket,'loteId',r.lote_id,
      'campaniaId',r.campania_id,'trabajadorId',r.trabajador_id,'asignacionOperacionId',r.asignacion_operacion_id,
      'sesionId',r.sesion_id,'operacionId',r.operacion_id,'fechaHora',r.fecha_hora,'registradoEn',r.creado_en))
      from public.harvest_registros_cosecha r where r.campania_id=p_campania_id),'[]'::jsonb),
    'codigosLegacy',coalesce((select jsonb_agg(codigo_ticket) from public.asignaciones_ticket where campania_id=p_campania_id),'[]'::jsonb),
    'identidadesTrabajadores',public.workforce_identidades_campania(p_campania_id)
  ) into v_snapshot;
  return v_snapshot;
end $$;
revoke all on function public.harvest_obtener_snapshot(uuid,varchar) from public,anon,authenticated;
grant execute on function public.harvest_obtener_snapshot(uuid,varchar) to anon,authenticated;
notify pgrst,'reload schema';
commit;
