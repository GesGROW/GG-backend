begin;
create function harvest_bonos_privado.configuracion_consumidores(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 with relaciones as (
  select l.id lote_id,lv.variedad_id from public.lotes l join public.lote_variedades lv on lv.lote_id=l.id and lv.tenant_id=l.tenant_id
   where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  union select l.id,l.variedad_id from public.lotes l where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id and l.variedad_id is not null
 ), datos as (
  select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,
   'catalogo',coalesce((select jsonb_agg(jsonb_build_object('codigo',codigo,'nombre',nombre) order by codigo)
    from harvest_bonos_privado.consumidores where tenant_id=p_tenant_id),'[]'::jsonb),
   'filas',coalesce((select jsonb_agg(jsonb_build_object('loteId',r.lote_id,'variedadId',r.variedad_id,'lote',l.nombre,'variedad',v.nombre,'consumidor',coalesce(m.consumidor,'')) order by l.nombre,v.nombre,r.lote_id,r.variedad_id)
    from relaciones r join public.lotes l on l.id=r.lote_id join public.variedades v on v.id=r.variedad_id and v.tenant_id=p_tenant_id
    left join harvest_bonos_privado.consumidores_lote m on m.tenant_id=p_tenant_id and m.campania_id=p_campania_id and m.lote_id=r.lote_id and m.variedad_id=r.variedad_id),'[]'::jsonb)) d
 ) select d||jsonb_build_object('revision',md5(d::text)) from datos
$$;
revoke all on function harvest_bonos_privado.configuracion_consumidores(uuid,uuid) from public,anon,authenticated,service_role;

create function harvest_bonos_privado.admin_consumidores(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare actual jsonb; r jsonb;
begin
 perform public.harvest_admin_exigir(p_tenant_id,p_campania_id,p_datos is not null);
 perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
 perform pg_advisory_xact_lock(hashtextextended('harvest.tareo.consumidores:'||p_campania_id::text,0));
 actual:=harvest_bonos_privado.configuracion_consumidores(p_tenant_id,p_campania_id);
 if p_datos is null then return actual; end if;
 if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_datos->'filas') is distinct from 'array' then
  raise exception 'Correspondencias inválidas'; end if;
 if jsonb_array_length(p_datos->'filas')>1000 then raise exception 'Demasiadas correspondencias'; end if;
 if p_datos->>'revision' is distinct from actual->>'revision' then raise exception 'Las correspondencias cambiaron. Recarga la configuración'; end if;
 for r in select value from jsonb_array_elements(p_datos->'filas') loop
  if jsonb_typeof(r->'consumidor') is distinct from 'string' or not exists(
   select 1 from jsonb_array_elements(actual->'filas') f where f->>'loteId'=r->>'loteId' and f->>'variedadId'=r->>'variedadId') then
   raise exception using errcode='42501',message='Lote o variedad ajenos a la campaña'; end if;
  if r->>'consumidor'='' then
   delete from harvest_bonos_privado.consumidores_lote where tenant_id=p_tenant_id and campania_id=p_campania_id
    and lote_id=(r->>'loteId')::uuid and variedad_id=(r->>'variedadId')::uuid;
  else
   if not exists(select 1 from harvest_bonos_privado.consumidores where tenant_id=p_tenant_id and codigo=r->>'consumidor') then
    raise exception 'Consumidor ajeno al catálogo de esta empresa'; end if;
   insert into harvest_bonos_privado.consumidores_lote(tenant_id,campania_id,lote_id,variedad_id,consumidor)
    values(p_tenant_id,p_campania_id,(r->>'loteId')::uuid,(r->>'variedadId')::uuid,r->>'consumidor')
    on conflict(tenant_id,campania_id,lote_id,variedad_id) do update set consumidor=excluded.consumidor;
  end if;
 end loop;
 return harvest_bonos_privado.configuracion_consumidores(p_tenant_id,p_campania_id);
end $$;
create function public.harvest_admin_tareo_consumidores(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.admin_consumidores(p_tenant_id,p_campania_id,p_datos)
$$;
revoke all on function harvest_bonos_privado.admin_consumidores(uuid,uuid,jsonb),public.harvest_admin_tareo_consumidores(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function harvest_bonos_privado.admin_consumidores(uuid,uuid,jsonb),public.harvest_admin_tareo_consumidores(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
