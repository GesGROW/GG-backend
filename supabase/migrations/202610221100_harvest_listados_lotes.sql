begin;

-- La fecha de asignación es la del recibo confirmado por el servidor. No se
-- modifica el hecho histórico ni se sustituye por la creación del lote.
-- Se conserva el cuerpo instalado y sus guardas de pertenencia al cultivo.
do $listados$
declare v_firma regprocedure; v_original text; v_nuevo text;
begin
  v_firma:=to_regprocedure('public.harvest_admin_dto(uuid,text,text)');
  if v_firma is null or to_regclass('public.operaciones_pda_procesadas') is null then
    raise exception 'Aplique 202610141300_portal_harvest_admin.sql antes de los listados de lotes';
  end if;
  v_original:=pg_get_functiondef(v_firma);
  if position('''asignadoEn''' in v_original)=0 then
    v_nuevo:=replace(v_original,'''operacionId'',a.operacion_id,',
      '''operacionId'',a.operacion_id,''asignadoEn'',(select p.creado_en from public.operaciones_pda_procesadas p where p.id=a.operacion_id and p.tenant_id=a.tenant_id and p.tipo=''ASIGNAR_TICKET''),');
    if v_nuevo=v_original then raise exception 'No se pudo extender la fecha de asignación; revise la versión de harvest_admin_dto'; end if;
    execute v_nuevo;
  end if;

  v_firma:=to_regprocedure('public.harvest_admin_indice(uuid,text)');
  if v_firma is null then raise exception 'Falta harvest_admin_indice; aplique F7.4'; end if;
  v_original:=pg_get_functiondef(v_firma);
  if position('''ASIGNADO'',l.creado_en' in v_original)>0 then
    v_nuevo:=replace(v_original,'''ASIGNADO'',l.creado_en',
      '''ASIGNADO'',(select p.creado_en from public.operaciones_pda_procesadas p where p.id=a.operacion_id and p.tenant_id=a.tenant_id and p.tipo=''ASIGNAR_TICKET'')');
    execute v_nuevo;
  end if;
end $listados$;

notify pgrst,'reload schema';
commit;
