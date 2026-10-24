begin;

-- Además de un propietario por lote, un UUID operativo no puede confirmar
-- asignaciones de dos lotes, incluso si se eluden los RPC con SQL privilegiado.
alter table public.harvest_asignaciones_lote
  add constraint harvest_asignacion_operacion_unica unique(operacion_id);

create function public.harvest_asignar_lote_tickets(
  p_campania_id uuid, p_dni_operador varchar, p_dni_cosechador varchar,
  p_codigo_ticket text, p_operacion_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_ticket public.harvest_tickets%rowtype;
  v_lote public.harvest_lotes_tickets%rowtype;
  v_asignacion public.harvest_asignaciones_lote%rowtype;
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_huella text; v_trabajador jsonb; v_resultado jsonb;
  v_contexto text := current_setting('scc.campania_id', true);
begin
  -- Contratos existentes de Identity/Campaign; no se copian reglas de acceso.
  perform public.autorizar_operador_campania(p_dni_operador, p_campania_id);
  perform public.fijar_campania_operacion(p_operacion_id, p_campania_id, p_dni_operador, 'ASIGNAR_TICKET');

  select * into v_ticket from public.harvest_tickets where codigo = p_codigo_ticket for share;
  if not found then raise exception 'harvest_ticket_no_encontrado'; end if;
  if v_ticket.campania_id <> p_campania_id then raise exception 'harvest_campania_incorrecta'; end if;
  select * into v_lote from public.harvest_lotes_tickets where id = v_ticket.lote_id for update;
  if not found then raise exception 'harvest_ticket_sin_lote'; end if;
  if v_lote.campania_id <> p_campania_id then raise exception 'harvest_campania_incorrecta'; end if;

  -- La identidad idempotente es lote/trabajador/operador/campaña, no el ticket
  -- representante: el mismo UUID puede repetirse escaneando un ticket hermano.
  v_huella := md5(jsonb_build_array(p_campania_id, btrim(p_dni_operador),
    btrim(p_dni_cosechador), v_lote.id)::text);
  select * into v_anterior from public.operaciones_pda_procesadas where id = p_operacion_id;
  if found then
    if v_anterior.tipo <> 'ASIGNAR_TICKET' or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
  else
    select * into v_asignacion from public.harvest_asignaciones_lote where lote_id = v_lote.id;
    if found then
      raise exception using message = 'harvest_lote_ya_asignado', detail = v_lote.id::text;
    end if;

    -- Workforce conserva alta provisional y validación de trabajador activo.
    -- El helper vigente respeta campania_operativa_id(), no la primera campaña.
    perform set_config('scc.campania_id', p_campania_id::text, true);
    v_trabajador := public.obtener_o_registrar_cosechador_activo(p_dni_cosechador);
    perform set_config('scc.campania_id', coalesce(v_contexto, ''), true);
    if (v_trabajador->>'campania_id')::uuid is distinct from p_campania_id then
      raise exception 'La resolución del trabajador no corresponde a la campaña operativa';
    end if;

    insert into public.harvest_asignaciones_lote(lote_id, campania_id, trabajador_id, operacion_id)
    values(v_lote.id, p_campania_id, (v_trabajador->>'id')::uuid, p_operacion_id);
    insert into public.operaciones_pda_procesadas(id, tipo, argumentos_md5, resultado)
    values(p_operacion_id, 'ASIGNAR_TICKET', v_huella, jsonb_build_object(
      'loteId', v_lote.id, 'trabajadorId', v_trabajador->>'id', 'operacionId', p_operacion_id));
  end if;

  select jsonb_build_object('lote', to_jsonb(l), 'ticket', to_jsonb(t),
    'asignacion', to_jsonb(a), 'registro', to_jsonb(r)) into v_resultado
  from public.harvest_tickets t
  join public.harvest_lotes_tickets l on l.id = t.lote_id and l.campania_id = t.campania_id
  join public.harvest_asignaciones_lote a on a.lote_id = l.id and a.campania_id = l.campania_id
  left join public.harvest_registros_cosecha r on r.codigo_ticket = t.codigo
  where t.codigo = p_codigo_ticket and t.campania_id = p_campania_id
    and a.operacion_id = p_operacion_id;
  if v_resultado is null then raise exception 'No se pudo reconstruir la asignación confirmada'; end if;
  return v_resultado;
end $$;

-- PDA: mismo contrato de acceso por DNI del operador que los RPC existentes.
-- No abre acceso a las tablas ni la autorización administrativa de F5.2.
revoke all on function public.harvest_asignar_lote_tickets(uuid,varchar,varchar,text,uuid)
  from public, anon, authenticated;
grant execute on function public.harvest_asignar_lote_tickets(uuid,varchar,varchar,text,uuid)
  to anon, authenticated;
notify pgrst, 'reload schema';
commit;
