begin;
-- PDA requests use the existing device credential + operator headers, without
-- an account JWT. Authorization still runs through autorizar_operador_campania.
do $$ declare d text; begin
 d:=pg_get_functiondef('harvest_bonos_privado.reportes_pda(uuid,varchar,text,text)'::regprocedure);
 execute replace(d,'if auth.uid() is null then raise exception ''Autenticación requerida'' using errcode=''42501''; end if;','');
end $$;
grant execute on function harvest_bonos_privado.reportes_pda(uuid,varchar,text,text) to anon;
grant execute on function public.harvest_reportes_pda(uuid,varchar,text,text) to anon;
notify pgrst,'reload schema';
commit;
