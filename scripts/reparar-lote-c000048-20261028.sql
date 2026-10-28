-- Reparación autorizada: conservar a la persona de C00004801 y ambas historias.
-- Requiere 20261028185125_harvest_asignacion_lote_obligatoria.sql.
-- Ejecutar como soporte/postgres; aborta si el caso cambió desde el diagnóstico.
begin;
do $reparar$
declare
  v_campania uuid := '9e030328-bba9-4622-a091-df0bdb4eadf0';
  v_tenant uuid := 'e72f3272-105a-4da1-868a-0cc326e2bd4f';
  v_lote uuid := '1d043f76-c0cc-4d06-a079-48a6c99b5d39';
  v_usuario uuid := '11a42c3b-293a-48a8-9b16-1957da8ac0b7';
  v_trabajador uuid; v_fecha timestamptz; v_historial jsonb;
  v_operacion uuid := gen_random_uuid();
begin
  perform 1 from public.campanias where id=v_campania and tenant_id=v_tenant and estado='ACTIVA' for update;
  if not found then raise exception 'Campaña inesperada'; end if;
  perform 1 from public.harvest_lotes_tickets where id=v_lote and campania_id=v_campania and tenant_id=v_tenant for update;
  if not found then raise exception 'Lote inesperado'; end if;
  perform 1 from public.asignaciones_ticket where campania_id=v_campania for update;
  if exists(select 1 from public.harvest_cutovers where campania_id=v_campania)
    or exists(select 1 from public.harvest_asignaciones_lote where campania_id=v_campania)
    or exists(select 1 from public.harvest_registros_cosecha where campania_id=v_campania)
    or exists(select 1 from public.lecturas_jaba j join public.asignaciones_ticket a on a.id=j.asignacion_ticket_id where a.campania_id=v_campania)
    or (select count(*) from public.asignaciones_ticket where campania_id=v_campania)<>2
    or (select count(*) from public.harvest_tickets where lote_id=v_lote)<>10 then
    raise exception 'El caso cambió: revisar antes de conciliar';
  end if;
  select r.trabajador_id,a.fecha_asignacion into strict v_trabajador,v_fecha
    from public.asignaciones_ticket a join public.trabajador_campania_rol r on r.id=a.cosechador_rol_id
    where a.id='0b6b5bc6-2b5a-4166-aeef-824218ed6fe1' and a.codigo_ticket='C00004801'
      and a.campania_id=v_campania and a.tenant_id=v_tenant and a.activo;
  if v_trabajador<>'d54242fd-7b96-4be8-92ef-731a96528bb1'::uuid then raise exception 'Primera persona inesperada'; end if;
  select jsonb_agg(to_jsonb(a)||jsonb_build_object('trabajador_id',r.trabajador_id) order by a.fecha_asignacion,a.id)
    into v_historial from public.asignaciones_ticket a
    join public.trabajador_campania_rol r on r.id=a.cosechador_rol_id
    join public.harvest_tickets t on t.codigo=a.codigo_ticket and t.campania_id=a.campania_id
    where t.lote_id=v_lote and a.tenant_id=v_tenant;
  if jsonb_array_length(v_historial)<>2 then raise exception 'Historial inesperado'; end if;
  insert into pda_privado.conciliaciones_lote(lote_id,campania_id,trabajador_id,operacion_id,conciliado_por,motivo,historial)
    values(v_lote,v_campania,v_trabajador,v_operacion,v_usuario,
      'E012: autorización explícita del titular para conservar a la persona de la primera asignación C00004801; ambas decisiones originales se conservan como historial.',v_historial);
  insert into public.harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id,tenant_id,asignado_en)
    values(v_lote,v_campania,v_trabajador,v_operacion,v_tenant,v_fecha);
  insert into public.harvest_cutovers(campania_id,version,activado_en,activado_por,tenant_id)
    values(v_campania,1,clock_timestamp(),v_usuario,v_tenant);
end $reparar$;
commit;
