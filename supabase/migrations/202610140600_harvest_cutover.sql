begin;

-- No campaña se activa al aplicar la migración. El corte es una decisión
-- administrativa explícita e irreversible mediante esta API.
create table public.harvest_cutovers (
  campania_id uuid primary key references public.campanias(id),
  version integer not null check (version = 1),
  activado_en timestamptz not null,
  activado_por uuid not null,
  unique(campania_id, version)
);
alter table public.harvest_cutovers enable row level security;
revoke all on public.harvest_cutovers from public, anon, authenticated;

create function public.harvest_fijar_cutover()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_estado public.estado_campania;
begin
  if tg_op <> 'INSERT' then raise exception 'harvest_cutover_inmutable'; end if;
  select estado into v_estado from public.campanias where id=new.campania_id for update;
  if v_estado is distinct from 'ACTIVA'::public.estado_campania then
    raise exception 'El cutover requiere una campaña activa';
  end if;
  -- Cambiar la tupla, además de bloquearla, fuerza un error de serialización
  -- en escritores con snapshots antiguos bajo REPEATABLE READ/SERIALIZABLE.
  update public.campanias set updated_at=clock_timestamp() where id=new.campania_id;
  new.activado_en := clock_timestamp();
  return new;
end $$;
create trigger harvest_cutover_fijo before insert or update or delete
on public.harvest_cutovers for each row execute function public.harvest_fijar_cutover();

create function public.admin_activar_harvest_campania(p_campania_id uuid, p_version integer default 1)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_corte public.harvest_cutovers%rowtype; v_contexto text := current_setting('scc.hoja_campania_id',true);
begin
  perform set_config('scc.hoja_campania_id',p_campania_id::text,true);
  perform public.autorizar_integracion_gestion_maestros();
  if auth.uid() is null then raise exception 'El cutover requiere una identidad administrativa autenticada'; end if;
  if p_version is distinct from 1 then raise exception 'Versión de cutover no soportada'; end if;
  perform 1 from public.campanias where id=p_campania_id for update;
  if not found then raise exception 'La campaña no existe'; end if;
  select * into v_corte from public.harvest_cutovers where campania_id=p_campania_id;
  if not found then
    insert into public.harvest_cutovers(campania_id,version,activado_en,activado_por)
      values(p_campania_id,p_version,clock_timestamp(),auth.uid()) returning * into v_corte;
  end if;
  perform set_config('scc.hoja_campania_id',coalesce(v_contexto,''),true);
  return jsonb_build_object('campaniaId',v_corte.campania_id,'version',v_corte.version,
    'activadoEn',v_corte.activado_en,'activadoPor',v_corte.activado_por);
exception when others then
  perform set_config('scc.hoja_campania_id',coalesce(v_contexto,''),true);
  raise;
end $$;
revoke all on function public.admin_activar_harvest_campania(uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_activar_harvest_campania(uuid,integer) to authenticated;

-- Frontera de admisión, distinta de la fecha del evento enviada por el PDA.
-- Las filas anteriores permanecen sin versión: no se convierten en producción.
alter table public.harvest_registros_cosecha add column version_produccion integer,
  add constraint harvest_registro_version_corte foreign key(campania_id,version_produccion)
    references public.harvest_cutovers(campania_id,version);
create index harvest_produccion_campania_fecha on public.harvest_registros_cosecha(campania_id,fecha_hora)
  where version_produccion is not null;

create function public.harvest_exigir_legacy_abierto(p_campania_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform 1 from public.campanias where id=p_campania_id for share;
  if not found then raise exception 'No se pudo resolver la campaña del hecho legacy'; end if;
  if exists(select 1 from public.harvest_cutovers where campania_id=p_campania_id) then
    raise exception 'harvest_legacy_solo_lectura';
  end if;
end $$;

create function public.harvest_proteger_legacy()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_anterior uuid; v_nueva uuid; v_sesion uuid; v_campania uuid;
begin
  if tg_table_name='asignaciones_ticket' then
    if tg_op <> 'INSERT' then v_anterior := old.campania_id; end if;
    if tg_op <> 'DELETE' then v_nueva := new.campania_id; end if;
  else
    if tg_op <> 'INSERT' then
      select campania_id into v_anterior from public.asignaciones_ticket where id=old.asignacion_ticket_id;
    end if;
    if tg_op <> 'DELETE' then
      select campania_id into v_nueva from public.asignaciones_ticket where id=new.asignacion_ticket_id;
      select l.campania_id into v_sesion from public.sesiones_lectura s join public.lotes l on l.id=s.lote_id where s.id=new.sesion_id;
      if v_nueva is null or v_nueva is distinct from v_sesion then raise exception 'La lectura legacy y su sesión no corresponden a la misma campaña'; end if;
      if exists(select 1 from public.harvest_registros_cosecha where id=new.id) then raise exception 'harvest_identidad_de_hecho_reutilizada'; end if;
    end if;
  end if;
  for v_campania in select distinct id from unnest(array[v_anterior,v_nueva]) id where id is not null order by id loop
    perform public.harvest_exigir_legacy_abierto(v_campania);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger harvest_legacy_asignacion_readonly before insert or update or delete
on public.asignaciones_ticket for each row execute function public.harvest_proteger_legacy();
create trigger harvest_legacy_cosecha_readonly before insert or update or delete
on public.lecturas_jaba for each row execute function public.harvest_proteger_legacy();

create function public.harvest_impedir_truncado()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  raise exception 'El histórico y la frontera Harvest no admiten TRUNCATE';
end $$;
create trigger harvest_legacy_asignacion_no_truncate before truncate on public.asignaciones_ticket
for each statement execute function public.harvest_impedir_truncado();
create trigger harvest_legacy_cosecha_no_truncate before truncate on public.lecturas_jaba
for each statement execute function public.harvest_impedir_truncado();
create trigger harvest_cutover_no_truncate before truncate on public.harvest_cutovers
for each statement execute function public.harvest_impedir_truncado();

create function public.harvest_admitir_registro_productivo()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_corte public.harvest_cutovers%rowtype;
begin
  if tg_op <> 'INSERT' then
    if old.version_produccion is not null or (tg_op='UPDATE' and new.version_produccion is distinct from old.version_produccion) then
      raise exception 'harvest_registro_productivo_inmutable';
    end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  perform 1 from public.campanias where id=new.campania_id for share;
  select * into v_corte from public.harvest_cutovers where campania_id=new.campania_id;
  if not found then raise exception 'harvest_campania_sin_cutover'; end if;
  if new.operacion_id is null or new.sesion_id is null then raise exception 'harvest_registro_sin_contexto_productivo'; end if;
  if exists(select 1 from public.lecturas_jaba where id=new.id) then raise exception 'harvest_identidad_de_hecho_reutilizada'; end if;
  new.version_produccion := v_corte.version;
  new.creado_en := greatest(clock_timestamp(),v_corte.activado_en);
  return new;
end $$;
create trigger harvest_registro_productivo before insert or update or delete
on public.harvest_registros_cosecha for each row execute function public.harvest_admitir_registro_productivo();

-- Sin recibo anterior, el estado explícito de campaña elige el modelo.
-- Con recibo, se confirma SIEMPRE su modelo original, sin nuevas escrituras.
create or replace function public.harvest_modelo_operacion_v4(p_campania_id uuid,p_operacion_id uuid,p_codigo text)
returns text language plpgsql security definer set search_path = pg_catalog,public as $$
declare v_resultado jsonb; v_nuevo boolean; v_legacy boolean;
begin
  select resultado into v_resultado from public.operaciones_pda_procesadas where id=p_operacion_id;
  if found then
    if v_resultado ? 'loteId' or v_resultado ? 'registro' then return 'HARVEST'; end if;
    return 'LEGACY';
  end if;
  perform 1 from public.campanias where id=p_campania_id for share;
  if not exists(select 1 from public.harvest_cutovers where campania_id=p_campania_id) then return 'LEGACY'; end if;
  select exists(select 1 from public.harvest_tickets where codigo=p_codigo),
    exists(select 1 from public.asignaciones_ticket where codigo_ticket=p_codigo) into v_nuevo,v_legacy;
  if v_nuevo and v_legacy then raise exception 'El comando antiguo tiene un código ambiguo entre modelos; requiere revisión'; end if;
  if not v_nuevo then raise exception 'harvest_legacy_solo_lectura'; end if;
  return 'HARVEST';
end $$;

create or replace function public.harvest_obtener_snapshot(p_campania_id uuid, p_dni_operador varchar)
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
      'sesionId',r.sesion_id,'operacionId',r.operacion_id,'fechaHora',r.fecha_hora,'registradoEn',r.creado_en,'versionProduccion',r.version_produccion))
      from public.harvest_registros_cosecha r where r.campania_id=p_campania_id),'[]'::jsonb),
    'codigosLegacy',coalesce((select jsonb_agg(codigo_ticket) from public.asignaciones_ticket where campania_id=p_campania_id),'[]'::jsonb),
    'identidadesTrabajadores',public.workforce_identidades_campania(p_campania_id),
    'cutover',(select jsonb_build_object('campaniaId',c.campania_id,'version',c.version,'activadoEn',c.activado_en) from public.harvest_cutovers c where c.campania_id=p_campania_id)
  ) into v_snapshot;
  return v_snapshot;
end $$;

create or replace function public.harvest_registrar_cosecha(
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
    -- Enriquece el ACK con la version autoritativa sin modificar el recibo.
    -- Un consumo piloto sigue consumido, pero no se convierte en produccion.
    return jsonb_set(v_anterior.resultado, '{registro,version_produccion}',
      coalesce((select to_jsonb(r.version_produccion) from public.harvest_registros_cosecha r
        where r.id=(v_anterior.resultado->'registro'->>'id')::uuid), 'null'::jsonb));
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

revoke all on function public.harvest_fijar_cutover(),public.harvest_exigir_legacy_abierto(uuid),
 public.harvest_proteger_legacy(),public.harvest_impedir_truncado(),public.harvest_admitir_registro_productivo(),
 public.harvest_modelo_operacion_v4(uuid,uuid,text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
