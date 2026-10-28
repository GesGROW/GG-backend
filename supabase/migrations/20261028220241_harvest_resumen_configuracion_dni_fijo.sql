begin;

-- El resumen conserva las métricas de producción y añade el estado registrado
-- de la campaña, disponible incluso antes de la primera lectura.
do $resumen$
declare d text;
begin
  d:=pg_get_functiondef('public.harvest_proyectar_resumen(uuid,text)'::regprocedure);
  if strpos(d,'''total_jabas'',count(*)')=0 then raise exception 'Contrato de resumen no reconocido'; end if;
  execute replace(d,'''total_jabas'',count(*)',
    '''total_cosechadores_registrados'',(select count(distinct r.trabajador_id) from public.trabajador_campania_rol r join public.trabajadores t on t.id=r.trabajador_id and t.tenant_id=r.tenant_id where r.campania_id=p_campania and r.rol=''COSECHADOR'' and r.activo and t.activo),
     ''total_jaberos_registrados'',(select count(distinct r.trabajador_id) from public.trabajador_campania_rol r join public.trabajadores t on t.id=r.trabajador_id and t.tenant_id=r.tenant_id where r.campania_id=p_campania and r.rol=''JABERO'' and r.activo and t.activo),
     ''total_lotes_configurados'',(select count(*) from public.lotes l where l.campania_id=p_campania),
     ''total_variedades_configuradas'',(select count(distinct x.variedad_id) from (
        select l.variedad_id from public.lotes l where l.campania_id=p_campania
        union select lv.variedad_id from public.lote_variedades lv join public.lotes l on l.id=lv.lote_id and l.tenant_id=lv.tenant_id where l.campania_id=p_campania
      ) x where x.variedad_id is not null),
     ''total_jabas'',count(*)');
end $resumen$;

-- Mantener la firma publicada para clientes anteriores; el DNI recibido solo
-- puede coincidir con el ya persistido. La comprobación ocurre bajo el bloqueo.
do $dni$
declare d text;
begin
  d:=pg_get_functiondef('public.harvest_admin_editar_trabajador_campania(uuid,uuid,text,uuid,text,text,text,boolean)'::regprocedure);
  if strpos(d,'update public.trabajadores set dni=btrim(p_dni),')=0 then raise exception 'Contrato de edición no reconocido'; end if;
  execute replace(d,'update public.trabajadores set dni=btrim(p_dni),',
    'if btrim(p_dni) is distinct from (select dni from public.trabajadores where id=v_trabajador and tenant_id=p_tenant_id) then
       raise exception ''El DNI del trabajador no se puede modificar'';
     end if;
     update public.trabajadores set ');
end $dni$;

notify pgrst,'reload schema';
commit;
