-- Carga manual de datos ficticios solicitada para revisar los reportes.
-- No es una migración. Mantiene nombres naturales y trazabilidad por UUID.
-- Namespace interno: a6291029-2026-4000-8xxx-xxxxxxxxxxxx.
-- Conserva fechas/configuración y hechos originales de la campaña.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

create temporary table gg_carga_contexto on commit drop as
select 'e72f3272-105a-4da1-868a-0cc326e2bd4f'::uuid tenant,
  '9e030328-bba9-4622-a091-df0bdb4eadf0'::uuid campania,
  (statement_timestamp() at time zone 'America/Lima')::date hoy,
  statement_timestamp() instante;
create or replace function pg_temp.gg_carga_id(clase integer, n bigint)
returns uuid language sql immutable as $$
select ('a6291029-2026-4000-'||(8000+clase)::text||'-'||lpad(n::text,12,'0'))::uuid
$$;

do $$ begin
  perform pg_advisory_xact_lock(hashtextextended('gesgrow.carga.reportes.20261029',0));
  if not exists(select 1 from campanias c join gg_carga_contexto x on x.campania=c.id and x.tenant=c.tenant_id where c.estado='ACTIVA') then
    raise exception 'La campaña de destino no está activa o no pertenece a esta empresa'; end if;
  if exists(select 1 from trabajadores where id::text like 'a6291029-2026-4000-%')
    or exists(select 1 from trabajadores where dni between '99029101' and '99029126') then
    raise exception 'La carga ya existe o sus identificadores están ocupados. No se duplican ni sobrescriben datos'; end if;
  if not exists(select 1 from harvest_cutovers c join gg_carga_contexto x on x.campania=c.campania_id and x.tenant=c.tenant_id) then
    raise exception 'La campaña no tiene frontera de producción'; end if;
end $$;

create temporary table gg_carga_actor on commit drop as
select distinct i.usuario_id actor,i.sujeto
from identity_identidades i join identity_membresias m on m.usuario_id=i.usuario_id and m.activo
join identity_membresia_roles mr on mr.membresia_id=m.id and mr.tenant_id=m.tenant_id
join identity_roles r on r.id=mr.rol_id and r.tenant_id=mr.tenant_id and r.activo
join gg_carga_contexto x on x.tenant=m.tenant_id
where r.codigo='SUPERVISOR_COSECHA' and i.proveedor='SUPABASE'
order by i.usuario_id limit 1;
do $$ begin if (select count(*) from gg_carga_actor)<>1 then raise exception 'Se requiere un supervisor autorizado de la empresa'; end if; end $$;
select set_config('request.jwt.claim.sub',sujeto::text,true) from gg_carga_actor;
select public.harvest_admin_exigir(tenant,campania,true) from gg_carga_contexto;

-- Huellas para comprobar que la carga no alteró hechos ni configuración previos.
create temporary table gg_carga_antes on commit drop as
select md5(coalesce((select jsonb_agg(to_jsonb(r) order by r.hecho_id)::text from harvest_produccion_reportable r where r.campania_id=x.campania),'[]')) hechos,
  (select to_jsonb(c) from campanias c where c.id=x.campania) campania,
  (select count(*) from harvest_produccion_reportable r where r.campania_id=x.campania) cantidad
from gg_carga_contexto x;

create temporary table gg_carga_personas(n integer primary key,nombres text,apellidos text) on commit drop;
insert into gg_carga_personas values
  (1,'Luis Alberto','Quispe Mendoza'),(2,'María Fernanda','Torres Salazar'),
  (3,'José Antonio','Huamán Flores'),(4,'Rosa Elena','Vargas Rojas'),
  (5,'Carlos Eduardo','Medina Castillo'),(6,'Ana Lucía','Paredes Romero'),
  (7,'Jorge Andrés','García Ramos'),(8,'Carmen Isabel','Sánchez Silva'),
  (9,'Miguel Ángel','Chávez Herrera'),(10,'Patricia Milagros','Cruz Navarro'),
  (11,'Pedro Pablo','Gutiérrez Soto'),(12,'Diana Carolina','Vega Morales'),
  (13,'Ricardo Manuel','Peña Delgado'),(14,'Silvia Beatriz','Ríos Aguilar'),
  (15,'Óscar Daniel','Mamani Cárdenas'),(16,'Valeria Alejandra','López Cabrera'),
  (17,'Raúl Enrique','León Espinoza'),(18,'Elena Victoria','Núñez Ponce'),
  (19,'Hugo César','Arias Palomino'),(20,'Andrea Paola','Reyes Benavides'),
  (21,'Fernando Javier','Castro Alvarado'),(22,'Natalia Sofía','Mendoza Suárez'),
  (23,'Diego Alonso','Campos Valverde'),(24,'Gabriela Estefanía','Salas Villanueva'),
  (25,'Manuel Jesús','Pinto Carranza'),(26,'Julia Mercedes','Ruiz Sandoval');

insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo)
select pg_temp.gg_carga_id(1,p.n),x.tenant,(99029100+p.n)::text,p.nombres,p.apellidos,true
from gg_carga_personas p cross join gg_carga_contexto x;
insert into trabajador_campania_rol(id,tenant_id,trabajador_id,campania_id,rol,activo)
select pg_temp.gg_carga_id(2,p.n),x.tenant,pg_temp.gg_carga_id(1,p.n),x.campania,
  (case when p.n<=24 then 'COSECHADOR' else 'JABERO' end)::rol_trabajador,true
from gg_carga_personas p cross join gg_carga_contexto x;

-- Usa las combinaciones de lote/variedad ya configuradas y un operador vigente.
create temporary table gg_carga_lotes on commit drop as
select row_number() over(order by l.codigo,v.id)::integer n,l.id lote,v.id variedad
from lotes l join lote_variedades lv on lv.lote_id=l.id and lv.tenant_id=l.tenant_id and lv.activo
join variedades v on v.id=lv.variedad_id and v.tenant_id=l.tenant_id and v.activo
join gg_carga_contexto x on x.tenant=l.tenant_id and x.campania=l.campania_id
where l.activo;
create temporary table gg_carga_operador on commit drop as
select distinct ua.id from usuarios_app ua join trabajadores t on t.id=ua.trabajador_id and t.tenant_id=ua.tenant_id
join sesiones_lectura s on s.iniciada_por_usuario_id=ua.id and s.tenant_id=ua.tenant_id
join lotes l on l.id=s.lote_id and l.tenant_id=s.tenant_id
join gg_carga_contexto x on x.tenant=l.tenant_id and x.campania=l.campania_id
where ua.activo and t.activo
order by ua.id limit 1;
do $$ begin
  if not exists(select 1 from gg_carga_lotes) then raise exception 'No hay lotes y variedades vigentes'; end if;
  if not exists(select 1 from gg_carga_operador) then raise exception 'No hay operador vigente para las sesiones'; end if;
end $$;

create temporary table gg_carga_dias on commit drop as
select d,(x.hoy-20+d)::date fecha
from gg_carga_contexto x cross join generate_series(0,20) d;
create temporary table gg_carga_diaria on commit drop as
select p.n trabajador,d.d,d.fecha,
  greatest(4,(array[38,31,25,20,13,8])[1+(p.n-1)%6]
    + ((p.n*7+d.d*5)%11)-5
    + case p.n%4 when 0 then d.d/3 when 1 then -d.d/5 else 0 end)::integer jabas,
  1+(p.n+d.d)%(select count(*)::integer from gg_carga_lotes) lote_n
from gg_carga_personas p cross join gg_carga_dias d
where p.n<=24 and extract(isodow from d.fecha)<>7
  and (d.d+p.n*3)%11<>0
  and (p.n<=20 or d.d>=5+(p.n-21)*2);

create temporary table gg_carga_sesiones on commit drop as
select distinct d.d,d.lote_n,pg_temp.gg_carga_id(3,d.d*100+d.lote_n) id,
  l.lote,l.variedad,
  ((d.fecha::timestamp+interval '7 hours') at time zone 'America/Lima') inicio,
  case when d.fecha=x.hoy then least(x.instante-interval '1 minute',
    (d.fecha::timestamp+interval '16 hours') at time zone 'America/Lima')
    else (d.fecha::timestamp+interval '16 hours') at time zone 'America/Lima' end fin
from gg_carga_diaria d join gg_carga_lotes l on l.n=d.lote_n cross join gg_carga_contexto x;
do $$ begin if exists(select 1 from gg_carga_sesiones where fin<=inicio) then raise exception 'Ejecutar la carga después de las 07:01 de Lima'; end if; end $$;
insert into sesiones_lectura(id,tenant_id,lote_id,variedad_id,jabero_rol_id,iniciada_por_usuario_id,estado,fecha_inicio,fecha_fin)
select s.id,x.tenant,s.lote,s.variedad,pg_temp.gg_carga_id(2,25+s.lote_n%2),o.id,'CERRADA',s.inicio,s.fin
from gg_carga_sesiones s cross join gg_carga_contexto x cross join gg_carga_operador o;

-- Los códigos visibles se generan por el contrato del Portal, sin prefijos ficticios.
create temporary table gg_carga_talonarios(trabajador integer primary key,lote uuid,tickets integer) on commit drop;
do $$ declare p record; resultado jsonb; x gg_carga_contexto%rowtype; begin
  select * into x from gg_carga_contexto;
  for p in select trabajador,3*(ceil(sum(jabas)::numeric/3)::integer+1) cantidad from gg_carga_diaria group by trabajador order by trabajador loop
    resultado:=public.harvest_admin_generar(x.tenant,x.campania,pg_temp.gg_carga_id(4,p.trabajador),p.cantidad,p.cantidad);
    insert into gg_carga_talonarios values(p.trabajador,(resultado->'lotes'->0->>'id')::uuid,p.cantidad);
  end loop;
end $$;
insert into harvest_asignaciones_lote(lote_id,tenant_id,campania_id,trabajador_id,operacion_id)
select t.lote,x.tenant,x.campania,pg_temp.gg_carga_id(1,t.trabajador),pg_temp.gg_carga_id(5,t.trabajador)
from gg_carga_talonarios t cross join gg_carga_contexto x;
insert into operaciones_pda_procesadas(id,tenant_id,tipo,argumentos_md5,resultado)
select a.operacion_id,x.tenant,'ASIGNAR_TICKET',
  md5(jsonb_build_array(x.campania,u.actor,a.trabajador_id,a.lote_id)::text),
  jsonb_build_object('loteId',a.lote_id,'trabajadorId',a.trabajador_id,'usuarioId',u.actor)
from gg_carga_talonarios t join harvest_asignaciones_lote a on a.lote_id=t.lote
cross join gg_carga_contexto x cross join gg_carga_actor u;

create temporary table gg_carga_eventos on commit drop as
select d.*,j,row_number() over(partition by d.trabajador order by d.fecha,j)::integer ordinal,
  pg_temp.gg_carga_id(3,d.d*100+d.lote_n) sesion
from gg_carga_diaria d cross join lateral generate_series(1,d.jabas) j;
create temporary table gg_carga_tickets on commit drop as
select t.trabajador,f.numero_ticket,f.codigo from gg_carga_talonarios t
join harvest_impresion_filas f on f.lote_id=t.lote;
insert into operaciones_pda_campania(id,tenant_id,campania_id,tipo,identity_usuario_id)
select pg_temp.gg_carga_id(7,e.trabajador*10000+e.ordinal),x.tenant,x.campania,'REGISTRAR_JABA',u.actor
from gg_carga_eventos e cross join gg_carga_contexto x cross join gg_carga_actor u;
insert into harvest_registros_cosecha(id,tenant_id,codigo_ticket,lote_id,campania_id,trabajador_id,
  asignacion_operacion_id,sesion_id,operacion_id,fecha_hora)
select pg_temp.gg_carga_id(6,e.trabajador*10000+e.ordinal),x.tenant,k.codigo,t.lote,x.campania,
  pg_temp.gg_carga_id(1,e.trabajador),pg_temp.gg_carga_id(5,e.trabajador),e.sesion,
  pg_temp.gg_carga_id(7,e.trabajador*10000+e.ordinal),
  s.inicio+(s.fin-s.inicio)*((e.j::double precision)/(e.jabas+1))
from gg_carga_eventos e join gg_carga_talonarios t on t.trabajador=e.trabajador
join gg_carga_tickets k on k.trabajador=e.trabajador and k.numero_ticket=e.ordinal
join gg_carga_sesiones s on s.id=e.sesion cross join gg_carga_contexto x;
insert into operaciones_pda_procesadas(id,tenant_id,tipo,argumentos_md5,resultado)
select r.operacion_id,x.tenant,'REGISTRAR_JABA',
  md5(jsonb_build_array(x.campania,u.actor,r.sesion_id,r.codigo_ticket)::text),
  jsonb_build_object('lote',to_jsonb(l),'ticket',to_jsonb(t),'asignacion',to_jsonb(a),'registro',to_jsonb(r))
from harvest_registros_cosecha r join gg_carga_talonarios b on b.lote=r.lote_id
join harvest_lotes_tickets l on l.id=b.lote join harvest_tickets t on t.codigo=r.codigo_ticket
join harvest_asignaciones_lote a on a.lote_id=b.lote
cross join gg_carga_contexto x cross join gg_carga_actor u;

do $$ declare esperado bigint; actual bigint; x gg_carga_contexto%rowtype; begin
  select * into x from gg_carga_contexto;
  select count(*) into esperado from gg_carga_eventos;
  select count(*) into actual from harvest_produccion_reportable r where r.campania_id=x.campania and r.hecho_id::text like 'a6291029-2026-4000-8006-%';
  if esperado<>actual then raise exception 'La carga no coincide con la producción reportable'; end if;
  if exists(select 1 from harvest_registros_cosecha r join gg_carga_talonarios t on t.lote=r.lote_id where r.fecha_hora>x.instante) then raise exception 'No se admiten fechas futuras'; end if;
  if (select campania from gg_carga_antes) is distinct from (select to_jsonb(c) from campanias c where c.id=x.campania) then raise exception 'Se alteró la configuración de campaña'; end if;
  if (select hechos from gg_carga_antes) is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.hecho_id)::text,'[]')) from harvest_produccion_reportable r where r.campania_id=x.campania and r.hecho_id::text not like 'a6291029-2026-4000-8006-%') then raise exception 'Se alteraron hechos originales'; end if;
end $$;
select jsonb_build_object('campania',x.campania,'cosechadoresAgregados',24,'jaberosAgregados',2,
  'desde',x.hoy-20,'hasta',x.hoy,'diasConRegistros',(select count(distinct fecha) from gg_carga_diaria),
  'jabasAgregadas',(select count(*) from gg_carga_eventos),'jabasAnteriores',(select cantidad from gg_carga_antes),
  'lotesAsignados',(select count(*) from gg_carga_talonarios),'sesionesCerradas',(select count(*) from gg_carga_sesiones)) resultado
from gg_carga_contexto x;
commit;
