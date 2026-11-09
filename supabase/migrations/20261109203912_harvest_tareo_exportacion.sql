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
commit;
