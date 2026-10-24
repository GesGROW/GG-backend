begin;

-- Registrar jaberos aún consume el validador de un operador. Conservar su
-- contrato jsonb y su fallback legacy, además del selector de campañas.
do $preservar$
declare v_def text;
begin
  if pg_get_function_result('public.validar_operador(varchar)'::regprocedure)<>'jsonb' then
    raise exception 'El validador operativo debe exponer el contrato jsonb del PWA'; end if;
  if to_regprocedure('public.iam_legacy_pwa_validar_operador_unico(varchar)') is null then
    v_def:=pg_get_functiondef('public.validar_operador(varchar)'::regprocedure);
    execute replace(v_def,'FUNCTION public.validar_operador(', 'FUNCTION public.iam_legacy_pwa_validar_operador_unico(');
  end if;
end $preservar$;

create or replace function public.validar_operador(p_dni varchar)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_datos jsonb; v_campania uuid;
begin
  perform public.iam_exigir_legacy_pda();
  v_datos:=public.iam_operador_pwa_campanias(p_dni);
  if v_datos is null then return public.iam_legacy_pwa_validar_operador_unico(p_dni); end if;
  v_campania:=public.campania_operativa_id();
  perform public.autorizar_operador_campania(p_dni,v_campania);
  return v_datos || jsonb_build_object('rol','SUPERVISORA');
end $$;

revoke all on function public.iam_legacy_pwa_validar_operador_unico(varchar) from public,anon,authenticated,service_role;
revoke all on function public.validar_operador(varchar) from public,anon,authenticated,service_role;
grant execute on function public.validar_operador(varchar) to anon;
notify pgrst,'reload schema';
commit;
