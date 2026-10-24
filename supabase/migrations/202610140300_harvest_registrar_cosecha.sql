begin;

-- Solo el esquema nuevo. Las lecturas_jaba históricas permanecen intactas.
alter table public.harvest_registros_cosecha
  rename constraint harvest_registros_cosecha_codigo_ticket_key to harvest_registro_ticket_unico;
alter table public.harvest_registros_cosecha
  add column sesion_id uuid references public.sesiones_lectura(id),
  add column operacion_id uuid unique references public.operaciones_pda_campania(id),
  add column creado_en timestamptz,
  add constraint harvest_registro_contexto_completo check ((sesion_id is null) = (operacion_id is null)),
  add constraint harvest_registro_fecha_servidor check (operacion_id is null or creado_en is not null);
alter table public.harvest_registros_cosecha alter column creado_en set default clock_timestamp();
-- Nullable conserva estados prototipo F5.2 sin inventarles operación/sesión.
-- El RPC productivo exige ambos valores. No convierte filas legacy.

create function public.harvest_validar_sesion_cosecha(p_sesion_id uuid, p_campania_id uuid, p_dni_operador varchar)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_sesion public.sesiones_lectura%rowtype;
begin
  -- Bloquea la sesión frente a cierre concurrente durante un nuevo registro.
  select s.* into v_sesion from public.sesiones_lectura s
  join public.lotes l on l.id = s.lote_id and l.campania_id = p_campania_id
  join public.usuarios_app ua on ua.id = s.iniciada_por_usuario_id
  join public.trabajadores operador on operador.id = ua.trabajador_id
  where s.id = p_sesion_id and operador.dni = btrim(p_dni_operador)
    and s.estado = 'ACTIVA' for share of s;
  if not found then raise exception 'harvest_sesion_invalida'; end if;
  perform public.workforce_validar_jabero_campania(v_sesion.jabero_rol_id, p_campania_id);
end $$;
revoke all on function public.harvest_validar_sesion_cosecha(uuid,uuid,varchar) from public, anon, authenticated;

create function public.harvest_registrar_cosecha(
  p_campania_id uuid, p_dni_operador varchar, p_sesion_id uuid,
  p_codigo_ticket text, p_lectura_id uuid, p_fecha_hora text, p_operacion_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_ticket public.harvest_tickets%rowtype;
  v_lote public.harvest_lotes_tickets%rowtype;
  v_asignacion public.harvest_asignaciones_lote%rowtype;
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_huella text; v_resultado jsonb; v_constraint text;
begin
  perform public.autorizar_operador_campania(p_dni_operador, p_campania_id);
  perform public.fijar_campania_operacion(p_operacion_id, p_campania_id, p_dni_operador, 'REGISTRAR_JABA');

  -- La operación identifica el evento; ID/fecha propuestos no sustituyen el
  -- resultado ya confirmado. Otra sesión/operador/campaña/código no es reintento.
  v_huella := md5(jsonb_build_array(p_campania_id, btrim(p_dni_operador), p_sesion_id, p_codigo_ticket)::text);
  select * into v_anterior from public.operaciones_pda_procesadas where id = p_operacion_id;
  if found then
    if v_anterior.tipo <> 'REGISTRAR_JABA' or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
    -- Permite confirmar una respuesta perdida aunque la sesión se cerró luego.
    -- Un recibo legacy no se interpreta como cosecha Harvest.
    if v_anterior.resultado->'registro'->>'operacion_id' is distinct from p_operacion_id::text then
      raise exception 'La operación no corresponde a un registro de cosecha Harvest';
    end if;
    return v_anterior.resultado;
  end if;

  select * into v_ticket from public.harvest_tickets where codigo = p_codigo_ticket for update;
  if not found then raise exception 'harvest_ticket_no_encontrado'; end if;
  if v_ticket.campania_id <> p_campania_id then raise exception 'harvest_campania_incorrecta'; end if;
  select * into v_lote from public.harvest_lotes_tickets where id = v_ticket.lote_id for share;
  if not found then raise exception 'harvest_ticket_sin_lote'; end if;
  if v_lote.campania_id <> p_campania_id then raise exception 'harvest_campania_incorrecta'; end if;
  select * into v_asignacion from public.harvest_asignaciones_lote where lote_id = v_lote.id for share;
  if not found then raise exception using message = 'harvest_lote_sin_asignar', detail = v_lote.id::text; end if;
  if exists(select 1 from public.harvest_registros_cosecha where codigo_ticket = v_ticket.codigo) then
    raise exception 'harvest_ticket_ya_utilizado';
  end if;

  perform public.harvest_validar_sesion_cosecha(p_sesion_id, p_campania_id, p_dni_operador);
  begin
    -- No hay flag independiente: este único registro ES el consumo del ticket.
    -- La atribución se lee de la asignación, sin parámetro trabajador del cliente.
    insert into public.harvest_registros_cosecha(id, codigo_ticket, lote_id, campania_id,
      trabajador_id, asignacion_operacion_id, fecha_hora, sesion_id, operacion_id)
    values(p_lectura_id, v_ticket.codigo, v_lote.id, p_campania_id,
      v_asignacion.trabajador_id, v_asignacion.operacion_id, p_fecha_hora::timestamptz, p_sesion_id, p_operacion_id);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'harvest_registro_ticket_unico' then raise exception 'harvest_ticket_ya_utilizado'; end if;
    raise;
  end;

  select jsonb_build_object('lote', to_jsonb(v_lote), 'ticket', to_jsonb(v_ticket),
    'asignacion', to_jsonb(v_asignacion), 'registro', to_jsonb(r)) into v_resultado
  from public.harvest_registros_cosecha r where r.codigo_ticket = v_ticket.codigo;
  insert into public.operaciones_pda_procesadas(id, tipo, argumentos_md5, resultado)
  values(p_operacion_id, 'REGISTRAR_JABA', v_huella, v_resultado);
  return v_resultado;
end $$;

revoke all on function public.harvest_registrar_cosecha(uuid,varchar,uuid,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.harvest_registrar_cosecha(uuid,varchar,uuid,text,uuid,text,uuid) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
