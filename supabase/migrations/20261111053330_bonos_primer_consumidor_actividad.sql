begin;
-- Activity confirmed for this harvest integration; preserve each company's labor codes.
update harvest_bonos_privado.labores_rol set actividad='016'
where rol in ('COSECHADOR','JABERO') and labor in ('101333','160003');
-- Select the first harvest before looking up its consumer. An unmapped first
-- harvest must not silently select a later consumer. Bonuses remain unchanged.
create or replace function harvest_bonos_privado.reportes_tareo_rango(
 p_tenant_id uuid,p_campania_id uuid,p_desde date,p_hasta date,p_trabajador_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare base jsonb; resultado jsonb;
begin
 base:=harvest_bonos_privado.harvest_reportes_bonos(p_tenant_id,p_campania_id,p_desde,p_hasta,p_trabajador_id);
 if p_desde is null or p_hasta is null then raise exception 'Fechas requeridas'; end if;
 with diaria as (
  select (x->>'trabajadorId')::uuid trabajador,(x->>'fecha')::date fecha,
   (x->>'bono')::numeric bono
  from jsonb_array_elements(base->'datos'->'detalle') x
 ), dias as (
  select *,fecha-((extract(isodow from fecha)::int+3)%7) semana from diaria
 ), semanas as (
  select trabajador,semana,
   jsonb_agg(jsonb_build_object('fecha',fecha,'bono',bono) order by fecha) dias,
   sum(bono) total
  from dias group by trabajador,semana
 ), filas as (
  select s.trabajador "trabajadorId",t.codigo_externo "codigoTrabajador",t.dni,
   coalesce(nullif(btrim(concat_ws(' ',t.apellidos,t.nombres)),''),'Sin nombre registrado') nombre,
   to_char(s.semana,'YYYYMM')||'-'||to_char(s.semana,'IW') periodo,
   s.semana "semanaInicio",s.dias,s.total "totalSemanal",
   lr.actividad,lr.labor,
   coalesce(m.consumidor,'') consumidor
  from semanas s join public.trabajadores t on t.id=s.trabajador and t.tenant_id=p_tenant_id
  left join harvest_bonos_privado.labores_rol lr on lr.tenant_id=p_tenant_id and lr.rol='COSECHADOR'
  left join lateral (
   select cl.consumidor
   from (select p.lote_id,p.variedad_id from public.harvest_produccion_reportable p
    join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id
    where p.campania_id=p_campania_id and p.trabajador_id=s.trabajador
     and p.fecha_hora >= (s.semana::timestamp at time zone 'America/Lima')
     and p.fecha_hora < ((s.semana+7)::timestamp at time zone 'America/Lima')
    order by p.fecha_hora,p.fuente,p.hecho_id limit 1) h
   left join harvest_bonos_privado.consumidores_lote cl on cl.tenant_id=p_tenant_id and cl.campania_id=p_campania_id
    and cl.lote_id=h.lote_id and cl.variedad_id=h.variedad_id
  ) m on true
 ) select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo','TAREO',
  'datos',jsonb_build_object('desde',p_desde,'hasta',p_hasta,'totalBono',base->'datos'->'totalBono',
   'filas',coalesce((select jsonb_agg(to_jsonb(f) order by "semanaInicio",nombre,"trabajadorId") from filas f),'[]'::jsonb))) into resultado;
 return resultado;
end $$;
comment on function harvest_bonos_privado.reportes_tareo_rango(uuid,uuid,date,date,uuid)
 is 'Bonos diarios completos; consumidor de la primera cosecha del trabajador en cada semana jueves-miercoles, dentro de la campania.';
notify pgrst,'reload schema';
commit;
