begin;
-- A container filter inside the lot-count subquery referenced the outer fact.
-- PostgreSQL consequently lifted count(*) into the outer aggregate, making the
-- scalar subquery return one row per configured lot.
do $$ declare definicion text; begin
 select pg_get_functiondef('public.harvest_proyectar_resumen(uuid,text)'::regprocedure) into definicion;
 definicion:=replace(definicion,
  '(select count(*) filter (where tipo_recipiente is distinct from ''JARRA'') from public.lotes l where l.campania_id=p_campania)',
  '(select count(*) from public.lotes l where l.campania_id=p_campania)');
 execute definicion;
end $$;
notify pgrst,'reload schema';
commit;
