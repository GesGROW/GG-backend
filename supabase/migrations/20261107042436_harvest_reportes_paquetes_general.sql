begin;
-- General is a report-only unit: one jar or one crate equals one package.
-- Bonus rules remain independent and are not modified by this migration.
do $$ declare definicion text; begin
 select pg_get_functiondef('harvest_bonos_privado.reportes_recipiente(uuid,uuid,text,uuid,uuid,date,date,text)'::regprocedure)
 into definicion;
 if position('p_recipiente not in (''JABA'',''JARRA'')' in definicion)=0
  or position('coalesce(p.tipo_recipiente,''JABA'')=p_recipiente' in definicion)=0 then
  raise exception 'La definición de reportes no corresponde a la versión esperada';
 end if;
 definicion:=replace(definicion,'p_recipiente not in (''JABA'',''JARRA'')','p_recipiente not in (''GENERAL'',''JABA'',''JARRA'')');
 definicion:=replace(definicion,'coalesce(p.tipo_recipiente,''JABA'')=p_recipiente',
  '(p_recipiente=''GENERAL'' or coalesce(p.tipo_recipiente,''JABA'')=p_recipiente)');
 execute definicion;
end $$;
notify pgrst,'reload schema';
commit;
