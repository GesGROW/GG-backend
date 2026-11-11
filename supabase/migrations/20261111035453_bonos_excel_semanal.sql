begin;


alter table public.trabajadores add column codigo_externo text
  check (codigo_externo is null or (codigo_externo=btrim(codigo_externo) and length(codigo_externo) between 1 and 40));
create unique index trabajadores_codigo_externo_tenant_idx on public.trabajadores(tenant_id,codigo_externo)
  where codigo_externo is not null;

-- Explicit external mappings. Never derive a consumer from the physical lot code.
create table harvest_bonos_privado.tareo_imputaciones (
  tenant_id uuid not null references public.tenants(id),
  campania_id uuid not null references public.campanias(id),
  lote_id uuid not null references public.lotes(id),
  variedad_id uuid not null references public.variedades(id),
  actividad text not null check(length(btrim(actividad)) between 1 and 60),
  labor text not null check(length(btrim(labor)) between 1 and 60),
  consumidor text not null check(length(btrim(consumidor)) between 1 and 60),
  actualizado_en timestamptz not null default clock_timestamp(),
  usuario_id uuid not null references public.identity_usuarios(id),
  primary key(tenant_id,campania_id,lote_id,variedad_id)
);
alter table harvest_bonos_privado.tareo_imputaciones enable row level security;
revoke all on harvest_bonos_privado.tareo_imputaciones from public,anon,authenticated,service_role;
create index on harvest_bonos_privado.tareo_imputaciones(campania_id);
create index on harvest_bonos_privado.tareo_imputaciones(lote_id);
create index on harvest_bonos_privado.tareo_imputaciones(variedad_id);
create index on harvest_bonos_privado.tareo_imputaciones(usuario_id);

-- Keep the existing workforce authorization and response shape, adding one field.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.workforce_admin_dto(uuid,uuid)'::regprocedure);
 if position('''activo'',activo' in d)=0 then raise exception 'DTO de trabajadores no reconocido'; end if;
 execute replace(d,'''activo'',activo','''activo'',activo,''codigoExterno'',codigo_externo');
 d:=pg_get_functiondef('public.workforce_cosecha_listar(uuid,jsonb)'::regprocedure);
 if position('t.id,t.dni,t.nombres,t.apellidos,t.activo,' in d)=0 then raise exception 'Listado de trabajadores no reconocido'; end if;
 execute replace(d,'t.id,t.dni,t.nombres,t.apellidos,t.activo,','t.id,t.dni,t.nombres,t.apellidos,t.activo,t.codigo_externo as "codigoExterno",');
end $$;

create function harvest_bonos_privado.codigo_trabajador(p_tenant_id uuid,p_id uuid,p_codigo text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.workforce_admin_exigir_trabajador(p_tenant_id,p_id);
 if p_codigo is null or length(btrim(p_codigo))>40 then raise exception 'Código externo inválido'; end if;
 update public.trabajadores set codigo_externo=nullif(btrim(p_codigo),'') where tenant_id=p_tenant_id and id=p_id;
 return public.workforce_admin_dto(p_tenant_id,p_id);
exception when unique_violation then raise exception 'El código externo ya está asignado a otro trabajador de esta empresa';
end $$;
create function public.workforce_admin_codigo_externo(p_tenant_id uuid,p_id uuid,p_codigo text)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.codigo_trabajador(p_tenant_id,p_id,p_codigo)
$$;

create function harvest_bonos_privado.reportes_tareo(p_tenant_id uuid,p_campania_id uuid,p_desde date,p_trabajador_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare resultado jsonb;
begin
 perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
 perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
 if p_desde is null or not isfinite(p_desde) or extract(isodow from p_desde)<>4 then
  raise exception 'La semana de tareo debe empezar un jueves'; end if;
 if p_trabajador_id is not null and not exists(select 1 from public.trabajadores where tenant_id=p_tenant_id and id=p_trabajador_id) then
  raise exception using errcode='42501',message='Trabajador de otra empresa'; end if;
 with hechos as (
  select distinct p.trabajador_id,p.lote_id,p.variedad_id
  from public.harvest_produccion_reportable p
  join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  where p.campania_id=p_campania_id and (p_trabajador_id is null or p.trabajador_id=p_trabajador_id)
   and p.fecha_hora >= (p_desde::timestamp at time zone 'America/Lima')
   and p.fecha_hora < ((p_desde+7)::timestamp at time zone 'America/Lima')
 ), filas as (
  select p.trabajador_id "trabajadorId",t.codigo_externo "codigoTrabajador",t.dni,
   btrim(concat_ws(' ',t.apellidos,t.nombres)) nombre,p.lote_id "loteId",coalesce(nullif(l.nombre,''),l.codigo) lote,
   p.variedad_id "variedadId",v.nombre variedad,m.actividad,m.labor,m.consumidor
  from hechos p join public.trabajadores t on t.id=p.trabajador_id and t.tenant_id=p_tenant_id
  join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id
  left join public.variedades v on v.id=p.variedad_id and v.tenant_id=p_tenant_id
  left join harvest_bonos_privado.tareo_imputaciones m on m.tenant_id=p_tenant_id and m.campania_id=p_campania_id
   and m.lote_id=p.lote_id and m.variedad_id=p.variedad_id
 ) select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo','TAREO',
   'datos',jsonb_build_object('desde',p_desde,'hasta',p_desde+6,
    'filas',coalesce((select jsonb_agg(to_jsonb(f) order by nombre,lote,variedad,"trabajadorId","loteId","variedadId") from filas f),'[]'::jsonb))) into resultado;
 return resultado;
end $$;
create function public.harvest_reportes_tareo(p_tenant_id uuid,p_campania_id uuid,p_desde date,p_trabajador_id uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.reportes_tareo(p_tenant_id,p_campania_id,p_desde,p_trabajador_id)
$$;

create function harvest_bonos_privado.tareo_guardar(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare r jsonb; cultivo uuid; actor uuid;
begin
 perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
 perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
 if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_datos->'trabajadores') is distinct from 'array'
  or jsonb_typeof(p_datos->'imputaciones') is distinct from 'array' then raise exception 'Configuración de tareo inválida'; end if;
 if jsonb_array_length(p_datos->'trabajadores')>1000 or jsonb_array_length(p_datos->'imputaciones')>1000 then
  raise exception 'Demasiados códigos en una sola operación'; end if;
 perform pg_advisory_xact_lock(hashtextextended('harvest.tareo:'||p_campania_id::text,0));
 for r in select value from jsonb_array_elements(p_datos->'trabajadores') loop
  if jsonb_typeof(r->'codigo') is distinct from 'string' then raise exception 'Código de trabajador inválido'; end if;
  if not exists(select 1 from public.trabajador_campania_rol where tenant_id=p_tenant_id and campania_id=p_campania_id and trabajador_id=(r->>'id')::uuid)
   and not exists(select 1 from public.harvest_produccion_reportable where campania_id=p_campania_id and trabajador_id=(r->>'id')::uuid) then
   raise exception using errcode='42501',message='Trabajador ajeno a esta campaña'; end if;
  perform harvest_bonos_privado.codigo_trabajador(p_tenant_id,(r->>'id')::uuid,r->>'codigo');
 end loop;
 if jsonb_array_length(p_datos->'imputaciones')>0 then
  select cultivo_id into cultivo from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
  actor:=public.harvest_cultivos_exigir(p_tenant_id,cultivo,true);
 end if;
 for r in select value from jsonb_array_elements(p_datos->'imputaciones') loop
  if not exists(select 1 from public.lotes l where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id and l.id=(r->>'loteId')::uuid
    and (l.variedad_id=(r->>'variedadId')::uuid or exists(select 1 from public.lote_variedades v
     where v.tenant_id=p_tenant_id and v.lote_id=l.id and v.variedad_id=(r->>'variedadId')::uuid))) then
   raise exception using errcode='42501',message='Lote o variedad ajenos a esta campaña'; end if;
  if exists(select 1 from unnest(array['actividad','labor','consumidor']) k where
    jsonb_typeof(r->k) is distinct from 'string' or length(btrim(r->>k)) not between 1 and 60) then
   raise exception 'Completa actividad, labor y consumidor'; end if;
  insert into harvest_bonos_privado.tareo_imputaciones(tenant_id,campania_id,lote_id,variedad_id,actividad,labor,consumidor,usuario_id)
   values(p_tenant_id,p_campania_id,(r->>'loteId')::uuid,(r->>'variedadId')::uuid,btrim(r->>'actividad'),btrim(r->>'labor'),btrim(r->>'consumidor'),actor)
   on conflict(tenant_id,campania_id,lote_id,variedad_id) do update set actividad=excluded.actividad,labor=excluded.labor,
    consumidor=excluded.consumidor,usuario_id=excluded.usuario_id,actualizado_en=clock_timestamp();
 end loop;
 return jsonb_build_object('ok',true,'tenantId',p_tenant_id,'campaniaId',p_campania_id);
end $$;
create function public.harvest_admin_tareo_guardar(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.tareo_guardar(p_tenant_id,p_campania_id,p_datos)
$$;

revoke all on function harvest_bonos_privado.codigo_trabajador(uuid,uuid,text),public.workforce_admin_codigo_externo(uuid,uuid,text),
 harvest_bonos_privado.reportes_tareo(uuid,uuid,date,uuid),public.harvest_reportes_tareo(uuid,uuid,date,uuid),
 harvest_bonos_privado.tareo_guardar(uuid,uuid,jsonb),public.harvest_admin_tareo_guardar(uuid,uuid,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function harvest_bonos_privado.codigo_trabajador(uuid,uuid,text),public.workforce_admin_codigo_externo(uuid,uuid,text),
 harvest_bonos_privado.reportes_tareo(uuid,uuid,date,uuid),public.harvest_reportes_tareo(uuid,uuid,date,uuid),
 harvest_bonos_privado.tareo_guardar(uuid,uuid,jsonb),public.harvest_admin_tareo_guardar(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';



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

-- Export the authoritative daily bonus once per worker/day. Container thresholds
-- remain campaign-wide; no allocation across consumers is invented here.
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
   case when m.total=count_mapeado and m.consumidores=1 then m.consumidor else '' end consumidor
  from semanas s join public.trabajadores t on t.id=s.trabajador and t.tenant_id=p_tenant_id
  left join harvest_bonos_privado.labores_rol lr on lr.tenant_id=p_tenant_id and lr.rol='COSECHADOR'
  left join lateral (
   select count(*) total,count(cl.consumidor) count_mapeado,count(distinct cl.consumidor) consumidores,min(cl.consumidor) consumidor
   from (select distinct p.lote_id,p.variedad_id from public.harvest_produccion_reportable p
    join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id
    where p.campania_id=p_campania_id and p.trabajador_id=s.trabajador
     and (p.fecha_hora at time zone 'America/Lima')::date between greatest(s.semana,p_desde) and least(s.semana+6,p_hasta)) h
   left join harvest_bonos_privado.consumidores_lote cl on cl.tenant_id=p_tenant_id and cl.campania_id=p_campania_id
    and cl.lote_id=h.lote_id and cl.variedad_id=h.variedad_id
  ) m on true
 ) select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo','TAREO',
  'datos',jsonb_build_object('desde',p_desde,'hasta',p_hasta,'totalBono',base->'datos'->'totalBono',
   'filas',coalesce((select jsonb_agg(to_jsonb(f) order by "semanaInicio",nombre,"trabajadorId") from filas f),'[]'::jsonb))) into resultado;
 return resultado;
end $$;
comment on function harvest_bonos_privado.reportes_tareo_rango(uuid,uuid,date,date,uuid)
 is 'Bonos diarios jabas+jarras, una fila por trabajador y semana jueves-miércoles. Consumidor vacío si no es único.';
commit;
