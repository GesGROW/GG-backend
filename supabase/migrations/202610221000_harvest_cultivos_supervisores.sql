begin;

-- Check exact facade signatures before any DDL or data change. A historical
-- deployment may have reached only F7.2; silently skipping absent functions
-- in the guard/filter loops below would leave an incomplete security boundary.
do $preflight$
declare v_migraciones text; v_faltantes text;
begin
  select string_agg(distinct migracion,', ' order by migracion),string_agg(firma,E'\n' order by firma)
    into v_migraciones,v_faltantes
  from (values
    ('public.iam_exigir_campania(uuid,text)','202610140800_identity_access.sql (F6.2)'),
    ('public.iam_listar_campanias(uuid)','202610140800_identity_access.sql (F6.2)'),
    ('public.platform_exigir_modulo(uuid,text)','202610140900_platform_suscripciones.sql (F6.3)'),
    ('public.campaign_admin_exigir_campania(uuid,uuid)','202610141200_portal_campaign_workforce.sql (F7.3)'),
    ('public.campaign_admin_dto(uuid,uuid)','202610141200_portal_campaign_workforce.sql (F7.3)'),
    ('public.campaign_admin_listar(uuid,text,text,uuid,integer)','202610141200_portal_campaign_workforce.sql (F7.3)'),
    ('public.campaign_admin_cultivos(uuid)','202610141200_portal_campaign_workforce.sql (F7.3)'),
    ('public.campaign_admin_obtener(uuid,uuid)','202610141200_portal_campaign_workforce.sql (F7.3)'),
    ('public.harvest_admin_exigir(uuid,uuid,boolean)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_campanias(uuid)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_generar(uuid,uuid,uuid,integer,integer)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_registro_dto(uuid,uuid)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_lote_dto(uuid,uuid)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_dto(uuid,text,text)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_indice(uuid,text)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_listar(uuid,text,uuid,text,uuid,uuid,text,integer)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_filtros(uuid,uuid)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_admin_obtener(uuid,text,text)','202610141300_portal_harvest_admin.sql (F7.4)'),
    ('public.harvest_reportes_exigir(uuid,uuid)','202610141400_portal_reportes.sql (F7.5)'),
    ('public.harvest_reportes_campanias(uuid)','202610141400_portal_reportes.sql (F7.5)'),
    ('public.harvest_reportes_validar(uuid,uuid)','202610141400_portal_reportes.sql (F7.5)'),
    ('public.harvest_reportes_obtener(uuid,uuid,text,text)','202610141400_portal_reportes.sql (F7.5)')
  ) requeridas(firma,migracion)
  where to_regprocedure(firma) is null;
  if v_faltantes is not null then
    raise exception using errcode='55000',
      message='Prerrequisitos incompletos para cultivos de supervisores. Aplique primero: '||v_migraciones,
      detail='Fachadas requeridas ausentes:'||E'\n'||v_faltantes,
      hint='Complete las migraciones indicadas antes de volver a ejecutar esta migración.';
  end if;
end $preflight$;

-- Overlay opt-in: historical/global cultivos and their campaigns remain legacy.
create table public.harvest_cultivos (
  id uuid primary key references public.cultivos(id),
  tenant_id uuid not null references public.tenants(id),
  color text not null check(color in ('#F92D2D','#FF8800','#1FD200','#137D15','#3B64EC',
    '#6F1D79','#D54E4E','#F1E907','#ED3BB8','#D9D9D9')),
  creador_usuario_id uuid not null,
  creado_en timestamptz not null default clock_timestamp(),
  unique(tenant_id,id),
  foreign key(creador_usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
create table public.harvest_cultivo_supervisores (
  tenant_id uuid not null, cultivo_id uuid not null, usuario_id uuid not null,
  creado_en timestamptz not null default clock_timestamp(),
  primary key(tenant_id,cultivo_id,usuario_id),
  foreign key(tenant_id,cultivo_id) references public.harvest_cultivos(tenant_id,id),
  foreign key(usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);
create index harvest_cultivo_supervisores_usuario on public.harvest_cultivo_supervisores(tenant_id,usuario_id,cultivo_id);
create table public.harvest_cultivo_lotes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, cultivo_id uuid not null,
  nombre text not null check(length(btrim(nombre)) between 1 and 100), orden integer not null check(orden>0),
  unique(tenant_id,cultivo_id,id), unique(tenant_id,cultivo_id,orden),
  foreign key(tenant_id,cultivo_id) references public.harvest_cultivos(tenant_id,id)
);
create unique index harvest_cultivo_lotes_nombre on public.harvest_cultivo_lotes(tenant_id,cultivo_id,lower(nombre));
alter table public.variedades add constraint variedades_referencia_cultivo unique(tenant_id,cultivo_id,id);
create table public.harvest_cultivo_lote_variedades (
  tenant_id uuid not null, cultivo_id uuid not null, lote_id uuid not null, variedad_id uuid not null,
  primary key(tenant_id,lote_id,variedad_id),
  foreign key(tenant_id,cultivo_id,lote_id) references public.harvest_cultivo_lotes(tenant_id,cultivo_id,id),
  foreign key(tenant_id,cultivo_id,variedad_id) references public.variedades(tenant_id,cultivo_id,id)
);
create table public.harvest_cultivo_solicitudes (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, cultivo_id uuid not null,
  usuario_id uuid not null, estado text not null default 'PENDING' check(estado in ('PENDING','APPROVED','REJECTED')),
  creada_en timestamptz not null default clock_timestamp(), resuelta_en timestamptz, resuelta_por uuid,
  unique(tenant_id,cultivo_id,usuario_id),
  foreign key(tenant_id,cultivo_id) references public.harvest_cultivos(tenant_id,id),
  foreign key(usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id),
  foreign key(resuelta_por,tenant_id) references public.identity_membresias(usuario_id,tenant_id),
  check((estado='PENDING' and resuelta_en is null and resuelta_por is null) or
    (estado<>'PENDING' and resuelta_en is not null and resuelta_por is not null and resuelta_por<>usuario_id))
);
create table public.harvest_cultivo_operaciones (
  id uuid primary key, tenant_id uuid not null, usuario_id uuid not null,
  tipo text not null check(tipo in ('CREAR','CAMPANIA')), datos jsonb not null, resultado jsonb not null,
  creado_en timestamptz not null default clock_timestamp(),
  foreign key(usuario_id,tenant_id) references public.identity_membresias(usuario_id,tenant_id)
);

-- These are private aggregates; only the five authenticated RPCs mutate them.
do $$ declare t text; begin
  foreach t in array array['harvest_cultivos','harvest_cultivo_supervisores','harvest_cultivo_lotes',
    'harvest_cultivo_lote_variedades','harvest_cultivo_solicitudes','harvest_cultivo_operaciones'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on public.%I from service_role',t);
    end if;
  end loop;
end $$;

create function public.harvest_cultivos_exigir(p_tenant uuid,p_cultivo uuid default null,p_participante boolean default false)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid;
begin
  if p_tenant is null then raise exception using errcode='42501',message='Empresa requerida'; end if;
  v_actor:=public.iam_exigir_permiso(p_tenant,'harvest.manage');
  perform public.platform_exigir_modulo(p_tenant,'HARVEST');
  if p_cultivo is not null then
    perform 1 from public.harvest_cultivos h join public.cultivos c on c.id=h.id and c.activo
      where h.id=p_cultivo and h.tenant_id=p_tenant;
    if not found then raise exception using errcode='42501',message='Cultivo de otra empresa o no disponible'; end if;
  end if;
  if p_participante and (p_cultivo is null or not exists(select 1 from public.harvest_cultivo_supervisores
    where tenant_id=p_tenant and cultivo_id=p_cultivo and usuario_id=v_actor)) then
    raise exception using errcode='42501',message='Supervisor participante del cultivo requerido';
  end if;
  return v_actor;
end $$;

-- A single predicate is shared by facades, list filters and restrictive RLS.
-- No request status, client-supplied actor, role name or worker role grants access.
create function public.harvest_cultivos_puede_leer(p_tenant uuid,p_cultivo uuid)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.harvest_cultivos where id=p_cultivo) then return true; end if;
  if not public.iam_tiene_permiso(p_tenant,'harvest.manage') or not exists(
    select 1 from public.harvest_cultivo_supervisores s join public.harvest_cultivos h
      on h.tenant_id=s.tenant_id and h.id=s.cultivo_id
    where s.tenant_id=p_tenant and s.cultivo_id=p_cultivo and s.usuario_id=public.iam_usuario_actual()) then return false; end if;
  return public.platform_modulo_habilitado(p_tenant,'HARVEST');
end $$;
create function public.harvest_cultivos_puede_campania(p_tenant uuid,p_campania uuid)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  return exists(select 1 from public.campanias c where c.tenant_id=p_tenant and c.id=p_campania
    and public.harvest_cultivos_puede_leer(c.tenant_id,c.cultivo_id));
end $$;
create function public.harvest_cultivos_exigir_campania(p_tenant uuid,p_campania uuid)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if not public.harvest_cultivos_puede_campania(p_tenant,p_campania) then
    raise exception using errcode='42501',message='Campaña sin participación autorizada en el cultivo'; end if;
end $$;

-- Organizational reporting remains available to the owner. This exception is
-- deliberately confined to report facades; it does not grant crop operation.
create function public.harvest_cultivos_puede_reporte(p_tenant uuid,p_campania uuid)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if public.iam_tiene_permiso(p_tenant,'company.manage') and public.iam_tiene_permiso(p_tenant,'reports.view') then
    return exists(select 1 from public.campanias where tenant_id=p_tenant and id=p_campania)
      and public.platform_modulo_habilitado(p_tenant,'HARVEST');
  end if;
  return public.harvest_cultivos_puede_campania(p_tenant,p_campania);
end $$;

-- Persistence guards also protect writes through older campaign endpoints.
create function public.harvest_cultivos_validar_propietario()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.harvest_cultivos h where h.id=new.cultivo_id and h.tenant_id<>new.tenant_id) then
    raise exception using errcode='23503',message='Cultivo administrado de otra empresa'; end if;
  if public.iam_usuario_actual() is not null then
    if not public.harvest_cultivos_puede_leer(new.tenant_id,new.cultivo_id) then
      raise exception using errcode='42501',message='Supervisor participante del cultivo requerido'; end if;
    if tg_op='UPDATE' and not public.harvest_cultivos_puede_leer(old.tenant_id,old.cultivo_id) then
      raise exception using errcode='42501',message='Supervisor participante del cultivo requerido'; end if;
  end if;
  return new;
end $$;
create trigger harvest_campania_propietario before insert or update on public.campanias
  for each row execute function public.harvest_cultivos_validar_propietario();
create trigger harvest_variedad_propietario before insert or update on public.variedades
  for each row execute function public.harvest_cultivos_validar_propietario();

create function public.harvest_cultivos_validar_campania(p_datos jsonb)
returns void language plpgsql volatile set search_path=pg_catalog,public as $$
declare v_inicio date; v_fin date;
begin
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_datos->'nombre') is distinct from 'string'
    or length(btrim(p_datos->>'nombre')) not between 1 and 100
    or jsonb_typeof(p_datos->'fechaInicio') is distinct from 'string'
    or (p_datos->>'fechaInicio') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_datos->'fechaFin') is distinct from 'string'
    or (p_datos->>'fechaFin') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Nombre, fecha de inicio y fecha de fin válidos son obligatorios'; end if;
  v_inicio:=(p_datos->>'fechaInicio')::date; v_fin:=(p_datos->>'fechaFin')::date;
  if v_inicio<(clock_timestamp() at time zone 'America/Lima')::date then
    raise exception 'La fecha de inicio no puede ser anterior a hoy en America/Lima'; end if;
  if not isfinite(v_inicio) or not isfinite(v_fin) or v_fin<v_inicio then
    raise exception 'La fecha de fin no puede ser anterior al inicio'; end if;
end $$;

create function public.harvest_cultivos_materializar_campania(p_tenant uuid,p_cultivo uuid,p_datos jsonb)
returns uuid language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_id uuid:=gen_random_uuid(); v_lote uuid; r record; v_inicio date:=(p_datos->>'fechaInicio')::date;
begin
  perform public.harvest_cultivos_validar_campania(p_datos);
  -- Serialize per crop, keeping the existing one-active-campaign constraint.
  perform 1 from public.harvest_cultivos where id=p_cultivo and tenant_id=p_tenant for update;
  if exists(select 1 from public.campanias where tenant_id=p_tenant and cultivo_id=p_cultivo and estado='ACTIVA') then
    raise exception 'Ya existe una campaña activa para este cultivo. Cierre la campaña activa antes de crear otra campaña.'; end if;
  insert into public.campanias(id,tenant_id,codigo,nombre,cultivo_id,fecha_inicio,fecha_fin,estado)
    values(v_id,p_tenant,'C-'||left(replace(v_id::text,'-',''),28),btrim(p_datos->>'nombre'),p_cultivo,
      v_inicio,(p_datos->>'fechaFin')::date,'ACTIVA');
  for r in select * from public.harvest_cultivo_lotes where tenant_id=p_tenant and cultivo_id=p_cultivo order by orden loop
    v_lote:=gen_random_uuid();
    insert into public.lotes(id,tenant_id,campania_id,codigo,nombre,variedad_id,activo)
      values(v_lote,p_tenant,v_id,'L-'||r.orden,r.nombre,
        (select variedad_id from public.harvest_cultivo_lote_variedades where tenant_id=p_tenant and lote_id=r.id order by variedad_id limit 1),true);
    insert into public.lote_variedades(tenant_id,lote_id,variedad_id,activo)
      select p_tenant,v_lote,variedad_id,true from public.harvest_cultivo_lote_variedades where tenant_id=p_tenant and lote_id=r.id;
  end loop;
  return v_id;
end $$;

create function public.harvest_cultivos_crear(p_tenant_id uuid,p_operacion_id uuid,p_datos jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_cultivos_exigir(p_tenant_id); v_cultivo uuid:=gen_random_uuid();
  v_campania uuid; v_lote uuid; v_dato jsonb; v_nombre text; v_orden integer:=0; v_resultado jsonb;
  v_previa public.harvest_cultivo_operaciones%rowtype;
begin
  if p_operacion_id is null then raise exception 'ID de operación requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('harvest.cultivos:'||p_operacion_id::text,0));
  select * into v_previa from public.harvest_cultivo_operaciones where id=p_operacion_id;
  if found then
    if v_previa.tenant_id<>p_tenant_id or v_previa.usuario_id<>v_actor or v_previa.tipo<>'CREAR'
      or v_previa.datos is distinct from p_datos then raise exception 'ID de operación reutilizado con otra intención'; end if;
    return v_previa.resultado;
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(p_datos->'nombre') is distinct from 'string'
    or length(btrim(p_datos->>'nombre')) not between 1 and 100
    or jsonb_typeof(p_datos->'color') is distinct from 'string' or (p_datos->>'color') !~ '^#[0-9A-Fa-f]{6}$'
    or jsonb_typeof(p_datos->'variedades') is distinct from 'array' or jsonb_typeof(p_datos->'lotes') is distinct from 'array' then
    raise exception 'Nombre, color, variedades y lotes del cultivo inválidos'; end if;
  if upper(p_datos->>'color') not in ('#F92D2D','#FF8800','#1FD200','#137D15','#3B64EC',
    '#6F1D79','#D54E4E','#F1E907','#ED3BB8','#D9D9D9') then
    raise exception 'Seleccione uno de los diez colores permitidos para el cultivo'; end if;
  if jsonb_array_length(p_datos->'variedades') not between 1 and 100 or jsonb_array_length(p_datos->'lotes') not between 1 and 100 then
    raise exception 'Seleccione entre 1 y 100 variedades y lotes'; end if;
  if exists(select 1 from jsonb_array_elements(p_datos->'variedades') x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 100)
    or (select count(distinct lower(btrim(x#>>'{}'))) from jsonb_array_elements(p_datos->'variedades') x)<>jsonb_array_length(p_datos->'variedades') then
    raise exception 'Variedades vacías, inválidas o duplicadas'; end if;
  if exists(select 1 from jsonb_array_elements(p_datos->'lotes') x where jsonb_typeof(x)<>'object'
    or jsonb_typeof(x->'nombre') is distinct from 'string' or length(btrim(x->>'nombre')) not between 1 and 100
    or jsonb_typeof(x->'variedades') is distinct from 'array') then raise exception 'Lote de plantilla inválido'; end if;
  if (select count(distinct lower(btrim(x->>'nombre'))) from jsonb_array_elements(p_datos->'lotes') x)<>jsonb_array_length(p_datos->'lotes') then
    raise exception 'Nombres de lote duplicados'; end if;
  for v_dato in select value from jsonb_array_elements(p_datos->'lotes') loop
    if jsonb_array_length(v_dato->'variedades') not between 1 and 100 or exists(
      select 1 from jsonb_array_elements(v_dato->'variedades') x where jsonb_typeof(x)<>'string' or not exists(
        select 1 from jsonb_array_elements(p_datos->'variedades') v where lower(btrim(v#>>'{}'))=lower(btrim(x#>>'{}'))))
      or (select count(distinct lower(btrim(x#>>'{}'))) from jsonb_array_elements(v_dato->'variedades') x)<>jsonb_array_length(v_dato->'variedades') then
      raise exception 'Cada lote requiere al menos una variedad del cultivo, sin duplicados'; end if;
  end loop;
  perform public.harvest_cultivos_validar_campania(p_datos->'campania');
  insert into public.cultivos(id,codigo,nombre) values(v_cultivo,'H-'||left(replace(v_cultivo::text,'-',''),28),btrim(p_datos->>'nombre'));
  insert into public.harvest_cultivos(id,tenant_id,color,creador_usuario_id) values(v_cultivo,p_tenant_id,upper(p_datos->>'color'),v_actor);
  insert into public.harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) values(p_tenant_id,v_cultivo,v_actor);
  for v_nombre in select btrim(value) from jsonb_array_elements_text(p_datos->'variedades') loop
    insert into public.variedades(tenant_id,cultivo_id,nombre,activo) values(p_tenant_id,v_cultivo,v_nombre,true);
  end loop;
  for v_dato in select value from jsonb_array_elements(p_datos->'lotes') loop
    v_orden:=v_orden+1;
    insert into public.harvest_cultivo_lotes(tenant_id,cultivo_id,nombre,orden)
      values(p_tenant_id,v_cultivo,btrim(v_dato->>'nombre'),v_orden) returning id into v_lote;
    insert into public.harvest_cultivo_lote_variedades(tenant_id,cultivo_id,lote_id,variedad_id)
      select p_tenant_id,v_cultivo,v_lote,v.id from public.variedades v
      where v.tenant_id=p_tenant_id and v.cultivo_id=v_cultivo and exists(
        select 1 from jsonb_array_elements_text(v_dato->'variedades') n where lower(btrim(n))=lower(v.nombre));
  end loop;
  v_campania:=public.harvest_cultivos_materializar_campania(p_tenant_id,v_cultivo,p_datos->'campania');
  v_resultado:=jsonb_build_object('cultivoId',v_cultivo,'campaniaId',v_campania);
  insert into public.harvest_cultivo_operaciones(id,tenant_id,usuario_id,tipo,datos,resultado)
    values(p_operacion_id,p_tenant_id,v_actor,'CREAR',p_datos,v_resultado);
  return v_resultado;
end $$;

create function public.harvest_cultivos_campania(p_tenant_id uuid,p_operacion_id uuid,p_cultivo_id uuid,p_datos jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_cultivos_exigir(p_tenant_id,p_cultivo_id,true);
  v_previa public.harvest_cultivo_operaciones%rowtype; v_intencion jsonb:=jsonb_build_object('cultivoId',p_cultivo_id,'datos',p_datos); v_resultado jsonb;
begin
  if p_operacion_id is null then raise exception 'ID de operación requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended('harvest.cultivos:'||p_operacion_id::text,0));
  select * into v_previa from public.harvest_cultivo_operaciones where id=p_operacion_id;
  if found then
    if v_previa.tenant_id<>p_tenant_id or v_previa.usuario_id<>v_actor or v_previa.tipo<>'CAMPANIA'
      or v_previa.datos is distinct from v_intencion then raise exception 'ID de operación reutilizado con otra intención'; end if;
    return v_previa.resultado;
  end if;
  perform public.harvest_cultivos_validar_campania(p_datos);
  v_resultado:=jsonb_build_object('cultivoId',p_cultivo_id,'campaniaId',public.harvest_cultivos_materializar_campania(p_tenant_id,p_cultivo_id,p_datos));
  insert into public.harvest_cultivo_operaciones(id,tenant_id,usuario_id,tipo,datos,resultado)
    values(p_operacion_id,p_tenant_id,v_actor,'CAMPANIA',v_intencion,v_resultado);
  return v_resultado;
end $$;

create function public.harvest_cultivos_solicitud_dto(p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',s.id,'cultivoId',s.cultivo_id,'cultivoNombre',c.nombre,'nombre',u.nombre,'email',u.email,'estado',s.estado)
  from public.harvest_cultivo_solicitudes s join public.cultivos c on c.id=s.cultivo_id join public.identity_usuarios u on u.id=s.usuario_id where s.id=p_id;
$$;
create function public.harvest_cultivos_solicitar(p_tenant_id uuid,p_cultivo_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_cultivos_exigir(p_tenant_id,p_cultivo_id); v_id uuid;
begin
  if p_cultivo_id is null then raise exception 'Cultivo requerido'; end if;
  if exists(select 1 from public.harvest_cultivo_supervisores where tenant_id=p_tenant_id and cultivo_id=p_cultivo_id and usuario_id=v_actor) then
    raise exception 'Ya es supervisor participante del cultivo'; end if;
  insert into public.harvest_cultivo_solicitudes(tenant_id,cultivo_id,usuario_id) values(p_tenant_id,p_cultivo_id,v_actor)
    on conflict(tenant_id,cultivo_id,usuario_id) do nothing;
  select id into v_id from public.harvest_cultivo_solicitudes where tenant_id=p_tenant_id and cultivo_id=p_cultivo_id and usuario_id=v_actor;
  return public.harvest_cultivos_solicitud_dto(v_id);
end $$;
create function public.harvest_cultivos_resolver(p_tenant_id uuid,p_solicitud_id uuid,p_aceptar boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_cultivos_exigir(p_tenant_id); s public.harvest_cultivo_solicitudes%rowtype; v_estado text;
begin
  if p_aceptar is null then raise exception 'Decisión requerida'; end if;
  select * into s from public.harvest_cultivo_solicitudes where id=p_solicitud_id and tenant_id=p_tenant_id for update;
  if not found then raise exception using errcode='42501',message='Solicitud de otra empresa o inexistente'; end if;
  perform public.harvest_cultivos_exigir(p_tenant_id,s.cultivo_id,true);
  if s.usuario_id=v_actor then raise exception using errcode='42501',message='No puede resolver su propia solicitud'; end if;
  v_estado:=case when p_aceptar then 'APPROVED' else 'REJECTED' end;
  if s.estado<>'PENDING' then
    if s.estado<>v_estado then raise exception 'Solicitud ya resuelta con otra decisión'; end if;
    return public.harvest_cultivos_solicitud_dto(s.id);
  end if;
  if p_aceptar then
    if not exists(select 1 from public.identity_membresias m join public.identity_usuarios u on u.id=m.usuario_id and u.activo
      join public.identity_membresia_roles mr on mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
      join public.identity_roles r on r.id=mr.rol_id and r.tenant_id=mr.tenant_id and r.activo
      join public.identity_rol_permisos rp on rp.tenant_id=r.tenant_id and rp.rol_id=r.id and rp.permiso='harvest.manage'
      where m.usuario_id=s.usuario_id and m.tenant_id=p_tenant_id and m.activo) then
      raise exception 'El solicitante ya no tiene acceso de supervisor activo'; end if;
    insert into public.harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) values(p_tenant_id,s.cultivo_id,s.usuario_id) on conflict do nothing;
  end if;
  update public.harvest_cultivo_solicitudes set estado=v_estado,resuelta_en=clock_timestamp(),resuelta_por=v_actor where id=s.id;
  return public.harvest_cultivos_solicitud_dto(s.id);
end $$;

create function public.harvest_cultivos_dto(p_tenant uuid,p_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',h.id,'nombre',c.nombre,'color',h.color,
    'variedades',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'nombre',v.nombre) order by v.nombre,v.id)
      from public.variedades v where v.tenant_id=p_tenant and v.cultivo_id=h.id),'[]'::jsonb),
    'lotes',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'nombre',l.nombre,'variedades',coalesce((
      select jsonb_agg(jsonb_build_object('id',v.id,'nombre',v.nombre) order by v.nombre,v.id)
      from public.harvest_cultivo_lote_variedades lv join public.variedades v on v.id=lv.variedad_id and v.tenant_id=lv.tenant_id
      where lv.tenant_id=p_tenant and lv.lote_id=l.id),'[]'::jsonb)) order by l.orden)
      from public.harvest_cultivo_lotes l where l.tenant_id=p_tenant and l.cultivo_id=h.id),'[]'::jsonb),
    'supervisores',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'nombre',u.nombre,'email',u.email) order by u.nombre,u.id)
      from public.harvest_cultivo_supervisores s join public.identity_usuarios u on u.id=s.usuario_id and u.activo
      join public.identity_membresias m on m.usuario_id=s.usuario_id and m.tenant_id=s.tenant_id and m.activo
      where s.tenant_id=p_tenant and s.cultivo_id=h.id),'[]'::jsonb),
    'campanias',coalesce((select jsonb_agg(jsonb_build_object('id',ca.id,'codigo',ca.codigo,'nombre',ca.nombre,'estado',ca.estado,
      'fechaInicio',ca.fecha_inicio,'fechaFin',ca.fecha_fin) order by ca.fecha_inicio desc,ca.id)
      from public.campanias ca where ca.tenant_id=p_tenant and ca.cultivo_id=h.id),'[]'::jsonb))
  from public.harvest_cultivos h join public.cultivos c on c.id=h.id where h.tenant_id=p_tenant and h.id=p_id;
$$;
create function public.harvest_cultivos_catalogo(p_tenant_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=public.harvest_cultivos_exigir(p_tenant_id);
begin
  return jsonb_build_object(
    'propios',coalesce((select jsonb_agg(public.harvest_cultivos_dto(p_tenant_id,h.id) order by c.nombre,h.id)
      from public.harvest_cultivos h join public.cultivos c on c.id=h.id and c.activo
      where h.tenant_id=p_tenant_id and exists(select 1 from public.harvest_cultivo_supervisores s
        where s.tenant_id=p_tenant_id and s.cultivo_id=h.id and s.usuario_id=v_actor)),'[]'::jsonb),
    'disponibles',coalesce((select jsonb_agg(public.harvest_cultivos_dto(p_tenant_id,h.id)||jsonb_build_object('solicitudEstado',(
      select estado from public.harvest_cultivo_solicitudes where tenant_id=p_tenant_id and cultivo_id=h.id and usuario_id=v_actor)) order by c.nombre,h.id)
      from public.harvest_cultivos h join public.cultivos c on c.id=h.id and c.activo where h.tenant_id=p_tenant_id
      and not exists(select 1 from public.harvest_cultivo_supervisores s where s.tenant_id=p_tenant_id and s.cultivo_id=h.id and s.usuario_id=v_actor)),'[]'::jsonb),
    'solicitudes',coalesce((select jsonb_agg(public.harvest_cultivos_solicitud_dto(s.id) order by s.creada_en,s.id)
      from public.harvest_cultivo_solicitudes s where s.tenant_id=p_tenant_id and s.estado='PENDING' and exists(
        select 1 from public.harvest_cultivo_supervisores m where m.tenant_id=p_tenant_id and m.cultivo_id=s.cultivo_id and m.usuario_id=v_actor)),'[]'::jsonb));
end $$;

-- Facade guards keep legacy permission/module checks and add membership.
-- CREATE OR REPLACE preserves existing endpoint ACLs and parameter names.
do $$ declare r record; original text; cuerpo text; nuevo text; guarda text; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('harvest_admin_exigir','harvest_reportes_exigir','iam_exigir_campania','campaign_admin_exigir_campania') loop
    guarda:=case r.proname
      when 'harvest_admin_exigir' then 'if p_campania is not null then perform public.harvest_cultivos_exigir_campania(p_tenant,p_campania); end if;'
      when 'harvest_reportes_exigir' then 'if p_campania is not null and not public.harvest_cultivos_puede_reporte(p_tenant,p_campania) then raise exception using errcode=''42501'',message=''Campaña sin participación autorizada en el cultivo''; end if;'
      when 'iam_exigir_campania' then 'if p_permiso=''reports.view'' then if not public.harvest_cultivos_puede_reporte(public.platform_tenant_campania(p_campania_id),p_campania_id) then raise exception using errcode=''42501'',message=''Campaña sin participación autorizada en el cultivo''; end if; else perform public.harvest_cultivos_exigir_campania(public.platform_tenant_campania(p_campania_id),p_campania_id); end if;'
      when 'campaign_admin_exigir_campania' then 'perform public.harvest_cultivos_exigir_campania(p_tenant,p_id);' end;
    original:=pg_get_functiondef(r.oid); cuerpo:=substring(original from '\$function\$(.*)\$function\$');
    nuevo:='begin '||guarda||E'\n'||regexp_replace(cuerpo,';?\s*$',';')||E'\nend;';
    execute replace(original,'$function$'||cuerpo||'$function$','$function$'||nuevo||'$function$');
  end loop;
end $$;

-- Scope the underlying index before pagination/counts, and DTOs before direct
-- UUID/ticket lookup. Filter-only facades cannot be used to enumerate outsiders.
do $$ declare r record; original text; nuevo text; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('harvest_admin_indice','harvest_admin_lote_dto','harvest_admin_registro_dto','harvest_admin_dto',
      'harvest_admin_filtros','harvest_admin_campanias','harvest_reportes_campanias','iam_listar_campanias',
      'campaign_admin_listar','campaign_admin_dto','campaign_admin_cultivos') loop
    original:=pg_get_functiondef(r.oid); nuevo:=original;
    if r.proname in ('harvest_admin_indice','harvest_admin_lote_dto') then
      nuevo:=replace(nuevo,'l.tenant_id=p_tenant and','l.tenant_id=p_tenant and public.harvest_cultivos_puede_campania(p_tenant,l.campania_id) and');
    end if;
    if r.proname in ('harvest_admin_indice','harvest_admin_registro_dto') then
      nuevo:=replace(nuevo,'r.tenant_id=p_tenant and','r.tenant_id=p_tenant and public.harvest_cultivos_puede_campania(p_tenant,r.campania_id) and');
    end if;
    if r.proname in ('harvest_admin_indice','harvest_admin_dto') then
      nuevo:=replace(nuevo,'a.tenant_id=p_tenant and','a.tenant_id=p_tenant and public.harvest_cultivos_puede_campania(p_tenant,a.campania_id) and');
      nuevo:=replace(nuevo,'t.tenant_id=p_tenant and','t.tenant_id=p_tenant and public.harvest_cultivos_puede_campania(p_tenant,t.campania_id) and');
    end if;
    if r.proname='harvest_admin_filtros' then
      nuevo:=replace(nuevo,'a.tenant_id=p_tenant_id and','a.tenant_id=p_tenant_id and public.harvest_cultivos_puede_campania(p_tenant_id,a.campania_id) and');
    end if;
    if r.proname in ('harvest_admin_campanias','campaign_admin_listar') then
      nuevo:=replace(nuevo,'c.tenant_id=p_tenant_id','c.tenant_id=p_tenant_id and public.harvest_cultivos_puede_campania(p_tenant_id,c.id)');
    end if;
    if r.proname in ('harvest_reportes_campanias','iam_listar_campanias') then
      nuevo:=replace(nuevo,'c.tenant_id=p_tenant_id','c.tenant_id=p_tenant_id and public.harvest_cultivos_puede_reporte(p_tenant_id,c.id)');
    end if;
    if r.proname='campaign_admin_dto' then
      nuevo:=replace(nuevo,'c.tenant_id=p_tenant and','c.tenant_id=p_tenant and public.harvest_cultivos_puede_campania(p_tenant,c.id) and');
    end if;
    if r.proname='campaign_admin_cultivos' then
      nuevo:=replace(nuevo,'from public.cultivos c','from public.cultivos c where public.harvest_cultivos_puede_leer(p_tenant_id,c.id)');
    end if;
    if nuevo=original then raise exception 'No se pudo aplicar el filtro de cultivo a %',r.proname; end if;
    execute nuevo;
  end loop;
end $$;

-- Hide overlay lookups behind a helper so RLS never needs private-table SELECT.
create function public.harvest_cultivos_puede_catalogo(p_cultivo uuid)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.harvest_cultivos where id=p_cultivo;
  if not found then return true; end if;
  return public.harvest_cultivos_puede_leer(v_tenant,p_cultivo);
end $$;

-- On existing tables restrictive policies intersect ANY installed permissive
-- policy. They grant no new SELECT privileges. If RLS was disabled, retain
-- the existing authenticated read visibility, intersected with participation.
do $$ declare t text; condicion text; begin
  foreach t in array array['cultivos','variedades','campanias','lotes','lote_variedades','sesiones_lectura',
    'trabajador_campania_rol','asignaciones_ticket','lecturas_jaba','operaciones_pda_campania','operaciones_pda_procesadas',
    'harvest_lotes_tickets','harvest_tickets','harvest_asignaciones_lote','harvest_registros_cosecha','harvest_cutovers','harvest_generaciones'] loop
    condicion:=case
      when t='cultivos' then 'public.harvest_cultivos_puede_catalogo(id)'
      when t='variedades' then 'public.harvest_cultivos_puede_leer(tenant_id,cultivo_id)'
      when t='campanias' then 'public.harvest_cultivos_puede_leer(tenant_id,cultivo_id)'
      when t in ('lote_variedades','sesiones_lectura') then format('exists(select 1 from public.lotes l where l.id=%I.lote_id and l.tenant_id=%I.tenant_id and public.harvest_cultivos_puede_campania(l.tenant_id,l.campania_id))',t,t)
      when t='lecturas_jaba' then 'exists(select 1 from public.asignaciones_ticket a where a.id=lecturas_jaba.asignacion_ticket_id and a.tenant_id=lecturas_jaba.tenant_id and public.harvest_cultivos_puede_campania(a.tenant_id,a.campania_id))'
      when t='operaciones_pda_procesadas' then 'exists(select 1 from public.operaciones_pda_campania o where o.id=operaciones_pda_procesadas.id and o.tenant_id=operaciones_pda_procesadas.tenant_id and public.harvest_cultivos_puede_campania(o.tenant_id,o.campania_id))'
      else 'public.harvest_cultivos_puede_campania(tenant_id,campania_id)' end;
    execute format('create policy harvest_cultivo_participacion on public.%I as restrictive for select to authenticated using (%s)',t,condicion);
    if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then
      execute format('create policy harvest_cultivo_lectura_previa on public.%I for select to authenticated using (true)',t);
      execute format('alter table public.%I enable row level security',t);
    end if;
  end loop;
end $$;

do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'harvest_cultivos_%') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname in ('harvest_cultivos_catalogo','harvest_cultivos_crear','harvest_cultivos_campania','harvest_cultivos_solicitar','harvest_cultivos_resolver',
      'harvest_cultivos_puede_leer','harvest_cultivos_puede_campania','harvest_cultivos_puede_catalogo','harvest_cultivos_puede_reporte') then
      execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
