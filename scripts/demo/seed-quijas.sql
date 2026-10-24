-- Datos ficticios para quijas@gmail.com / Quijas (SCC). Ejecutar completo como
-- postgres en Supabase SQL Editor. No es una migración. No modifica Auth,
-- permisos, suscripciones, datos existentes ni configuración de la PWA.
-- Namespace reservado: de001015-2026-4000-8xxx-xxxxxxxxxxxx / DEMO-Q-*.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create temporary table gg_demo_context (
  tenant uuid, actor uuid, sujeto uuid, hoy date, instante timestamptz, operador_app uuid
) on commit drop;
create or replace function pg_temp.gg_demo_id(clase integer, numero integer)
returns uuid language sql immutable as $$
  select ('de001015-2026-4000-' || (8000 + clase)::text || '-' || lpad(numero::text,12,'0'))::uuid;
$$;

do $$
declare v_total integer; v_falta text;
begin
  perform pg_advisory_xact_lock(hashtextextended('gesgrow.demo.quijas.v1',0));
  if to_regprocedure('public.farm_f8_version()') is null then
    raise exception 'Falta el esquema F8. Este script no aplica migraciones.';
  end if;
  insert into gg_demo_context(tenant,actor,sujeto,hoy,instante)
    select t.id,i.usuario_id,i.sujeto,(statement_timestamp() at time zone 'America/Lima')::date,statement_timestamp()
    from public.identity_identidades i join auth.users a on a.id=i.sujeto
    join public.identity_usuarios u on u.id=i.usuario_id and u.activo
    join public.identity_membresias m on m.usuario_id=u.id and m.activo
    join public.tenants t on t.id=m.tenant_id and t.estado='ACTIVA'
    where i.proveedor='SUPABASE' and lower(a.email)='quijas@gmail.com'
      and t.id='00000000-0000-4000-8000-000000000001' and t.codigo='SCC';
  select count(*) into v_total from gg_demo_context;
  if v_total<>1 then raise exception 'La cuenta y su membresía activa en Quijas/SCC no coinciden de forma única.'; end if;
  if exists(select 1 from public.campanias where id::text like 'de001015-2026-4000-%')
    or exists(select 1 from public.cultivos where codigo like 'DEMO-Q-%')
    or exists(select 1 from public.trabajadores where tenant_id=(select tenant from gg_demo_context)
      and dni between '99015001' and '99015026') then
    raise exception 'La demo ya existe o su namespace está ocupado. No se sobrescribe ni se duplica; use primero la limpieza si corresponde.';
  end if;
  select string_agg(p,', ') into v_falta from unnest(array[
    'campaign.manage','workforce.manage','harvest.manage','reports.view']) p
    where not exists(select 1 from public.identity_membresias m
      join public.identity_membresia_roles mr on mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
      join public.identity_roles r on r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.activo
      join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id
      where m.usuario_id=(select actor from gg_demo_context) and m.tenant_id=(select tenant from gg_demo_context)
        and m.activo and rp.permiso=p);
  if v_falta is not null then raise exception 'La cuenta no puede explorar todas las secciones. Permisos faltantes: %. No se conceden automáticamente.',v_falta; end if;
  select string_agg(p,', ') into v_falta from unnest(array['CAMPAIGN','WORKFORCE','HARVEST']) p
    where not exists(select 1 from public.platform_tenant_modulos e
      join public.platform_suscripciones s on s.id=e.suscripcion_id and s.tenant_id=e.tenant_id
      join public.platform_modulos c on c.codigo=e.modulo_codigo and c.disponible
      where e.tenant_id=(select tenant from gg_demo_context) and e.modulo_codigo=p and e.habilitado
        and s.estado in ('ACTIVA','TRIAL') and s.desde<=statement_timestamp()
        and (s.hasta is null or s.hasta>statement_timestamp()) and e.desde<=statement_timestamp()
        and (e.hasta is null or e.hasta>statement_timestamp()));
  if v_falta is not null then raise exception 'Módulos no vigentes: %. La demo no cambia contratación.',v_falta; end if;
end $$;

-- Dos cultivos exclusivamente DEMO evitan competir con la campaña real activa.
insert into public.cultivos(id,codigo,nombre,activo) values
  (pg_temp.gg_demo_id(0,1),'DEMO-Q-ARANDANO','[DEMO] Arándanos',true),
  (pg_temp.gg_demo_id(0,2),'DEMO-Q-MANDARINA','[DEMO] Mandarina',true);

create temporary table gg_demo_campaigns on commit drop as
  select *,pg_temp.gg_demo_id(1,n) id from (values
    (1,'DEMO-Q-ARA-ACT','[DEMO] Arándanos · campaña actual',1,39,0,20),
    (2,'DEMO-Q-ARA-HIST','[DEMO] Arándanos · campaña histórica',1,90,79,12),
    (3,'DEMO-Q-MAN-ACT','[DEMO] Mandarina · campaña actual',2,13,0,12)
  ) c(n,codigo,nombre,cultivo,dia_inicial,dia_final,cosechadores);

-- La histórica recibe su frontera mientras está activa y luego se cierra.
-- Ninguna frontera ni campaña existente se toca.
insert into public.campanias(id,tenant_id,codigo,nombre,cultivo_id,estado,fecha_inicio)
  select c.id,x.tenant,c.codigo,c.nombre,pg_temp.gg_demo_id(0,c.cultivo),'ACTIVA',x.hoy-c.dia_inicial
  from gg_demo_campaigns c cross join gg_demo_context x where c.n=2;
insert into public.harvest_cutovers(campania_id,tenant_id,version,activado_en,activado_por)
  select c.id,x.tenant,1,x.instante,x.sujeto from gg_demo_campaigns c cross join gg_demo_context x where c.n=2;
update public.campanias set estado='CERRADA',fecha_fin=x.hoy-79
  from gg_demo_context x where id=pg_temp.gg_demo_id(1,2) and tenant_id=x.tenant;
insert into public.campanias(id,tenant_id,codigo,nombre,cultivo_id,estado,fecha_inicio)
  select c.id,x.tenant,c.codigo,c.nombre,pg_temp.gg_demo_id(0,c.cultivo),'ACTIVA',x.hoy-c.dia_inicial
  from gg_demo_campaigns c cross join gg_demo_context x where c.n<>2;
insert into public.harvest_cutovers(campania_id,tenant_id,version,activado_en,activado_por)
  select c.id,x.tenant,1,x.instante,x.sujeto from gg_demo_campaigns c cross join gg_demo_context x where c.n<>2;

insert into public.variedades(id,tenant_id,cultivo_id,nombre,activo)
  select pg_temp.gg_demo_id(3,v.n),x.tenant,pg_temp.gg_demo_id(0,v.cultivo),v.nombre,true
  from (values (1,1,'[DEMO] Ventura'),(2,1,'[DEMO] Biloxi'),
    (3,2,'[DEMO] W. Murcott'),(4,2,'[DEMO] Tango')) v(n,cultivo,nombre) cross join gg_demo_context x;

insert into public.trabajadores(id,tenant_id,dni,nombres,apellidos,activo)
  select pg_temp.gg_demo_id(2,n),x.tenant,(99015000+n)::text,
    '[DEMO] '||(array['Ana','Luis','María','José','Rosa','Pedro','Carmen','Diego','Lucía','Jorge',
      'Elena','Miguel','Patricia','Andrés','Silvia','Carlos','Diana','Raúl','Valeria','Óscar',
      'Julia','Manuel','Teresa','Ricardo','Pilar','Hugo'])[n],
    (array['Campos','Ríos','Vega','Torres','Flores','Soto','Luna','Castro','Paredes','Salas',
      'Reyes','Cruz','León','Vargas','Mendoza','Díaz','Romero','Rojas','Peña','Ruiz',
      'Herrera','Morales','Medina','Aguilar','Navarro','Silva'])[n],n<=24
  from generate_series(1,26) n cross join gg_demo_context x;
insert into public.trabajador_campania_rol(id,tenant_id,trabajador_id,campania_id,rol,activo)
  select pg_temp.gg_demo_id(5,c.n*100+w),x.tenant,pg_temp.gg_demo_id(2,w),c.id,
    (case when w in (21,22) then 'JABERO' when w in (23,24) then 'SUPERVISORA' else 'COSECHADOR' end)::public.rol_trabajador,
    c.n<>2 and w<=24 from gg_demo_campaigns c cross join generate_series(1,26) w cross join gg_demo_context x;

-- El trigger desplegado validar_sesion_lectura exige usuarios_app activo.
-- Es acceso interno de un trabajador DEMO, no una cuenta Supabase Auth.
with operador as (
  insert into public.usuarios_app(id,tenant_id,trabajador_id,activo)
    select pg_temp.gg_demo_id(6,1),x.tenant,pg_temp.gg_demo_id(2,23),true from gg_demo_context x
    on conflict(trabajador_id) do update set activo=true
    returning id
)
update gg_demo_context set operador_app=operador.id from operador;

insert into public.farm_fundos(id,tenant_id,codigo,nombre,activo)
  select pg_temp.gg_demo_id(7,n),x.tenant,'DEMO-Q-F'||n,'[DEMO] Fundo '||case n when 1 then 'La Esperanza' else 'Los Olivos' end,true
  from generate_series(1,2) n cross join gg_demo_context x;
insert into public.farm_sectores(id,tenant_id,fundo_id,codigo,nombre,activo)
  select pg_temp.gg_demo_id(7,100+n),x.tenant,pg_temp.gg_demo_id(7,1+(n-1)/2),'DEMO-Q-S'||n,'[DEMO] Sector '||n,true
  from generate_series(1,4) n cross join gg_demo_context x;
insert into public.farm_parcelas(id,tenant_id,sector_id,codigo,nombre,activo)
  select pg_temp.gg_demo_id(7,200+n),x.tenant,pg_temp.gg_demo_id(7,101+(n-1)/2),'DEMO-Q-P'||n,
    '[DEMO] Parcela '||n,n<>8 from generate_series(1,8) n cross join gg_demo_context x;
insert into public.lotes(id,tenant_id,campania_id,codigo,nombre,variedad_id,activo)
  select pg_temp.gg_demo_id(4,c.n*100+l),x.tenant,c.id,'DEMO-Q-L'||l,
    '[DEMO] '||(array['Norte','Sur','Este','Oeste'])[l],pg_temp.gg_demo_id(3,(c.cultivo-1)*2+1),true
  from gg_demo_campaigns c cross join generate_series(1,4) l cross join gg_demo_context x;
insert into public.lote_variedades(tenant_id,lote_id,variedad_id,activo)
  select x.tenant,pg_temp.gg_demo_id(4,c.n*100+l),pg_temp.gg_demo_id(3,(c.cultivo-1)*2+v),true
  from gg_demo_campaigns c cross join generate_series(1,4) l cross join generate_series(1,2) v cross join gg_demo_context x;
insert into public.campaign_lote_parcelas(tenant_id,lote_id,parcela_id,activo)
  select x.tenant,pg_temp.gg_demo_id(4,c.n*100+l),pg_temp.gg_demo_id(7,201+(c.n*4+l-5)%7),true
  from gg_demo_campaigns c cross join generate_series(1,4) l cross join gg_demo_context x;

create temporary table gg_demo_days on commit drop as
  select c.*,d from gg_demo_campaigns c cross join lateral generate_series(c.dia_final,c.dia_inicial) d;
create temporary table gg_demo_sessions on commit drop as
  select c.n,c.d,l,pg_temp.gg_demo_id(8,c.n*10000+c.d*10+l) id,
    pg_temp.gg_demo_id(4,c.n*100+l) lote,pg_temp.gg_demo_id(3,(c.cultivo-1)*2+1+(c.d+l)%2) variedad,
    case when c.d=0 then
      (x.hoy::timestamp at time zone 'America/Lima')+
      (x.instante-(x.hoy::timestamp at time zone 'America/Lima'))*(case when l<=2 then 0.05 else 0.5 end)
    else ((x.hoy-c.d)::timestamp+make_interval(hours=>case when l<=2 then 8 else 12 end)) at time zone 'America/Lima' end inicio,
    case when c.d=0 then
      (x.hoy::timestamp at time zone 'America/Lima')+
      (x.instante-(x.hoy::timestamp at time zone 'America/Lima'))*(case when l<=2 then 0.45 else 1.0 end)
    else ((x.hoy-c.d)::timestamp+make_interval(hours=>case when l<=2 then 11 else 16 end)) at time zone 'America/Lima' end fin
  from gg_demo_days c cross join generate_series(1,4) l cross join gg_demo_context x;
-- Cargar primero la histórica mientras campaña y jaberos DEMO están activos.
-- El cambio temporal de estados queda dentro de esta misma transacción.
-- Después se restaura el estado final y se cargan las sesiones actuales.
do $demo_sessions$
declare c record;
begin
  for c in select * from gg_demo_campaigns order by case when n=2 then 0 else n end loop
    if c.n=2 then
      update public.campanias set estado='CERRADA',fecha_fin=x.hoy
        from gg_demo_context x where id=pg_temp.gg_demo_id(1,1) and tenant_id=x.tenant;
      update public.campanias set estado='ACTIVA',fecha_fin=null
        from gg_demo_context x where id=c.id and tenant_id=x.tenant;
      update public.trabajador_campania_rol set activo=true
        where campania_id=c.id and tenant_id=(select tenant from gg_demo_context) and rol='JABERO';
    end if;
    insert into public.sesiones_lectura(id,tenant_id,lote_id,variedad_id,jabero_rol_id,iniciada_por_usuario_id,estado,fecha_inicio,fecha_fin)
      select s.id,x.tenant,s.lote,s.variedad,pg_temp.gg_demo_id(5,s.n*100+21+(s.l-1)%2),x.operador_app,
        (case when s.d=0 and s.l>2 then 'ACTIVA' else 'CERRADA' end)::public.estado_sesion,s.inicio,
        case when s.d=0 and s.l>2 then null else s.fin end
      from gg_demo_sessions s cross join gg_demo_context x where s.n=c.n;
    if c.n=2 then
      update public.campanias set estado='CERRADA',fecha_fin=x.hoy-c.dia_final
        from gg_demo_context x where id=c.id and tenant_id=x.tenant;
      update public.trabajador_campania_rol set activo=false
        where campania_id=c.id and tenant_id=(select tenant from gg_demo_context) and rol='JABERO';
      update public.campanias set estado='ACTIVA',fecha_fin=null
        from gg_demo_context x where id=pg_temp.gg_demo_id(1,1) and tenant_id=x.tenant;
    end if;
  end loop;
end $demo_sessions$;

create temporary table gg_demo_events on commit drop as
  select c.n,c.id campania,w,c.d,t,pg_temp.gg_demo_id(8,c.n*10000+c.d*10+1+(w-1)%4) sesion,
    (row_number() over(partition by c.n,w order by c.d desc,t))::integer ordinal
  from gg_demo_days c cross join lateral generate_series(1,c.cosechadores) w
    cross join lateral generate_series(1,5+(w*7+c.d*3+c.n)%9) t;
create temporary table gg_demo_batches on commit drop as
  select c.n,c.id campania,w,pg_temp.gg_demo_id(9,c.n*100+w) id,
    case when w<=c.cosechadores then w when w=c.cosechadores+1 then 1 else null end propietario,
    (select count(*)::integer from gg_demo_events e where e.n=c.n and e.w=workers.w)+12 cantidad,
    ((x.hoy-c.dia_inicial)::timestamp+interval '6 hours') at time zone 'America/Lima' creado
  from gg_demo_campaigns c cross join lateral generate_series(1,c.cosechadores+2) workers(w) cross join gg_demo_context x;
insert into public.harvest_lotes_tickets(id,tenant_id,campania_id,creado_en)
  select b.id,x.tenant,b.campania,b.creado from gg_demo_batches b cross join gg_demo_context x;
insert into public.harvest_tickets(codigo,tenant_id,lote_id,campania_id)
  select 'DEMO-Q-'||b.n||'-'||lpad(b.w::text,2,'0')||'-'||lpad(t::text,4,'0'),x.tenant,b.id,b.campania
  from gg_demo_batches b cross join lateral generate_series(1,b.cantidad) t cross join gg_demo_context x;
insert into public.harvest_generaciones(id,tenant_id,campania_id,actor_usuario_id,cantidad_tickets,tamanio_lote,creada_en,resultado)
  select pg_temp.gg_demo_id(11,b.n*100+b.w),x.tenant,b.campania,x.actor,b.cantidad,b.cantidad,b.creado,
    jsonb_build_object('operacionId',pg_temp.gg_demo_id(11,b.n*100+b.w),'tenantId',x.tenant,
      'campaniaId',b.campania,'actorUsuarioId',x.actor,'creadaEn',b.creado,'cantidadTickets',b.cantidad,
      'tamanioLote',b.cantidad,'lotes',jsonb_build_array(jsonb_build_object('id',b.id,'cantidadTickets',b.cantidad)))
  from gg_demo_batches b cross join gg_demo_context x;
insert into public.operaciones_pda_campania(id,tenant_id,campania_id,tipo,identity_usuario_id)
  select pg_temp.gg_demo_id(10,b.n*100+b.w),x.tenant,b.campania,'ASIGNAR_TICKET',x.actor
  from gg_demo_batches b cross join gg_demo_context x where b.propietario is not null;
insert into public.harvest_asignaciones_lote(lote_id,tenant_id,campania_id,trabajador_id,operacion_id)
  select b.id,x.tenant,b.campania,pg_temp.gg_demo_id(2,b.propietario),pg_temp.gg_demo_id(10,b.n*100+b.w)
  from gg_demo_batches b cross join gg_demo_context x where b.propietario is not null;
insert into public.operaciones_pda_procesadas(id,tenant_id,tipo,argumentos_md5,resultado)
  select pg_temp.gg_demo_id(10,b.n*100+b.w),x.tenant,'ASIGNAR_TICKET',
    md5(jsonb_build_array(b.campania,x.actor,pg_temp.gg_demo_id(2,b.propietario),b.id)::text),
    jsonb_build_object('loteId',b.id,'trabajadorId',pg_temp.gg_demo_id(2,b.propietario),'usuarioId',x.actor)
  from gg_demo_batches b cross join gg_demo_context x where b.propietario is not null;
insert into public.operaciones_pda_campania(id,tenant_id,campania_id,tipo,identity_usuario_id)
  select pg_temp.gg_demo_id(13,e.n*1000000+e.w*10000+e.ordinal),x.tenant,e.campania,'REGISTRAR_JABA',x.actor
  from gg_demo_events e cross join gg_demo_context x;
insert into public.harvest_registros_cosecha(id,tenant_id,codigo_ticket,lote_id,campania_id,trabajador_id,
  asignacion_operacion_id,sesion_id,operacion_id,fecha_hora)
  select pg_temp.gg_demo_id(12,e.n*1000000+e.w*10000+e.ordinal),x.tenant,
    'DEMO-Q-'||e.n||'-'||lpad(e.w::text,2,'0')||'-'||lpad(e.ordinal::text,4,'0'),
    pg_temp.gg_demo_id(9,e.n*100+e.w),e.campania,pg_temp.gg_demo_id(2,e.w),pg_temp.gg_demo_id(10,e.n*100+e.w),
    e.sesion,pg_temp.gg_demo_id(13,e.n*1000000+e.w*10000+e.ordinal),
    s.inicio+(s.fin-s.inicio)*((e.w*13+e.t)::double precision/400)
  from gg_demo_events e join gg_demo_sessions s on s.id=e.sesion cross join gg_demo_context x;
insert into public.operaciones_pda_procesadas(id,tenant_id,tipo,argumentos_md5,resultado)
  select r.operacion_id,x.tenant,'REGISTRAR_JABA',md5(jsonb_build_array(r.campania_id,x.actor,r.sesion_id,r.codigo_ticket)::text),
    jsonb_build_object('lote',to_jsonb(l),'ticket',to_jsonb(t),'asignacion',to_jsonb(a),'registro',to_jsonb(r))
  from public.harvest_registros_cosecha r join public.harvest_lotes_tickets l on l.id=r.lote_id
    join public.harvest_tickets t on t.codigo=r.codigo_ticket join public.harvest_asignaciones_lote a on a.lote_id=r.lote_id
    cross join gg_demo_context x where r.tenant_id=x.tenant and r.campania_id in (select id from gg_demo_campaigns);

-- Verificación dentro de la transacción: si falla, no queda una carga parcial.
do $$ begin
  if (select count(*) from public.harvest_produccion_reportable where campania_id in (select id from gg_demo_campaigns))
    <> (select count(*) from gg_demo_events) then raise exception 'La proyección no coincide con los hechos DEMO'; end if;
  if exists(select 1 from public.harvest_registros_cosecha where campania_id in (select id from gg_demo_campaigns)
    and fecha_hora>(select instante from gg_demo_context)) then raise exception 'Se generó una cosecha futura'; end if;
end $$;

-- Resultado que debe verse en SQL Editor. La fecha se calcula al ejecutar.
drop function pg_temp.gg_demo_id(integer,integer);
select c.codigo,c.nombre,c.estado,
  (public.harvest_proyectar_resumen(c.id,'America/Lima')->'resumen'->>'total_jabas')::integer jabas,
  (public.harvest_proyectar_resumen(c.id,'America/Lima')->'resumen'->>'dias_con_produccion')::integer dias,
  (select count(*) from public.harvest_tickets t where t.campania_id=c.id) tickets,
  exists(select 1 from public.platform_tenant_modulos e join public.platform_suscripciones s
    on s.id=e.suscripcion_id and s.tenant_id=e.tenant_id join public.platform_modulos m on m.codigo=e.modulo_codigo
    where e.tenant_id=c.tenant_id and e.modulo_codigo='FARM_STRUCTURE' and e.habilitado and m.disponible
      and s.estado in ('ACTIVA','TRIAL') and s.desde<=statement_timestamp()
      and (s.hasta is null or s.hasta>statement_timestamp()) and e.desde<=statement_timestamp()
      and (e.hasta is null or e.hasta>statement_timestamp())) estructura_habilitada
  from public.campanias c where c.id in (select id from gg_demo_campaigns) order by c.codigo;
commit;
