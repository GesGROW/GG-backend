begin;
create table harvest_bonos_privado.correcciones_recipientes (
 registro_id uuid primary key references public.harvest_registros_cosecha(id),
 tenant_id uuid not null references public.tenants(id),
 campania_id uuid not null references public.campanias(id),
 tipo_recipiente text not null check(tipo_recipiente in ('JABA','JARRA')),
 peso_kg numeric(4,1) generated always as (case tipo_recipiente when 'JARRA' then 1.3 else 2.4 end) stored,
 original jsonb not null,
 motivo text not null check(length(btrim(motivo))>0),
 creado_en timestamptz not null default clock_timestamp(),
 creado_por text not null default current_user
);
alter table harvest_bonos_privado.correcciones_recipientes enable row level security;
revoke all on harvest_bonos_privado.correcciones_recipientes from public,anon,authenticated,service_role;
create index correcciones_recipientes_campania_idx on harvest_bonos_privado.correcciones_recipientes(campania_id);
create index correcciones_recipientes_tenant_idx on harvest_bonos_privado.correcciones_recipientes(tenant_id);
create function harvest_bonos_privado.validar_correccion_recipiente() returns trigger
language plpgsql set search_path='' as $$
declare registro public.harvest_registros_cosecha%rowtype;
begin
 if tg_op<>'INSERT' then raise exception 'Las correcciones de recipiente son inmutables'; end if;
 select * into registro from public.harvest_registros_cosecha where id=new.registro_id;
 if not found or registro.tenant_id<>new.tenant_id or registro.campania_id<>new.campania_id then
  raise exception 'La corrección no corresponde a la empresa y campaña del registro';
 end if;
 new.original:=jsonb_build_object('tipo_recipiente',registro.tipo_recipiente,'peso_kg',registro.peso_kg);
 return new;
end $$;
revoke all on function harvest_bonos_privado.validar_correccion_recipiente() from public,anon,authenticated,service_role;
create trigger validar_correccion before insert or update or delete on harvest_bonos_privado.correcciones_recipientes
 for each row execute function harvest_bonos_privado.validar_correccion_recipiente();

create or replace view public.harvest_produccion_reportable as
select a.campania_id, 'LEGACY'::text as fuente, j.id as hecho_id,
 r.trabajador_id,j.sesion_id,s.lote_id,s.variedad_id,j.fecha_hora,
 0::integer as version_produccion,j.tipo_recipiente,j.peso_kg
from public.lecturas_jaba j
join public.asignaciones_ticket a on a.id=j.asignacion_ticket_id
join public.trabajador_campania_rol r on r.id=a.cosechador_rol_id and r.campania_id=a.campania_id
join public.sesiones_lectura s on s.id=j.sesion_id
join public.lotes l on l.id=s.lote_id and l.campania_id=a.campania_id
union all
select c.campania_id,'HARVEST'::text,c.id,c.trabajador_id,
 c.sesion_id,s.lote_id,s.variedad_id,c.fecha_hora,c.version_produccion,
 coalesce(x.tipo_recipiente,c.tipo_recipiente),coalesce(x.peso_kg,c.peso_kg)
from public.harvest_registros_cosecha c
join public.harvest_cutovers corte on corte.campania_id=c.campania_id and corte.version=c.version_produccion
join public.sesiones_lectura s on s.id=c.sesion_id
join public.lotes l on l.id=s.lote_id and l.campania_id=c.campania_id
left join harvest_bonos_privado.correcciones_recipientes x
 on x.registro_id=c.id and x.tenant_id=c.tenant_id and x.campania_id=c.campania_id
where c.creado_en>=corte.activado_en;
revoke all on public.harvest_produccion_reportable from public,anon,authenticated,service_role;

do $$ declare definicion text; begin
 select pg_get_functiondef('harvest_bonos_privado.reportes_recipiente(uuid,uuid,text,uuid,uuid,date,date,text)'::regprocedure) into definicion;
 execute replace(definicion,'(select sum(peso_kg) from hechos)',
  '(select case when count(*)=0 then 0 else sum(peso_kg) end from hechos)');
 select pg_get_functiondef('harvest_bonos_privado.harvest_reportes_bonos(uuid,uuid,date,date,uuid)'::regprocedure) into definicion;
 execute replace(definicion,'(select sum("kgEstimados") from detalle)',
  '(select case when count(*)=0 then 0 else sum("kgEstimados") end from detalle)');
end $$;
notify pgrst,'reload schema';
commit;
