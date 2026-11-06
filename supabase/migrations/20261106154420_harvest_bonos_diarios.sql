begin;

-- Private immutable rule history. No client may write rules or choose their date/actor.
create schema if not exists harvest_bonos_privado;
revoke all on schema harvest_bonos_privado from public,anon,authenticated,service_role;
create table harvest_bonos_privado.reglas (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 campania_id uuid not null references public.campanias(id),
 fecha date not null,
 habilitado boolean not null,
 umbral integer not null check(umbral between 0 and 1000000),
 monto numeric(12,2) not null check(monto>0 and monto<=1000000),
 usuario_id uuid not null references public.identity_usuarios(id),
 creado_en timestamptz not null default clock_timestamp(),
 orden bigint generated always as identity unique,
 foreign key(tenant_id,campania_id) references public.campanias(tenant_id,id)
);
alter table harvest_bonos_privado.reglas enable row level security;
create index on harvest_bonos_privado.reglas(tenant_id,campania_id,fecha desc,orden desc);
revoke all on all tables in schema harvest_bonos_privado from public,anon,authenticated,service_role;

-- Serialize all entry points, including legacy/PDA sessions, with rule changes.
create function harvest_bonos_privado.bloquear_apertura() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid;
begin
 select campania_id into c from public.lotes where id=new.lote_id and tenant_id=new.tenant_id;
 perform pg_advisory_xact_lock(hashtextextended('harvest.bono:'||c::text,0));
 return new;
end $$;
revoke all on function harvest_bonos_privado.bloquear_apertura() from public,anon,authenticated,service_role;
create trigger harvest_bono_apertura before insert on public.sesiones_lectura
 for each row execute function harvest_bonos_privado.bloquear_apertura();

create function harvest_bonos_privado.configuracion(p_tenant uuid,p_campania uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('tenantId',p_tenant,'campaniaId',p_campania,
 'hoy',(statement_timestamp() at time zone 'America/Lima')::date,
 'revision',coalesce((select max(orden)::text from harvest_bonos_privado.reglas where tenant_id=p_tenant and campania_id=p_campania),'0'),
 'habilitado',coalesce(r.habilitado,false),'umbral',coalesce(r.umbral,30),'monto',coalesce(r.monto,2),
 'bloqueado',exists(select 1 from public.sesiones_lectura s join public.lotes l on l.id=s.lote_id and l.tenant_id=s.tenant_id
  where l.tenant_id=p_tenant and l.campania_id=p_campania and
   ((s.fecha_inicio at time zone 'America/Lima')::date=(statement_timestamp() at time zone 'America/Lima')::date or s.estado::text='ACTIVA')),
 'historial',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'fecha',h.fecha,'habilitado',h.habilitado,
  'umbral',h.umbral,'monto',h.monto,'usuarioId',h.usuario_id,
  'usuario',coalesce((select nombre from public.identity_usuarios where id=h.usuario_id),'Usuario'),
  'creadoEn',h.creado_en) order by h.orden desc)
  from harvest_bonos_privado.reglas h where h.tenant_id=p_tenant and h.campania_id=p_campania),'[]'::jsonb))
 from (select 1) base left join lateral (
 select * from harvest_bonos_privado.reglas where tenant_id=p_tenant and campania_id=p_campania
  and fecha<=(statement_timestamp() at time zone 'America/Lima')::date order by fecha desc,orden desc limit 1) r on true
$$;
revoke all on function harvest_bonos_privado.configuracion(uuid,uuid) from public,anon,authenticated,service_role;

create function public.harvest_admin_bono_configuracion(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare cultivo uuid;
begin
 select cultivo_id into cultivo from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
 if not found then raise exception using errcode='42501',message='Campaña no disponible en esta empresa'; end if;
 perform public.harvest_cultivos_exigir(p_tenant_id,cultivo,true);
 return harvest_bonos_privado.configuracion(p_tenant_id,p_campania_id);
end $$;

create function public.harvest_admin_bono_guardar(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare actual jsonb; actor uuid; cultivo uuid; hoy date:=(statement_timestamp() at time zone 'America/Lima')::date;
begin
 select cultivo_id into cultivo from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
 if not found then raise exception using errcode='42501',message='Campaña no disponible en esta empresa'; end if;
 actor:=public.harvest_cultivos_exigir(p_tenant_id,cultivo,true);
 perform pg_advisory_xact_lock(hashtextextended('harvest.bono:'||p_campania_id::text,0));
 actual:=harvest_bonos_privado.configuracion(p_tenant_id,p_campania_id);
 if (actual->>'bloqueado')::boolean then
  raise exception 'La configuración del bono está bloqueada porque ya se inició una sesión de lectura. Podrás modificarla otro día, antes de iniciar la primera sesión y sin sesiones activas'; end if;
 if not exists(select 1 from public.campanias where id=p_campania_id and estado::text='ACTIVA') then
  raise exception 'Solo se puede configurar el bono de una campaña activa'; end if;
 if jsonb_typeof(p_datos) is distinct from 'object'
  or jsonb_typeof(p_datos->'habilitado') is distinct from 'boolean'
  or jsonb_typeof(p_datos->'umbral') is distinct from 'number'
  or jsonb_typeof(p_datos->'monto') is distinct from 'number'
  or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('habilitado','umbral','monto','revision','hoy')) then
  raise exception 'Configuración del bono inválida'; end if;
 if p_datos->>'revision' is distinct from actual->>'revision' or p_datos->>'hoy' is distinct from hoy::text then
  raise exception using errcode='40001',message='La configuración o el día cambiaron. Recarga antes de guardar'; end if;
 if (p_datos->>'umbral')::numeric not between 0 and 1000000
  or trunc((p_datos->>'umbral')::numeric)<>(p_datos->>'umbral')::numeric
  or (p_datos->>'monto')::numeric not between 0.01 and 1000000
  or round((p_datos->>'monto')::numeric,2)<>(p_datos->>'monto')::numeric then
  raise exception 'Ingresa un umbral entero y un monto positivo con hasta dos decimales'; end if;
 if (p_datos->'habilitado',p_datos->'umbral',p_datos->'monto') is distinct from
    (actual->'habilitado',actual->'umbral',actual->'monto') then
  insert into harvest_bonos_privado.reglas(tenant_id,campania_id,fecha,habilitado,umbral,monto,usuario_id)
   values(p_tenant_id,p_campania_id,hoy,(p_datos->>'habilitado')::boolean,(p_datos->>'umbral')::integer,(p_datos->>'monto')::numeric,actor);
 end if;
 return harvest_bonos_privado.configuracion(p_tenant_id,p_campania_id);
end $$;

create function public.harvest_reportes_bonos(p_tenant_id uuid,p_campania_id uuid,p_desde date default null,p_hasta date default null,p_trabajador_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare hoy date:=(statement_timestamp() at time zone 'America/Lima')::date; desde date; hasta date; resultado jsonb;
begin
 perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
 perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
 select coalesce(p_desde,least(fecha_inicio,hoy),hoy),coalesce(p_hasta,hoy) into desde,hasta
  from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
 if desde is null or not isfinite(desde) or not isfinite(hasta) or desde>hasta or hasta>hoy or hasta-desde>3660 then
  raise exception 'Selecciona un período válido hasta hoy, de hasta diez años'; end if;
 if p_trabajador_id is not null and not exists(select 1 from public.trabajadores where tenant_id=p_tenant_id and id=p_trabajador_id) then
  raise exception using errcode='42501',message='Cosechador de otra empresa'; end if;
 with diaria as materialized (
  select p.trabajador_id,(p.fecha_hora at time zone 'America/Lima')::date fecha,count(*) jabas
  from public.harvest_produccion_reportable p join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id
  where p.campania_id=p_campania_id and l.campania_id=p_campania_id
   and (p_trabajador_id is null or p.trabajador_id=p_trabajador_id)
   and p.fecha_hora>=(desde::timestamp at time zone 'America/Lima') and p.fecha_hora<((hasta+1)::timestamp at time zone 'America/Lima')
  group by p.trabajador_id,(p.fecha_hora at time zone 'America/Lima')::date
 ), detalle as materialized (
  select d.trabajador_id "trabajadorId",d.fecha,d.jabas,t.dni,
   coalesce(nullif(btrim(concat_ws(' ',t.nombres,t.apellidos)),''),'Sin nombre registrado') nombre,
   coalesce(r.habilitado,false) habilitado,r.umbral,r.monto,
   case when r.habilitado then greatest(0,d.jabas-r.umbral) else 0 end adicionales,
   case when r.habilitado then greatest(0,d.jabas-r.umbral)*r.monto else 0 end bono
  from diaria d join public.trabajadores t on t.id=d.trabajador_id and t.tenant_id=p_tenant_id
  left join lateral(select * from harvest_bonos_privado.reglas r where r.tenant_id=p_tenant_id and r.campania_id=p_campania_id
   and r.fecha<=d.fecha order by r.fecha desc,r.orden desc limit 1) r on true
 ), personas as (
  select "trabajadorId",nombre,dni,sum(jabas) jabas,sum(adicionales) adicionales,sum(bono) bono
  from detalle group by "trabajadorId",nombre,dni
 ) select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo','BONOS','actualizadoEn',clock_timestamp(),
  'datos',jsonb_build_object('ok',true,'hoy',hoy,'desde',desde,'hasta',hasta,
   'detalle',coalesce((select jsonb_agg(to_jsonb(d) order by fecha desc,nombre,"trabajadorId") from detalle d),'[]'::jsonb),
   'resumen',coalesce((select jsonb_agg(to_jsonb(p) order by bono desc,nombre,"trabajadorId") from personas p),'[]'::jsonb),
   'totalBono',coalesce((select sum(bono) from detalle),0),'totalAdicionales',coalesce((select sum(adicionales) from detalle),0))) into resultado;
 return resultado;
end $$;

revoke all on function public.harvest_admin_bono_configuracion(uuid,uuid),public.harvest_admin_bono_guardar(uuid,uuid,jsonb),
 public.harvest_reportes_bonos(uuid,uuid,date,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.harvest_admin_bono_configuracion(uuid,uuid),public.harvest_admin_bono_guardar(uuid,uuid,jsonb),
 public.harvest_reportes_bonos(uuid,uuid,date,date,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
