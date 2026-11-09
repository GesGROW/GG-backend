begin;

-- Private reference data is loaded once, outside source control. No personal
-- roster values or generated tenant/worker IDs belong in schema migrations.
create table harvest_bonos_privado.padron_trabajadores (
 tenant_id uuid not null references public.tenants(id), dni text not null check(dni ~ '^[0-9]{8}$'),
 codigo text not null check(length(btrim(codigo)) between 1 and 40 and codigo=btrim(codigo)),
 primary key(tenant_id,dni), unique(tenant_id,codigo)
);
create table harvest_bonos_privado.consumidores (
 tenant_id uuid not null references public.tenants(id), codigo text not null,
 nombre text not null, cultivo_codigo text not null,
 primary key(tenant_id,codigo)
);
create table harvest_bonos_privado.consumidores_lote (
 tenant_id uuid not null references public.tenants(id), campania_id uuid not null references public.campanias(id),
 lote_id uuid not null references public.lotes(id), variedad_id uuid not null references public.variedades(id),
 consumidor text not null,
 primary key(tenant_id,campania_id,lote_id,variedad_id),
 foreign key(tenant_id,consumidor) references harvest_bonos_privado.consumidores(tenant_id,codigo)
);
create index on harvest_bonos_privado.consumidores_lote(campania_id);
create index on harvest_bonos_privado.consumidores_lote(lote_id);
create index on harvest_bonos_privado.consumidores_lote(variedad_id);
create index on harvest_bonos_privado.consumidores_lote(tenant_id,consumidor);
create table harvest_bonos_privado.labores_rol (
 tenant_id uuid not null references public.tenants(id), rol text not null check(rol in ('COSECHADOR','JABERO')),
 labor text not null, actividad text,
 primary key(tenant_id,rol)
);
alter table harvest_bonos_privado.padron_trabajadores enable row level security;
alter table harvest_bonos_privado.consumidores enable row level security;
alter table harvest_bonos_privado.consumidores_lote enable row level security;
alter table harvest_bonos_privado.labores_rol enable row level security;
revoke all on harvest_bonos_privado.padron_trabajadores,harvest_bonos_privado.consumidores,
 harvest_bonos_privado.consumidores_lote,harvest_bonos_privado.labores_rol from public,anon,authenticated,service_role;

create function harvest_bonos_privado.codigo_desde_padron() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.codigo_externo is null then
  select p.codigo into new.codigo_externo from harvest_bonos_privado.padron_trabajadores p
   where p.tenant_id=new.tenant_id and p.dni=new.dni;
 end if;
 return new;
end $$;
revoke all on function harvest_bonos_privado.codigo_desde_padron() from public,anon,authenticated,service_role;
create trigger codigo_desde_padron before insert on public.trabajadores
 for each row execute function harvest_bonos_privado.codigo_desde_padron();

do $$ declare d text; begin
 d:=pg_get_functiondef('public.harvest_admin_trabajador_campania(uuid,uuid,text,uuid)'::regprocedure);
 if position('''rol'',r.rol' in d)=0 then raise exception 'Ficha de trabajador no reconocida'; end if;
 execute replace(d,'''rol'',r.rol','''codigoExterno'',t.codigo_externo,''rol'',r.rol');
end $$;

-- Names, participation and external code are committed atomically under the
-- existing crop-management permission; a JABERO's daily grant is not renewed.
create function harvest_bonos_privado.editar_trabajador_con_codigo(
 p_tenant_id uuid,p_campania_id uuid,p_rol text,p_participacion_id uuid,
 p_dni text,p_nombres text,p_apellidos text,p_activo boolean,p_codigo_externo text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare d jsonb;
begin
 if p_codigo_externo is null or length(btrim(p_codigo_externo))>40 then raise exception 'Código de trabajador inválido'; end if;
 d:=public.harvest_admin_editar_trabajador_campania(p_tenant_id,p_campania_id,p_rol,p_participacion_id,p_dni,p_nombres,p_apellidos,p_activo);
 update public.trabajadores set codigo_externo=nullif(btrim(p_codigo_externo),'')
  where tenant_id=p_tenant_id and id=(d->>'id')::uuid;
 return public.harvest_admin_trabajador_campania(p_tenant_id,p_campania_id,p_rol,p_participacion_id);
exception when unique_violation then raise exception 'El código ya pertenece a otro trabajador de esta empresa';
end $$;
create function public.harvest_admin_editar_trabajador_con_codigo(
 p_tenant_id uuid,p_campania_id uuid,p_rol text,p_participacion_id uuid,
 p_dni text,p_nombres text,p_apellidos text,p_activo boolean,p_codigo_externo text)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.editar_trabajador_con_codigo(p_tenant_id,p_campania_id,p_rol,p_participacion_id,
  p_dni,p_nombres,p_apellidos,p_activo,p_codigo_externo)
$$;

create function harvest_bonos_privado.reportes_tareo_rango(
 p_tenant_id uuid,p_campania_id uuid,p_desde date,p_hasta date,p_trabajador_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare resultado jsonb;
begin
 perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
 perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
 if p_desde is null or p_hasta is null or not isfinite(p_desde) or not isfinite(p_hasta) or p_desde>p_hasta
  or p_hasta>(statement_timestamp() at time zone 'America/Lima')::date or p_hasta-p_desde>3660 then
  raise exception 'Período de tareo inválido'; end if;
 if p_trabajador_id is not null and not exists(select 1 from public.trabajadores where tenant_id=p_tenant_id and id=p_trabajador_id) then
  raise exception using errcode='42501',message='Trabajador de otra empresa'; end if;
 with produccion as materialized (
  select p.*,(p.fecha_hora at time zone 'America/Lima')::date fecha
  from public.harvest_produccion_reportable p
  join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  where p.campania_id=p_campania_id
   and p.fecha_hora>=(p_desde::timestamp at time zone 'America/Lima')
   and p.fecha_hora<((p_hasta+1)::timestamp at time zone 'America/Lima')
 ), personas as (
  select p.trabajador_id,p.lote_id,p.variedad_id,p.fecha,'COSECHADOR'::text rol from produccion p
  union all
  select r.trabajador_id,p.lote_id,p.variedad_id,p.fecha,'JABERO' from produccion p
   join public.sesiones_lectura s on s.id=p.sesion_id and s.tenant_id=p_tenant_id
   join public.trabajador_campania_rol r on r.id=s.jabero_rol_id and r.tenant_id=p_tenant_id and r.campania_id=p_campania_id and r.rol='JABERO'
 ), hechos as (
  select distinct trabajador_id,lote_id,variedad_id,rol,
   fecha-((extract(isodow from fecha)::integer+3)%7) semana
  from personas where p_trabajador_id is null or trabajador_id=p_trabajador_id
 ), filas as (
  select h.trabajador_id "trabajadorId",t.codigo_externo "codigoTrabajador",h.rol,
   btrim(concat_ws(' ',t.apellidos,t.nombres)) nombre,h.lote_id "loteId",coalesce(nullif(l.nombre,''),l.codigo) lote,
   h.variedad_id "variedadId",v.nombre variedad,
   to_char(h.semana,'YYYYMM')||'-'||to_char(h.semana,'IW') periodo,lr.actividad,lr.labor,cl.consumidor
  from hechos h join public.trabajadores t on t.id=h.trabajador_id and t.tenant_id=p_tenant_id
  join public.lotes l on l.id=h.lote_id and l.tenant_id=p_tenant_id
  left join public.variedades v on v.id=h.variedad_id and v.tenant_id=p_tenant_id
  left join harvest_bonos_privado.labores_rol lr on lr.tenant_id=p_tenant_id and lr.rol=h.rol
  left join harvest_bonos_privado.consumidores_lote cl on cl.tenant_id=p_tenant_id and cl.campania_id=p_campania_id
   and cl.lote_id=h.lote_id and cl.variedad_id=h.variedad_id
 ) select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo','TAREO',
  'datos',jsonb_build_object('desde',p_desde,'hasta',p_hasta,
   'filas',coalesce((select jsonb_agg(to_jsonb(f) order by periodo,nombre,lote,variedad,rol,"trabajadorId","loteId","variedadId") from filas f),'[]'::jsonb))) into resultado;
 return resultado;
end $$;
create function public.harvest_reportes_tareo_rango(
 p_tenant_id uuid,p_campania_id uuid,p_desde date,p_hasta date,p_trabajador_id uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.reportes_tareo_rango(p_tenant_id,p_campania_id,p_desde,p_hasta,p_trabajador_id)
$$;

revoke all on function harvest_bonos_privado.editar_trabajador_con_codigo(uuid,uuid,text,uuid,text,text,text,boolean,text),
 public.harvest_admin_editar_trabajador_con_codigo(uuid,uuid,text,uuid,text,text,text,boolean,text),
 harvest_bonos_privado.reportes_tareo_rango(uuid,uuid,date,date,uuid),public.harvest_reportes_tareo_rango(uuid,uuid,date,date,uuid)
 from public,anon,authenticated,service_role;
grant execute on function harvest_bonos_privado.editar_trabajador_con_codigo(uuid,uuid,text,uuid,text,text,text,boolean,text),
 public.harvest_admin_editar_trabajador_con_codigo(uuid,uuid,text,uuid,text,text,text,boolean,text),
 harvest_bonos_privado.reportes_tareo_rango(uuid,uuid,date,date,uuid),public.harvest_reportes_tareo_rango(uuid,uuid,date,date,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
