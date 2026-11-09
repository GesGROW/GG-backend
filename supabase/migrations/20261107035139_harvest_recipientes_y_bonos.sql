begin;
-- Unknown historical weights remain NULL. New clients explicitly select a container.
alter table public.harvest_registros_cosecha add column tipo_recipiente text,
 add column peso_kg numeric(4,1),
 add constraint harvest_recipiente_peso check (
 (tipo_recipiente is null and peso_kg is null) or
 (tipo_recipiente is not null and peso_kg is not null and
  ((tipo_recipiente='JARRA' and peso_kg=1.3) or (tipo_recipiente='JABA' and peso_kg=2.4))));
alter table public.lecturas_jaba add column tipo_recipiente text,
 add column peso_kg numeric(4,1),
 add constraint legacy_recipiente_peso check (
 (tipo_recipiente is null and peso_kg is null) or
 (tipo_recipiente is not null and peso_kg is not null and
  ((tipo_recipiente='JARRA' and peso_kg=1.3) or (tipo_recipiente='JABA' and peso_kg=2.4))));

create function harvest_bonos_privado.estampar_recipiente() returns trigger
language plpgsql security definer set search_path='' as $$
declare tipo text:=nullif(current_setting('harvest.tipo_recipiente',true),'');
begin
 if tipo is not null then
  if tipo not in ('JABA','JARRA') then raise exception 'Recipiente inválido'; end if;
  new.tipo_recipiente:=tipo;
  new.peso_kg:=case tipo when 'JARRA' then 1.3 else 2.4 end;
 end if;
 return new;
end $$;
revoke all on function harvest_bonos_privado.estampar_recipiente() from public,anon,authenticated,service_role;
create trigger harvest_recipiente before insert on public.harvest_registros_cosecha
 for each row execute function harvest_bonos_privado.estampar_recipiente();
create trigger legacy_recipiente before insert on public.lecturas_jaba
 for each row execute function harvest_bonos_privado.estampar_recipiente();

create function harvest_bonos_privado.registrar_recipiente(
 p_campania_id uuid,p_dni_operador varchar,p_sesion_id uuid,p_codigo_ticket text,
 p_lectura_id uuid,p_fecha_hora text,p_operacion_id uuid,p_tipo_recipiente text,p_legacy boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare anterior text:=current_setting('harvest.tipo_recipiente',true); r jsonb; tipo text;
begin
 if p_tipo_recipiente is null or p_tipo_recipiente not in ('JABA','JARRA') then raise exception 'Selecciona Jarra o Jaba'; end if;
 -- Same operation cannot be retried with a different container, even concurrently.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('harvest.recipiente:'||p_operacion_id::text,0));
 perform pg_catalog.set_config('harvest.tipo_recipiente',p_tipo_recipiente,true);
 if p_legacy then
  r:=public.registrar_lectura_jaba_campania(p_campania_id,p_dni_operador,p_sesion_id,p_codigo_ticket::varchar,p_lectura_id,p_fecha_hora,p_operacion_id);
  select j.tipo_recipiente into tipo from public.lecturas_jaba j where j.id=p_lectura_id;
 else
  r:=public.harvest_registrar_cosecha(p_campania_id,p_dni_operador,p_sesion_id,p_codigo_ticket,p_lectura_id,p_fecha_hora,p_operacion_id);
  select j.tipo_recipiente into tipo from public.harvest_registros_cosecha j where j.operacion_id=p_operacion_id;
 end if;
 if tipo is distinct from p_tipo_recipiente then raise exception 'ID de operación reutilizado con otro recipiente'; end if;
 perform pg_catalog.set_config('harvest.tipo_recipiente',coalesce(anterior,''),true);
 return r;
exception when others then
 perform pg_catalog.set_config('harvest.tipo_recipiente',coalesce(anterior,''),true); raise;
end $$;
revoke all on function harvest_bonos_privado.registrar_recipiente(uuid,varchar,uuid,text,uuid,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant usage on schema harvest_bonos_privado to anon;
grant execute on function harvest_bonos_privado.registrar_recipiente(uuid,varchar,uuid,text,uuid,text,uuid,text,boolean) to anon,authenticated;
create function public.harvest_registrar_recipiente(
 p_campania_id uuid,p_dni_operador varchar,p_sesion_id uuid,p_codigo_ticket text,
 p_lectura_id uuid,p_fecha_hora text,p_operacion_id uuid,p_tipo_recipiente text,p_legacy boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
 select harvest_bonos_privado.registrar_recipiente(p_campania_id,p_dni_operador,p_sesion_id,p_codigo_ticket,
 p_lectura_id,p_fecha_hora,p_operacion_id,p_tipo_recipiente,p_legacy)
$$;
revoke all on function public.harvest_registrar_recipiente(uuid,varchar,uuid,text,uuid,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.harvest_registrar_recipiente(uuid,varchar,uuid,text,uuid,text,uuid,text,boolean) to anon,authenticated;

alter table harvest_bonos_privado.reglas
 add column habilitado_jarras boolean not null default false,
 add column umbral_jarras integer not null default 30 check(umbral_jarras between 0 and 1000000),
 add column monto_jarras numeric(12,2) not null default 2 check(monto_jarras>0 and monto_jarras<=1000000);
create or replace view public.harvest_produccion_reportable as
select a.campania_id, 'LEGACY'::text as fuente, j.id as hecho_id,
  r.trabajador_id, j.sesion_id, s.lote_id, s.variedad_id, j.fecha_hora,
  0::integer as version_produccion, j.tipo_recipiente, j.peso_kg
from public.lecturas_jaba j
join public.asignaciones_ticket a on a.id=j.asignacion_ticket_id
join public.trabajador_campania_rol r on r.id=a.cosechador_rol_id and r.campania_id=a.campania_id
join public.sesiones_lectura s on s.id=j.sesion_id
join public.lotes l on l.id=s.lote_id and l.campania_id=a.campania_id
union all
select c.campania_id, 'HARVEST'::text, c.id, c.trabajador_id,
  c.sesion_id,s.lote_id,s.variedad_id,c.fecha_hora,c.version_produccion,c.tipo_recipiente,c.peso_kg
from public.harvest_registros_cosecha c
join public.harvest_cutovers corte on corte.campania_id=c.campania_id and corte.version=c.version_produccion
join public.sesiones_lectura s on s.id=c.sesion_id
join public.lotes l on l.id=s.lote_id and l.campania_id=c.campania_id
where c.creado_en >= corte.activado_en;
create or replace function harvest_bonos_privado.configuracion(p_tenant uuid,p_campania uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('tenantId',p_tenant,'campaniaId',p_campania,
 'hoy',(statement_timestamp() at time zone 'America/Lima')::date,
 'revision',coalesce((select max(orden)::text from harvest_bonos_privado.reglas where tenant_id=p_tenant and campania_id=p_campania),'0'),
 'habilitado',coalesce(r.habilitado,false),'umbral',coalesce(r.umbral,30),'monto',coalesce(r.monto,2),
 'jarrasHabilitado',coalesce(r.habilitado_jarras,false),'jarrasUmbral',coalesce(r.umbral_jarras,30),'jarrasMonto',coalesce(r.monto_jarras,2),
 'bloqueado',exists(select 1 from public.sesiones_lectura s join public.lotes l on l.id=s.lote_id and l.tenant_id=s.tenant_id
  where l.tenant_id=p_tenant and l.campania_id=p_campania and
   ((s.fecha_inicio at time zone 'America/Lima')::date=(statement_timestamp() at time zone 'America/Lima')::date or s.estado::text='ACTIVA')),
 'historial',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'fecha',h.fecha,'habilitado',h.habilitado,
  'umbral',h.umbral,'monto',h.monto,'jarrasHabilitado',h.habilitado_jarras,'jarrasUmbral',h.umbral_jarras,'jarrasMonto',h.monto_jarras,'usuarioId',h.usuario_id,
  'usuario',coalesce((select nombre from public.identity_usuarios where id=h.usuario_id),'Usuario'),
  'creadoEn',h.creado_en) order by h.orden desc)
  from harvest_bonos_privado.reglas h where h.tenant_id=p_tenant and h.campania_id=p_campania),'[]'::jsonb))
 from (select 1) base left join lateral (
 select * from harvest_bonos_privado.reglas where tenant_id=p_tenant and campania_id=p_campania
  and fecha<=(statement_timestamp() at time zone 'America/Lima')::date order by fecha desc,orden desc limit 1) r on true
$$;
revoke all on function harvest_bonos_privado.configuracion(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function harvest_bonos_privado.harvest_admin_bono_guardar(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb)
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
 p_datos:=jsonb_build_object('jarrasHabilitado',actual->'jarrasHabilitado','jarrasUmbral',actual->'jarrasUmbral','jarrasMonto',actual->'jarrasMonto')||p_datos;
 if jsonb_typeof(p_datos) is distinct from 'object'
  or jsonb_typeof(p_datos->'habilitado') is distinct from 'boolean'
  or jsonb_typeof(p_datos->'umbral') is distinct from 'number'
  or jsonb_typeof(p_datos->'monto') is distinct from 'number'
  or jsonb_typeof(p_datos->'jarrasHabilitado') is distinct from 'boolean'
  or jsonb_typeof(p_datos->'jarrasUmbral') is distinct from 'number'
  or jsonb_typeof(p_datos->'jarrasMonto') is distinct from 'number'
  or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('habilitado','umbral','monto','revision','hoy','jarrasHabilitado','jarrasUmbral','jarrasMonto')) then
  raise exception 'Configuración del bono inválida'; end if;
 if p_datos->>'revision' is distinct from actual->>'revision' or p_datos->>'hoy' is distinct from hoy::text then
  raise exception using errcode='40001',message='La configuración o el día cambiaron. Recarga antes de guardar'; end if;
 if (p_datos->>'umbral')::numeric not between 0 and 1000000
  or trunc((p_datos->>'umbral')::numeric)<>(p_datos->>'umbral')::numeric
  or (p_datos->>'monto')::numeric not between 0.01 and 1000000
  or round((p_datos->>'monto')::numeric,2)<>(p_datos->>'monto')::numeric then
  raise exception 'Ingresa un umbral entero y un monto positivo con hasta dos decimales'; end if;
 if (p_datos->>'jarrasUmbral')::numeric not between 0 and 1000000
  or trunc((p_datos->>'jarrasUmbral')::numeric)<>(p_datos->>'jarrasUmbral')::numeric
  or (p_datos->>'jarrasMonto')::numeric not between 0.01 and 1000000
  or round((p_datos->>'jarrasMonto')::numeric,2)<>(p_datos->>'jarrasMonto')::numeric then
  raise exception 'Ingresa un umbral entero y un monto positivo con hasta dos decimales'; end if;
 if (p_datos->'habilitado',p_datos->'umbral',p_datos->'monto',p_datos->'jarrasHabilitado',p_datos->'jarrasUmbral',p_datos->'jarrasMonto') is distinct from
    (actual->'habilitado',actual->'umbral',actual->'monto',actual->'jarrasHabilitado',actual->'jarrasUmbral',actual->'jarrasMonto') then
  insert into harvest_bonos_privado.reglas(tenant_id,campania_id,fecha,habilitado,umbral,monto,usuario_id,habilitado_jarras,umbral_jarras,monto_jarras)
   values(p_tenant_id,p_campania_id,hoy,(p_datos->>'habilitado')::boolean,(p_datos->>'umbral')::integer,(p_datos->>'monto')::numeric,actor,(p_datos->>'jarrasHabilitado')::boolean,(p_datos->>'jarrasUmbral')::integer,(p_datos->>'jarrasMonto')::numeric);
 end if;
 return harvest_bonos_privado.configuracion(p_tenant_id,p_campania_id);
end $$;

create or replace function harvest_bonos_privado.harvest_reportes_bonos(p_tenant_id uuid,p_campania_id uuid,p_desde date default null,p_hasta date default null,p_trabajador_id uuid default null)
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
  select p.trabajador_id,(p.fecha_hora at time zone 'America/Lima')::date fecha,count(*) filter(where p.tipo_recipiente is distinct from 'JARRA') jabas,
   count(*) filter(where p.tipo_recipiente='JARRA') jarras,sum(p.peso_kg) kg, count(*) filter(where p.peso_kg is null) sin_peso
  from public.harvest_produccion_reportable p join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id
  where p.campania_id=p_campania_id and l.campania_id=p_campania_id
   and (p_trabajador_id is null or p.trabajador_id=p_trabajador_id)
   and p.fecha_hora>=(desde::timestamp at time zone 'America/Lima') and p.fecha_hora<((hasta+1)::timestamp at time zone 'America/Lima')
  group by p.trabajador_id,(p.fecha_hora at time zone 'America/Lima')::date
 ), detalle as materialized (
  select d.trabajador_id "trabajadorId",d.fecha,d.jabas,d.jarras,d.kg "kgEstimados",d.sin_peso "lecturasSinPeso",t.dni,
   coalesce(nullif(btrim(concat_ws(' ',t.nombres,t.apellidos)),''),'Sin nombre registrado') nombre,
   coalesce(r.habilitado,false) habilitado,r.umbral,r.monto,
   coalesce(r.habilitado_jarras,false) "jarrasHabilitado",r.umbral_jarras "jarrasUmbral",r.monto_jarras "jarrasMonto",
   case when r.habilitado_jarras then greatest(0,d.jarras-r.umbral_jarras) else 0 end "adicionalesJarras",
   case when r.habilitado then greatest(0,d.jabas-r.umbral)*r.monto else 0 end "bonoJabas",
   case when r.habilitado_jarras then greatest(0,d.jarras-r.umbral_jarras)*r.monto_jarras else 0 end "bonoJarras",
   case when r.habilitado then greatest(0,d.jabas-r.umbral) else 0 end adicionales,
   case when r.habilitado then greatest(0,d.jabas-r.umbral)*r.monto else 0 end + case when r.habilitado_jarras then greatest(0,d.jarras-r.umbral_jarras)*r.monto_jarras else 0 end bono
  from diaria d join public.trabajadores t on t.id=d.trabajador_id and t.tenant_id=p_tenant_id
  left join lateral(select * from harvest_bonos_privado.reglas r where r.tenant_id=p_tenant_id and r.campania_id=p_campania_id
   and r.fecha<=d.fecha order by r.fecha desc,r.orden desc limit 1) r on true
 ), personas as (
  select "trabajadorId",nombre,dni,sum(jabas) jabas,sum(jarras) jarras,sum("kgEstimados") "kgEstimados",sum("lecturasSinPeso") "lecturasSinPeso",
   sum("bonoJabas") "bonoJabas",sum("bonoJarras") "bonoJarras",sum("adicionalesJarras") "adicionalesJarras",sum(adicionales) adicionales,sum(bono) bono
  from detalle group by "trabajadorId",nombre,dni
 ) select jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo','BONOS','actualizadoEn',clock_timestamp(),
  'datos',jsonb_build_object('ok',true,'hoy',hoy,'desde',desde,'hasta',hasta,
   'detalle',coalesce((select jsonb_agg(to_jsonb(d) order by fecha desc,nombre,"trabajadorId") from detalle d),'[]'::jsonb),
   'resumen',coalesce((select jsonb_agg(to_jsonb(p) order by bono desc,nombre,"trabajadorId") from personas p),'[]'::jsonb),
   'totalJarras',coalesce((select sum(jarras) from detalle),0),'totalJabas',coalesce((select sum(jabas) from detalle),0),
   'totalKgEstimados',(select sum("kgEstimados") from detalle),'lecturasSinPeso',coalesce((select sum("lecturasSinPeso") from detalle),0),
   'totalAdicionalesJarras',coalesce((select sum("adicionalesJarras") from detalle),0),'totalBono',coalesce((select sum(bono) from detalle),0),'totalAdicionales',coalesce((select sum(adicionales) from detalle),0))) into resultado;
 return resultado;
end $$;


create or replace function harvest_bonos_privado.reportes_recipiente(
  p_tenant_id uuid,p_campania_id uuid,p_tipo text,p_lote_id uuid default null,
  p_variedad_id uuid default null,p_desde date default null,p_hasta date default null,p_recipiente text default 'JABA')
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_hoy date:=(statement_timestamp() at time zone 'America/Lima')::date;
  v_desde date; v_hasta date; v_inicio date; v_datos jsonb; v_catalogo jsonb;
begin
  if p_recipiente is null or p_recipiente not in ('JABA','JARRA') then raise exception 'Recipiente inválido'; end if;
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if p_campania_id is null or p_tipo is null or p_tipo not in ('PRODUCCION','RENDIMIENTO') then
    raise exception 'Campaña y tipo de reporte requeridos'; end if;
  perform public.harvest_reportes_validar(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if p_lote_id is not null and not exists(select 1 from public.lotes
    where tenant_id=p_tenant_id and campania_id=p_campania_id and id=p_lote_id) then
    raise exception using errcode='42501',message='Lote de otra campaña o empresa'; end if;
  if p_variedad_id is not null and not exists(select 1 from public.lotes l
    left join public.lote_variedades lv on lv.tenant_id=l.tenant_id and lv.lote_id=l.id
    where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id and (p_lote_id is null or l.id=p_lote_id)
      and (l.variedad_id=p_variedad_id or lv.variedad_id=p_variedad_id)) then
    raise exception using errcode='42501',message='Variedad ajena a los lotes de esta campaña'; end if;
  select fecha_inicio into v_inicio from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
  select coalesce(p_desde,least(v_hoy,coalesce(v_inicio,v_hoy),coalesce(min((fecha_hora at time zone 'America/Lima')::date),v_hoy)))
    into v_desde from public.harvest_produccion_reportable where campania_id=p_campania_id;
  v_hasta:=coalesce(p_hasta,v_hoy);
  if not isfinite(v_desde) or not isfinite(v_hasta) or v_desde>v_hasta or v_hasta>v_hoy or v_hasta-v_desde>3660 then
    raise exception 'Seleccione un período válido hasta hoy, de hasta diez años'; end if;

  -- Catálogo de la campaña, incluso sin producción; no se deduce de las lecturas.
  with relaciones as (
    select l.id lote_id,l.variedad_id from public.lotes l
      where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id and l.variedad_id is not null
    union
    select l.id,lv.variedad_id from public.lotes l join public.lote_variedades lv
      on lv.lote_id=l.id and lv.tenant_id=l.tenant_id
      where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  ) select jsonb_build_object('lotes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'nombre',coalesce(nullif(btrim(l.nombre),''),l.codigo),'variedades',coalesce((
        select jsonb_agg(variedad_id order by variedad_id) from relaciones where lote_id=l.id),'[]'::jsonb)) order by l.codigo,l.id)
      from public.lotes l where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id),'[]'::jsonb),
    'variedades',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'nombre',v.nombre) order by v.nombre,v.id)
      from public.variedades v where v.tenant_id=p_tenant_id and exists(select 1 from relaciones r where r.variedad_id=v.id)),'[]'::jsonb)) into v_catalogo;

  -- Una única fuente de hechos admitidos para métricas, evolución y ranking.
  -- No excluir historia cuando un trabajador, lote o variedad deja de estar activo.
  with hechos as materialized (
    select p.*,(p.fecha_hora at time zone 'America/Lima')::date dia
    from public.harvest_produccion_reportable p
    join public.lotes l on l.id=p.lote_id and l.tenant_id=p_tenant_id and l.campania_id=p.campania_id
    where p.campania_id=p_campania_id and coalesce(p.tipo_recipiente,'JABA')=p_recipiente and (p_lote_id is null or p.lote_id=p_lote_id)
      and (p_variedad_id is null or p.variedad_id=p_variedad_id)
      and p.fecha_hora >= (v_desde::timestamp at time zone 'America/Lima')
      and p.fecha_hora < ((v_hasta+1)::timestamp at time zone 'America/Lima')
  ), diaria as (
    select dia,count(*) jabas from hechos group by dia
  ), diaria_persona as (
    select trabajador_id,dia,count(*) jabas from hechos group by trabajador_id,dia
  ), personas as (
    select h.trabajador_id id,t.dni,coalesce(nullif(btrim(concat_ws(' ',t.nombres,t.apellidos)),''),'Sin nombre registrado') nombre,
      count(*) jabas,count(distinct h.dia) "diasRegistros",
      round(count(*)::numeric / nullif(count(distinct h.dia),0),1) "promedioDiario"
    from hechos h join public.trabajadores t on t.id=h.trabajador_id and t.tenant_id=p_tenant_id
    group by h.trabajador_id,t.dni,t.nombres,t.apellidos
  ), ranking as (
    select *,dense_rank() over(order by jabas desc) posicion from personas
  ) select jsonb_build_object('ok',true,'hoy',v_hoy,'desde',v_desde,'hasta',v_hasta,'catalogo',v_catalogo,
    'recipiente',p_recipiente,'metricas',jsonb_build_object('kgEstimados',(select sum(peso_kg) from hechos),'lecturasSinPeso',(select count(*) from hechos where peso_kg is null),'totalJabas',(select count(*) from hechos),
      'jabasHoy',(select count(*) from hechos where dia=v_hoy),
      'diasProduccion',(select count(*) from diaria),
      'promedioDiario',coalesce((select round(avg(jabas),1) from diaria),0),
      'cosechadoresActivos',(select count(*) from personas),
      'promedioCosechador',coalesce((select round(avg(jabas),1) from personas),0),
      'mayorRendimiento',coalesce((select max(jabas) from personas),0)),
    'evolucion',coalesce((select jsonb_agg(jsonb_build_object('fecha',d::date,'jabas',coalesce(diaria.jabas,0)) order by d)
      from generate_series(v_desde::timestamp,v_hasta::timestamp,interval '1 day') d left join diaria on diaria.dia=d::date),'[]'::jsonb),
    'evolucionCosechadores',case when p_tipo='RENDIMIENTO' then coalesce((
      select jsonb_agg(jsonb_build_object('trabajadorId',trabajador_id,'fecha',dia,'jabas',jabas)
        order by trabajador_id,dia) from diaria_persona),'[]'::jsonb) else '[]'::jsonb end,
    'ranking',coalesce((select jsonb_agg(to_jsonb(r) order by r.jabas desc,r.nombre,r.id) from ranking r),'[]'::jsonb)) into v_datos;
  return jsonb_build_object('tenantId',p_tenant_id,'campaniaId',p_campania_id,'tipo',p_tipo,
    'actualizadoEn',clock_timestamp(),'datos',v_datos);
end $$;

revoke all on function harvest_bonos_privado.reportes_recipiente(uuid,uuid,text,uuid,uuid,date,date,text) from public,anon,authenticated,service_role;
grant execute on function harvest_bonos_privado.reportes_recipiente(uuid,uuid,text,uuid,uuid,date,date,text) to authenticated;
create function public.harvest_reportes_recipiente(p_tenant_id uuid,p_campania_id uuid,p_tipo text,
 p_lote_id uuid default null,p_variedad_id uuid default null,p_desde date default null,p_hasta date default null,p_recipiente text default 'JABA')
returns jsonb language sql security invoker set search_path='' as $$
 select harvest_bonos_privado.reportes_recipiente(p_tenant_id,p_campania_id,p_tipo,p_lote_id,p_variedad_id,p_desde,p_hasta,p_recipiente)
$$;
revoke all on function public.harvest_reportes_recipiente(uuid,uuid,text,uuid,uuid,date,date,text) from public,anon,authenticated,service_role;
grant execute on function public.harvest_reportes_recipiente(uuid,uuid,text,uuid,uuid,date,date,text) to authenticated;
create or replace function public.harvest_reportes_campania(p_tenant_id uuid,p_campania_id uuid,p_tipo text,
 p_lote_id uuid default null,p_variedad_id uuid default null,p_desde date default null,p_hasta date default null)
returns jsonb language sql security invoker set search_path='' as $$
 select harvest_bonos_privado.reportes_recipiente(p_tenant_id,p_campania_id,p_tipo,p_lote_id,p_variedad_id,p_desde,p_hasta,'JABA')
$$;
-- Existing reports that explicitly say "jabas" must not count jars as crates.
-- Preserve the deployed authorization wrappers and only refine the aggregate.
do $$ declare nombre text; definicion text; begin
 foreach nombre in array array['harvest_proyectar_resumen','harvest_proyectar_diaria','harvest_proyectar_lotes','harvest_proyectar_ranking'] loop
  select pg_get_functiondef(p.oid) into definicion from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=nombre;
  if definicion is null then raise exception 'Falta proyección %',nombre; end if;
  execute replace(definicion,'count(*)', 'count(*) filter (where tipo_recipiente is distinct from ''JARRA'')');
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
