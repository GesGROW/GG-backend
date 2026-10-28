begin;

-- Los listados y sus filtros deben consultar el hecho por lote. El recibo
-- legacy no existe en asignaciones nuevas ni en conciliaciones auditadas.
do $fechas$
declare v_firma regprocedure; v_def text; v_anterior text;
begin
  v_anterior := '(select p.creado_en from public.operaciones_pda_procesadas p where p.id=a.operacion_id and p.tenant_id=a.tenant_id and p.tipo=''ASIGNAR_TICKET'')';
  foreach v_firma in array array[
    'public.harvest_admin_dto(uuid,text,text)'::regprocedure,
    'public.harvest_admin_indice(uuid,text)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_firma);
    if strpos(v_def,v_anterior)=0 then raise exception 'Fecha de listado no reconocida: %',v_firma; end if;
    execute replace(v_def,v_anterior,'a.asignado_en');
  end loop;
end $fechas$;

notify pgrst,'reload schema';
commit;
