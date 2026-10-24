-- RPC base no versionados: contrato mínimo para probar los adaptadores con PostgreSQL.
create table variedades(id uuid primary key default gen_random_uuid(),nombre varchar unique,activo boolean default true);
create table lotes(
  id uuid primary key default gen_random_uuid(),codigo varchar,nombre varchar,
  campania_id uuid references campanias(id),variedad_id uuid not null references variedades(id),
  activo boolean default true,unique(campania_id,codigo)
);
create table sesiones_lectura(
  id uuid primary key,lote_id uuid references lotes(id),jabero_rol_id uuid references trabajador_campania_rol(id),
  iniciada_por_usuario_id uuid references usuarios_app(id),estado text default 'ACTIVA',
  fecha_inicio timestamptz default now(),fecha_fin timestamptz
);
create table asignaciones_ticket(
  id uuid primary key default gen_random_uuid(),codigo_ticket varchar unique,
  campania_id uuid references campanias(id),cosechador_rol_id uuid references trabajador_campania_rol(id),
  fecha_asignacion timestamptz default now()
);
create table lecturas_jaba(
  id uuid primary key,asignacion_ticket_id uuid references asignaciones_ticket(id),
  sesion_id uuid references sesiones_lectura(id),fecha_hora timestamptz
);
create function obtener_cache_operativa(p_dni_operador varchar) returns jsonb
language plpgsql security definer as $$
declare v_campania_id uuid; v_trabajadores jsonb; v_tickets jsonb;
begin
  perform autorizar_operador_del_dia(p_dni_operador);
  select c.id into v_campania_id from campanias c where c.estado='ACTIVA';
  select coalesce(jsonb_agg(fila),'[]') into v_trabajadores from (
    select t.dni,concat_ws(' ',t.nombres,t.apellidos) nombre,t.activo,jsonb_agg(r.rol) roles
    from trabajadores t join trabajador_campania_rol r on r.trabajador_id=t.id
    where r.campania_id=v_campania_id and r.activo and t.activo group by t.id
  ) fila;
  select coalesce(jsonb_agg(jsonb_build_object('codigo_ticket',at.codigo_ticket,
    'cosechador_dni',t.dni,'cosechador',concat_ws(' ',t.nombres,t.apellidos),
    'fecha_asignacion',at.fecha_asignacion)),'[]') into v_tickets
  from asignaciones_ticket at join trabajador_campania_rol r on r.id=at.cosechador_rol_id
  join trabajadores t on t.id=r.trabajador_id where at.campania_id=v_campania_id;
  return jsonb_build_object('campania',jsonb_build_object('id',v_campania_id),
    'sincronizado_en',now(),'trabajadores',v_trabajadores,'tickets',v_tickets,'lotes','[]'::jsonb);
end $$;

create function asignar_ticket(p_dni_operador varchar,p_dni_cosechador varchar,p_codigo_ticket varchar)
returns jsonb language plpgsql security definer as $$
declare v_campania_id uuid; v_rol_id uuid; v_ticket_id uuid;
begin
  select c.id into v_campania_id from campanias c where c.estado='ACTIVA';
  select r.id into v_rol_id from trabajador_campania_rol r join trabajadores t on t.id=r.trabajador_id
  where t.dni=p_dni_cosechador and r.campania_id=v_campania_id and r.rol='COSECHADOR';
  insert into asignaciones_ticket(codigo_ticket,campania_id,cosechador_rol_id)
  values(p_codigo_ticket,v_campania_id,v_rol_id) returning id into v_ticket_id;
  return jsonb_build_object('ok',true,'id',v_ticket_id,'campania_id',v_campania_id);
end $$;

create function registrar_lectura_jaba(p_dni_operador varchar,p_sesion_id uuid,p_codigo_ticket varchar,p_lectura_id uuid,p_fecha_hora timestamptz)
returns jsonb language plpgsql security definer as $$
begin
  insert into lecturas_jaba(id,sesion_id,asignacion_ticket_id,fecha_hora)
  select p_lectura_id,p_sesion_id,id,p_fecha_hora from asignaciones_ticket where codigo_ticket=p_codigo_ticket;
  return jsonb_build_object('ok',true,'lectura_id',p_lectura_id);
end $$;
create function cerrar_sesion_lectura(p_dni_operador varchar,p_sesion_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  update sesiones_lectura set estado='CERRADA',fecha_fin=now() where id=p_sesion_id;
  return jsonb_build_object('ok',true,'sesion_id',p_sesion_id);
end $$;

insert into variedades(id,nombre) values('11111111-1111-4111-8111-111111111111','Ventura');
insert into lotes(id,codigo,nombre,campania_id,variedad_id)
values('22222222-2222-4222-8222-222222222222','L1','Norte',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
