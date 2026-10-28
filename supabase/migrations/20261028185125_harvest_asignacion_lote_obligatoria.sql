begin;

-- Las campañas creadas desde Cosecha nacen con el modelo por lote.
-- No cambiar automáticamente campañas históricas ni su producción.
do $actualizar$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.harvest_cultivos_materializar_campania(uuid,uuid,jsonb)'::regprocedure);
  if strpos(v_def, 'return v_id;') = 0 then raise exception 'Firma de creación de campaña no reconocida'; end if;
  v_def := replace(v_def, 'return v_id;',
    'if auth.uid() is null then raise exception ''Cuenta autenticada requerida para crear la campaña''; end if;
     insert into public.harvest_cutovers(campania_id,version,activado_en,activado_por)
       values(v_id,1,clock_timestamp(),auth.uid());
     return v_id;');
  execute v_def;
end $actualizar$;

alter table public.harvest_asignaciones_lote add column asignado_en timestamptz not null default clock_timestamp();

-- Solo soporte puede conciliar datos previos, conservando ambas decisiones.
create table pda_privado.conciliaciones_lote (
  lote_id uuid primary key references public.harvest_lotes_tickets(id),
  campania_id uuid not null references public.campanias(id),
  trabajador_id uuid not null references public.trabajadores(id),
  operacion_id uuid not null unique,
  conciliado_por uuid not null,
  conciliado_en timestamptz not null default clock_timestamp(),
  motivo text not null,
  historial jsonb not null
);
alter table pda_privado.conciliaciones_lote enable row level security;
revoke all on pda_privado.conciliaciones_lote from public,anon,authenticated;

-- Incluso los clientes anteriores deben rechazar un lote con historia pendiente.
create function pda_privado.validar_asignacion_lote()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.harvest_lotes_tickets where id=new.lote_id for update;
  if exists(select 1 from public.asignaciones_ticket a join public.harvest_tickets t
      on t.codigo=a.codigo_ticket and t.campania_id=a.campania_id
      where t.lote_id=new.lote_id)
    and not exists(select 1 from pda_privado.conciliaciones_lote c
      where c.lote_id=new.lote_id and c.campania_id=new.campania_id
        and c.trabajador_id=new.trabajador_id and c.operacion_id=new.operacion_id) then
    raise exception 'El lote tiene asignaciones anteriores pendientes de conciliación';
  end if;
  return new;
end;
$$;
revoke all on function pda_privado.validar_asignacion_lote() from public,anon,authenticated;
create trigger harvest_asignacion_validar_historia before insert on public.harvest_asignaciones_lote
for each row execute function pda_privado.validar_asignacion_lote();

-- La PWA necesita la fecha real para consultar también lo asignado hoy.
do $snapshot$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.harvest_obtener_snapshot(uuid,character varying)'::regprocedure);
  if strpos(v_def, '''trabajadorId'',a.trabajador_id,''operacionId'',a.operacion_id)') = 0 then
    raise exception 'Contrato de snapshot no reconocido'; end if;
  execute replace(v_def, '''trabajadorId'',a.trabajador_id,''operacionId'',a.operacion_id)',
    '''trabajadorId'',a.trabajador_id,''operacionId'',a.operacion_id,''fechaAsignacion'',a.asignado_en)');
end $snapshot$;
notify pgrst,'reload schema';
commit;
