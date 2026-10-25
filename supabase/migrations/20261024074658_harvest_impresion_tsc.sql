begin;

-- This is additive: historical lot UUIDs, ticket PKs and generation receipts
-- remain untouched. Only new generations opt in to TSC_30X20_3.
do $$ begin
  if to_regprocedure('public.harvest_cultivos_exigir_campania(uuid,uuid)') is null then
    raise exception 'Aplique cultivos de supervisores antes de impresión TSC';
  end if;
end $$;

create function public.harvest_impresion_abreviatura(p_nombre text)
returns text language sql immutable set search_path=pg_catalog,public as $$
  with n as (select upper(translate(btrim(coalesce(p_nombre,'')),
    'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')) nombre)
  select case when nombre ~ '^MANDARINA(S)?($|[[:space:]])' then 'MAN'
    when nombre ~ '^ARANDANO(S)?($|[[:space:]])' then 'ARA'
    -- Explicit fallback: first three ASCII letters, padded with X; CUL if empty.
    else rpad(left(coalesce(nullif(regexp_replace(nombre,'[^A-Z]','','g'),''),'CUL'),3),3,'X') end from n;
$$;
alter table public.cultivos add column abreviatura_impresion text;
update public.cultivos set abreviatura_impresion=public.harvest_impresion_abreviatura(nombre);
alter table public.cultivos alter column abreviatura_impresion set not null;
alter table public.cultivos add constraint cultivos_abreviatura_impresion_valida
  check(abreviatura_impresion ~ '^[A-Z]{3}$');
create function public.harvest_impresion_cultivo_default()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.abreviatura_impresion is null then
    new.abreviatura_impresion:=public.harvest_impresion_abreviatura(new.nombre);
  end if;
  return new;
end $$;
create trigger harvest_impresion_cultivo_default before insert on public.cultivos
  for each row execute function public.harvest_impresion_cultivo_default();

create function public.harvest_impresion_validar_abreviatura(p_datos jsonb)
returns text language plpgsql immutable set search_path=pg_catalog,public as $$
declare v text;
begin
  if jsonb_typeof(p_datos) is distinct from 'object'
    or jsonb_typeof(p_datos->'abreviaturaImpresion') is distinct from 'string' then
    raise exception 'abreviaturaImpresion requiere tres letras A-Z';
  end if;
  v:=upper(btrim(p_datos->>'abreviaturaImpresion'));
  if v !~ '^[A-Z]{3}$' then raise exception 'abreviaturaImpresion requiere tres letras A-Z'; end if;
  return v;
end $$;

-- Extend the existing JSON creation API, retaining its validation, transaction,
-- authorization and receipt replay (including the original request fingerprint).
do $$ declare original text; nuevo text; begin
  original:=pg_get_functiondef('public.harvest_cultivos_crear(uuid,uuid,jsonb)'::regprocedure);
  nuevo:=replace(original,
    'insert into public.cultivos(id,codigo,nombre) values(v_cultivo,''H-''||left(replace(v_cultivo::text,''-'',''''),28),btrim(p_datos->>''nombre''));',
    'insert into public.cultivos(id,codigo,nombre,abreviatura_impresion) values(v_cultivo,''H-''||left(replace(v_cultivo::text,''-'',''''),28),btrim(p_datos->>''nombre''),case when p_datos ? ''abreviaturaImpresion'' then public.harvest_impresion_validar_abreviatura(p_datos) else public.harvest_impresion_abreviatura(p_datos->>''nombre'') end);');
  if nuevo=original then raise exception 'No se pudo ampliar la creación de cultivos'; end if;
  execute nuevo;
  original:=pg_get_functiondef('public.harvest_cultivos_dto(uuid,uuid)'::regprocedure);
  nuevo:=replace(original,'''nombre'',c.nombre,''color'',h.color',
    '''nombre'',c.nombre,''abreviaturaImpresion'',c.abreviatura_impresion,''color'',h.color');
  if nuevo=original then raise exception 'No se pudo ampliar el catálogo de cultivos'; end if;
  execute nuevo;
end $$;

-- No crop edit RPC existed. Edits are restricted to participating supervisors
-- of tenant-owned crops; global legacy crops cannot be changed across tenants.
create function public.harvest_cultivos_editar(p_tenant_id uuid,p_cultivo_id uuid,p_datos jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.harvest_cultivos_exigir(p_tenant_id,p_cultivo_id,true);
  if p_cultivo_id is null or jsonb_typeof(p_datos) is distinct from 'object'
    or (p_datos-'abreviaturaImpresion')<>'{}'::jsonb then
    raise exception 'La edición admite únicamente abreviaturaImpresion';
  end if;
  update public.cultivos set abreviatura_impresion=public.harvest_impresion_validar_abreviatura(p_datos)
    where id=p_cultivo_id;
  return public.harvest_cultivos_dto(p_tenant_id,p_cultivo_id);
end $$;

-- One non-cycling sequence for the entire database, never per tenant/campaign.
-- Reserved prefixes include historical matching ticket codes and future imports.
create sequence public.harvest_impresion_codigo_lote_seq minvalue 1 maxvalue 999999 start 1 no cycle;
create table public.harvest_impresion_codigos_lote (
  codigo_lote text primary key check(codigo_lote ~ '^[0-9]{6}$'),
  lote_id uuid references public.harvest_lotes_tickets(id) deferrable initially deferred
);
lock table public.harvest_tickets in share row exclusive mode;
-- Keep the existing lot/campaign access path and include the exact ticket key.
-- Without it, cold statistics can choose that two-column index for every FK
-- check and scan an entire newly inserted lot for each snapshot row (O(n²)).
drop index public.harvest_tickets_lote;
create index harvest_tickets_lote on public.harvest_tickets(lote_id,campania_id,codigo);

create function public.harvest_impresion_reservar_importados()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.harvest_impresion_codigos_lote(codigo_lote)
    select distinct substring(codigo,2,6) from impresion_tickets_nuevos
    where codigo ~ '^C[0-9]{8,}$' order by 1 on conflict do nothing;
  if exists(with prefijos as materialized (
      select distinct substring(codigo,2,6) codigo_lote,lote_id from impresion_tickets_nuevos
      where codigo ~ '^C[0-9]{8,}$'
    ) select 1 from prefijos t join public.harvest_impresion_codigos_lote r using(codigo_lote)
    where r.lote_id is not null and r.lote_id<>t.lote_id) then
    raise exception using errcode='23505',message='codigoLote reservado para otro lote de impresión';
  end if;
  return null;
end $$;
create trigger harvest_impresion_reservar_importados after insert on public.harvest_tickets
  referencing new table as impresion_tickets_nuevos for each statement
  execute function public.harvest_impresion_reservar_importados();

create function public.harvest_impresion_reservar_lote(p_lote uuid)
returns text language plpgsql volatile set search_path=pg_catalog,public as $$
declare v text;
begin
  loop
    begin
      v:=lpad(nextval('public.harvest_impresion_codigo_lote_seq')::text,6,'0');
    exception when sqlstate '2200H' then
      raise exception using errcode='22003',message='Se agotaron los códigos de lote de impresión (000001..999999)';
    end;
    insert into public.harvest_impresion_codigos_lote(codigo_lote,lote_id) values(v,p_lote)
      on conflict do nothing;
    if found then return v; end if;
  end loop;
end $$;

create table public.harvest_impresion_lotes (
  lote_id uuid primary key references public.harvest_lotes_tickets(id),
  operacion_id uuid not null references public.harvest_generaciones(id) deferrable initially deferred,
  codigo_lote text not null unique references public.harvest_impresion_codigos_lote(codigo_lote),
  numero_lote integer not null check(numero_lote between 1 and 100000),
  unique(operacion_id,numero_lote)
);
create table public.harvest_impresion_filas (
  codigo text primary key,
  lote_id uuid not null references public.harvest_impresion_lotes(lote_id),
  campania_id uuid not null,
  numero_ticket integer not null check(numero_ticket between 1 and 100000),
  foreign key(codigo,lote_id,campania_id) references public.harvest_tickets(codigo,lote_id,campania_id),
  unique(lote_id,numero_ticket)
);
create function public.harvest_impresion_inmutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'El snapshot de impresión es inmutable'; end $$;
do $$ declare t text; begin
  foreach t in array array['harvest_impresion_codigos_lote','harvest_impresion_lotes','harvest_impresion_filas'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on public.%I from service_role',t);
    end if;
    execute format('create trigger harvest_impresion_inmutable before update or delete on public.%I for each row execute function public.harvest_impresion_inmutable()',t);
    execute format('create trigger harvest_impresion_no_truncate before truncate on public.%I for each statement execute function public.harvest_impresion_inmutable()',t);
  end loop;
end $$;
insert into public.harvest_impresion_codigos_lote(codigo_lote)
  select distinct substring(codigo,2,6) from public.harvest_tickets where codigo ~ '^C[0-9]{8,}$';
revoke all on sequence public.harvest_impresion_codigo_lote_seq from public,anon,authenticated;

-- Preserve the installed DTO's crop/tenant predicates and ACL. Historical lots
-- have null print identifiers, allowing existing clients to fall back to UUID.
do $$ declare original text; nuevo text; begin
  original:=pg_get_functiondef('public.harvest_admin_lote_dto(uuid,uuid)'::regprocedure);
  nuevo:=replace(original,'''id'',l.id,''campaniaId'',c.id',
    '''id'',l.id,''codigo'',i.codigo_lote,''generacionId'',i.operacion_id,''numeroLote'',i.numero_lote,''campaniaId'',c.id');
  if nuevo=original then raise exception 'No se pudo ampliar el DTO de lotes'; end if;
  original:=nuevo;
  nuevo:=replace(original,'left join public.harvest_asignaciones_lote a on',
    'left join public.harvest_impresion_lotes i on i.lote_id=l.id left join public.harvest_asignaciones_lote a on');
  if nuevo=original then raise exception 'No se pudo enlazar el snapshot al DTO de lotes'; end if;
  execute nuevo;
end $$;

create or replace function public.harvest_admin_generar(p_tenant_id uuid,p_campania_id uuid,p_operacion_id uuid,p_cantidad integer,p_tamanio integer)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_admin_exigir(p_tenant_id,p_campania_id,true);
  v_previa public.harvest_generaciones%rowtype; v_lote uuid; v_codigo text; v_cantidad integer;
  v_restantes integer:=p_cantidad; v_numero integer:=0; v_lotes jsonb; v_resultado jsonb;
  v_ahora timestamptz; v_fecha text; v_cultivo uuid; v_nombre text; v_abreviatura text;
begin
  if p_campania_id is null or p_operacion_id is null or p_cantidad is null or p_tamanio is null
    or p_cantidad not between 1 and 100000 or p_tamanio not between 1 and 100000 then
    raise exception 'ID y cantidades enteras entre 1 y 100000 requeridos';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('harvest.generar:'||p_operacion_id::text,0));
  select * into v_previa from public.harvest_generaciones where id=p_operacion_id;
  if found then
    if v_previa.tenant_id<>p_tenant_id or v_previa.campania_id<>p_campania_id
      or v_previa.actor_usuario_id<>v_actor or v_previa.cantidad_tickets<>p_cantidad
      or v_previa.tamanio_lote<>p_tamanio then
      raise exception 'ID de generación reutilizado con otra intención';
    end if;
    return v_previa.resultado;
  end if;
  if not exists(select 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id and estado='ACTIVA') then
    raise exception 'La campaña debe estar activa para generar tickets';
  end if;
  v_ahora:=clock_timestamp();
  v_fecha:=to_char(v_ahora at time zone 'America/Lima','YYYYMMDD');
  select cu.id,cu.nombre,cu.abreviatura_impresion into strict v_cultivo,v_nombre,v_abreviatura
    from public.campanias c join public.cultivos cu on cu.id=c.cultivo_id
    where c.id=p_campania_id and c.tenant_id=p_tenant_id for share of cu;
  while v_restantes>0 loop
    v_lote:=gen_random_uuid(); v_cantidad:=least(v_restantes,p_tamanio); v_numero:=v_numero+1;
    v_codigo:=public.harvest_impresion_reservar_lote(v_lote);
    insert into public.harvest_lotes_tickets(id,tenant_id,campania_id,creado_en)
      values(v_lote,p_tenant_id,p_campania_id,v_ahora);
    insert into public.harvest_impresion_lotes(lote_id,operacion_id,codigo_lote,numero_lote)
      values(v_lote,p_operacion_id,v_codigo,v_numero);
    insert into public.harvest_tickets(codigo,lote_id,campania_id,tenant_id)
      select 'C'||v_codigo||case when n<10 then '0'||n::text else n::text end,
        v_lote,p_campania_id,p_tenant_id from generate_series(1,v_cantidad) n;
    insert into public.harvest_impresion_filas(codigo,lote_id,campania_id,numero_ticket)
      select 'C'||v_codigo||case when n<10 then '0'||n::text else n::text end,
        v_lote,p_campania_id,n from generate_series(1,v_cantidad) n;
    v_restantes:=v_restantes-v_cantidad;
  end loop;
  select jsonb_agg(jsonb_build_object('id',l.lote_id,'codigoLote',l.codigo_lote,'numeroLote',l.numero_lote,
    'cantidadTickets',least(p_tamanio,p_cantidad-(l.numero_lote-1)*p_tamanio)) order by l.numero_lote)
    into v_lotes from public.harvest_impresion_lotes l where l.operacion_id=p_operacion_id;
  v_resultado:=jsonb_build_object('operacionId',p_operacion_id,'tenantId',p_tenant_id,'campaniaId',p_campania_id,
    'actorUsuarioId',v_actor,'creadaEn',v_ahora,'cantidadTickets',p_cantidad,'tamanioLote',p_tamanio,'lotes',v_lotes,
    'formatoImpresion','TSC_30X20_3','fecha',v_fecha,'cultivoId',v_cultivo,'cultivoNombre',v_nombre,
    'abreviaturaCultivo',v_abreviatura);
  insert into public.harvest_generaciones(id,tenant_id,campania_id,actor_usuario_id,cantidad_tickets,tamanio_lote,creada_en,resultado)
    values(p_operacion_id,p_tenant_id,p_campania_id,v_actor,p_cantidad,p_tamanio,v_ahora,v_resultado);
  return v_resultado;
end $$;

create function public.harvest_admin_generacion(p_tenant_id uuid,p_operacion_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare g public.harvest_generaciones%rowtype;
begin
  perform public.harvest_admin_exigir(p_tenant_id,null,true);
  select * into g from public.harvest_generaciones where id=p_operacion_id and tenant_id=p_tenant_id;
  if not found then raise exception using errcode='42501',message='Generación de otra empresa o inexistente'; end if;
  perform public.harvest_admin_exigir(p_tenant_id,g.campania_id,true);
  if g.resultado ? 'cultivoId' and not public.harvest_cultivos_puede_leer(p_tenant_id,(g.resultado->>'cultivoId')::uuid) then
    raise exception using errcode='42501',message='Generación sin participación autorizada en el cultivo del snapshot';
  end if;
  -- Deliberately independent of the original actor; current permission and crop
  -- participation are required on every read, even for the original creator.
  return g.resultado;
end $$;

create function public.harvest_admin_documento_impresion(p_tenant_id uuid,p_operacion_id uuid,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare g jsonb; v_filas jsonb;
begin
  g:=public.harvest_admin_generacion(p_tenant_id,p_operacion_id);
  if p_offset is null or p_offset<0 then raise exception 'Offset de impresión inválido'; end if;
  if g->>'formatoImpresion' is distinct from 'TSC_30X20_3' then
    raise exception using errcode='22023',message='Generación histórica sin snapshot TSC; conserve su impresión QR/A4';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('codigo',p.codigo,'codigoLote',p.codigo_lote,
    'numeroTicket',p.numero_ticket,'numeroLote',p.numero_lote) order by p.numero_lote,p.numero_ticket),'[]'::jsonb)
    into v_filas from (
      select f.codigo,l.codigo_lote,f.numero_ticket,l.numero_lote
      from public.harvest_impresion_lotes l join public.harvest_impresion_filas f on f.lote_id=l.lote_id
      where l.operacion_id=p_operacion_id order by l.numero_lote,f.numero_ticket limit 500 offset p_offset
    ) p;
  return jsonb_build_object('operacionId',g->'operacionId','campaniaId',g->'campaniaId','fecha',g->'fecha',
    'abreviaturaCultivo',g->'abreviaturaCultivo','total',g->'cantidadTickets','filas',v_filas);
end $$;

-- Private helpers, sequence and tables are never a parallel Data API surface.
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'harvest_impresion_%'
      or p.proname in ('harvest_admin_generar','harvest_admin_generacion','harvest_admin_documento_impresion','harvest_cultivos_editar')) loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function %s from service_role',r.oid::regprocedure);
    end if;
    if r.proname in ('harvest_admin_generar','harvest_admin_generacion','harvest_admin_documento_impresion','harvest_cultivos_editar') then
      execute format('grant execute on function %s to authenticated',r.oid::regprocedure);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    revoke all on sequence public.harvest_impresion_codigo_lote_seq from service_role;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
