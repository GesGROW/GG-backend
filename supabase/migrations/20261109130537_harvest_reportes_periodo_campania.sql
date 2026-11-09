begin;
-- Home is a campaign overview: count both containers as packages, while
-- preserving the crate-only contracts consumed by previous clients.
create function harvest_bonos_privado.reportes_inicio(p_tenant_id uuid,p_campania_id uuid,p_tipo text,p_recipiente text default 'GENERAL')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r jsonb; total bigint; hoy bigint; ranking jsonb;
begin
 if p_recipiente is null or p_recipiente not in ('GENERAL','JABA','JARRA') then raise exception 'Recipiente invalido'; end if;
 if p_tipo is null or p_tipo not in ('DASHBOARD','RANKING') then raise exception 'Reporte de inicio inválido'; end if;
 -- Reuse the exact authorization and metadata of the existing public report.
 r:=public.harvest_reportes_obtener(p_tenant_id,p_campania_id,p_tipo,'CAMPANIA');
 if p_tipo='DASHBOARD' then
  select count(*),count(*) filter(where (fecha_hora at time zone 'America/Lima')::date=(statement_timestamp() at time zone 'America/Lima')::date)
   into total,hoy from public.harvest_produccion_reportable where campania_id=p_campania_id and (p_recipiente='GENERAL' or coalesce(tipo_recipiente,'JABA')=p_recipiente);
  r:=jsonb_set(r,'{datos,resumen,total_jabas}',to_jsonb(total));
  r:=jsonb_set(r,'{datos,hoy,total_jabas}',to_jsonb(hoy));
 else
  with personas as (
   select t.dni cosechador_dni,coalesce(nullif(btrim(concat_ws(' ',t.nombres,t.apellidos)),''),'Sin nombre registrado') cosechador,
    count(*) total_jabas,max(p.fecha_hora) ultima_lectura
   from public.harvest_produccion_reportable p join public.trabajadores t on t.id=p.trabajador_id and t.tenant_id=p_tenant_id
   where p.campania_id=p_campania_id and (p_recipiente='GENERAL' or coalesce(p.tipo_recipiente,'JABA')=p_recipiente) group by t.id,t.dni,t.nombres,t.apellidos
  ), posiciones as (select *,dense_rank() over(order by total_jabas desc) posicion from personas)
  select coalesce(jsonb_agg(to_jsonb(p) order by total_jabas desc,cosechador,cosechador_dni),'[]'::jsonb) into ranking from posiciones p;
  r:=jsonb_set(r,'{datos,ranking}',ranking);
 end if;
 return jsonb_set(r,'{datos,unidad}',to_jsonb(case p_recipiente when 'GENERAL' then 'PAQUETES' when 'JARRA' then 'JARRAS' else 'JABAS' end));
end $$;
revoke all on function harvest_bonos_privado.reportes_inicio(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function harvest_bonos_privado.reportes_inicio(uuid,uuid,text,text) to authenticated;
create function public.harvest_reportes_inicio(p_tenant_id uuid,p_campania_id uuid,p_tipo text,p_recipiente text default 'GENERAL')
returns jsonb language sql security invoker set search_path='' as $$
 select harvest_bonos_privado.reportes_inicio(p_tenant_id,p_campania_id,p_tipo,p_recipiente)
$$;
revoke all on function public.harvest_reportes_inicio(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.harvest_reportes_inicio(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
