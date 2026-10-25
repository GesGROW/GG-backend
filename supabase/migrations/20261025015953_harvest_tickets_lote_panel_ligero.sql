begin;

-- The side panel needs two fields, not the general inventory's full lot DTO
-- and its assignment, worker, harvest record and per-lot counts for every row.
create function public.harvest_admin_tickets_lote(
  p_tenant_id uuid,p_campania_id uuid,p_lote_id uuid,p_offset integer default 0
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_total bigint; v_filas jsonb;
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if p_campania_id is null or p_lote_id is null or p_offset is null or p_offset<0 then
    raise exception 'Campaña, lote y paginación válidos requeridos';
  end if;
  if not exists(select 1 from public.harvest_lotes_tickets
    where id=p_lote_id and tenant_id=p_tenant_id and campania_id=p_campania_id) then
    raise exception using errcode='42501',message='Lote de otra campaña o empresa';
  end if;
  select count(*) into v_total from public.harvest_tickets
    where lote_id=p_lote_id and campania_id=p_campania_id and tenant_id=p_tenant_id;
  with pagina as materialized (
    select codigo from public.harvest_tickets
      where lote_id=p_lote_id and campania_id=p_campania_id and tenant_id=p_tenant_id
      order by codigo limit 50 offset p_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object('codigo',p.codigo,'estado',case when exists(
    select 1 from public.harvest_registros_cosecha r where r.codigo_ticket=p.codigo and r.tenant_id=p_tenant_id
      and r.campania_id=p_campania_id and r.lote_id=p_lote_id
  ) then 'UTILIZADO' else 'DISPONIBLE' end) order by p.codigo),'[]'::jsonb) into v_filas from pagina p;
  return jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'loteId',p_lote_id,
    'total',v_total,'filas',v_filas);
end $$;
revoke all on function public.harvest_admin_tickets_lote(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.harvest_admin_tickets_lote(uuid,uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
