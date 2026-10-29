begin;

-- El código visible procede del snapshot de impresión, no del UUID del lote.
-- Ampliar sólo el texto buscable conserva las guardas de cultivo/empresa,
-- fechas, estados, paginación y privilegios de la función instalada.
do $busqueda$
declare
  v_firma regprocedure := 'public.harvest_admin_indice(uuid,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
  v_original text;
  v_reemplazo text;
begin
  if to_regclass('public.harvest_impresion_lotes') is null then
    raise exception 'Aplique la migración de impresión de tickets antes de ampliar la búsqueda';
  end if;

  v_original := 'a.trabajador_id,l.id::text||'' ''||c.codigo,';
  v_reemplazo := 'a.trabajador_id,concat_ws('' '',l.id::text,c.codigo,(select i.codigo_lote from public.harvest_impresion_lotes i where i.lote_id=l.id)),';
  if strpos(v_def,v_original)>0 then
    v_def := replace(v_def,v_original,v_reemplazo);
  elsif strpos(v_def,v_reemplazo)=0 then
    raise exception 'Índice de lotes generados no reconocido; revise harvest_admin_indice';
  end if;

  v_original := 'concat_ws('' '',w.dni,w.nombres,w.apellidos),''ASIGNADO''';
  v_reemplazo := 'concat_ws('' '',w.dni,w.nombres,w.apellidos,(select i.codigo_lote from public.harvest_impresion_lotes i where i.lote_id=l.id)),''ASIGNADO''';
  if strpos(v_def,v_original)>0 then
    v_def := replace(v_def,v_original,v_reemplazo);
  elsif strpos(v_def,v_reemplazo)=0 then
    raise exception 'Índice de lotes asignados no reconocido; revise harvest_admin_indice';
  end if;

  execute v_def;
end $busqueda$;

notify pgrst,'reload schema';
commit;
