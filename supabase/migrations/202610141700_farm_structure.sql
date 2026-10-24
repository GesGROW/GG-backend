begin;
do $farm_f8$
begin
  if to_regprocedure('public.farm_f8_version()') is not null then return; end if;
  if to_regprocedure('public.portal_f77_version()') is null then raise exception 'Aplique F7.7 antes de Farm Structure F8'; end if;

-- Capacidad real nueva, sin reescribir planes, suscripciones, entitlements ni
-- snapshots comerciales F6.4. Se habilita después mediante el ciclo comercial.
insert into public.platform_modulos(codigo,nombre) values('FARM_STRUCTURE','Estructura agrícola');
do $$ declare r record; begin
  for r in select oid,conname from pg_constraint where conrelid='public.identity_permisos'::regclass and contype='c'
    and position('company.manage' in pg_get_constraintdef(oid))>0 loop
    execute format('alter table public.identity_permisos drop constraint %I',r.conname);
  end loop;
end $$;
alter table public.identity_permisos add constraint identity_permisos_catalogo_f8 check(codigo in (
  'company.manage','campaign.manage','workforce.manage','harvest.operate','harvest.manage','harvest.view','reports.view','farm.manage'));
insert into public.identity_permisos(codigo) values('farm.manage');
insert into public.identity_rol_permisos(tenant_id,rol_id,permiso)
  select tenant_id,id,'farm.manage' from public.identity_roles where codigo='ADMIN_EMPRESA' on conflict do nothing;
-- iam_sembrar_roles ya asigna todo el catálogo a ADMIN_EMPRESA de nuevos Tenants.

create table public.farm_fundos (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
  codigo text not null check(codigo=upper(btrim(codigo)) and length(codigo) between 1 and 30),
  nombre text not null check(length(btrim(nombre)) between 1 and 150),activo boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),unique(tenant_id,id),unique(tenant_id,codigo)
);
create table public.farm_sectores (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),fundo_id uuid not null,
  codigo text not null check(codigo=upper(btrim(codigo)) and length(codigo) between 1 and 30),
  nombre text not null check(length(btrim(nombre)) between 1 and 150),activo boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),unique(tenant_id,id),unique(tenant_id,fundo_id,codigo),
  foreign key(tenant_id,fundo_id) references public.farm_fundos(tenant_id,id)
);
create table public.farm_parcelas (
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),sector_id uuid not null,
  codigo text not null check(codigo=upper(btrim(codigo)) and length(codigo) between 1 and 30),
  nombre text not null check(length(btrim(nombre)) between 1 and 150),activo boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),unique(tenant_id,id),unique(tenant_id,sector_id,codigo),
  foreign key(tenant_id,sector_id) references public.farm_sectores(tenant_id,id)
);
-- No se interpreta ni modifica ninguna fila legacy de lotes. Relación opcional
-- M:N: cero parcelas históricas implícitas y ninguna restricción 1:1 inventada.
create table public.campaign_lote_parcelas (
  tenant_id uuid not null references public.tenants(id),lote_id uuid not null,parcela_id uuid not null,
  activo boolean not null default true,created_at timestamptz not null default clock_timestamp(),
  primary key(tenant_id,lote_id,parcela_id),
  foreign key(tenant_id,lote_id) references public.lotes(tenant_id,id),
  foreign key(tenant_id,parcela_id) references public.farm_parcelas(tenant_id,id)
);
create index campaign_parcela_lotes on public.campaign_lote_parcelas(tenant_id,parcela_id);
create index farm_sector_fundo on public.farm_sectores(tenant_id,fundo_id);
create index farm_parcela_sector on public.farm_parcelas(tenant_id,sector_id);

create function public.farm_no_borrar_historia()
returns trigger language plpgsql set search_path=pg_catalog,public as $$ begin raise exception 'Estructura y vínculos persistentes: use activación/desactivación'; end $$;
create function public.farm_validar_jerarquia()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_validar boolean;
begin
  if tg_op='UPDATE' and new.tenant_id<>old.tenant_id then raise exception 'Tenant inmutable'; end if;
  if tg_op='UPDATE' and (new.id<>old.id or new.created_at<>old.created_at) then raise exception 'Identidad física inmutable'; end if;
  v_validar:=tg_op='INSERT';
  if tg_op='UPDATE' then v_validar:=new.activo and not old.activo; end if;
  if tg_table_name='farm_sectores' then
    if tg_op='UPDATE' and new.fundo_id<>old.fundo_id then raise exception 'Fundo de un Sector es inmutable'; end if;
    if v_validar and not exists(select 1 from public.farm_fundos where id=new.fundo_id and tenant_id=new.tenant_id and activo) then
      raise exception 'Fundo inactivo o de otra empresa'; end if;
  elsif tg_table_name='farm_parcelas' then
    if tg_op='UPDATE' and new.sector_id<>old.sector_id then raise exception 'Sector de una Parcela es inmutable'; end if;
    if v_validar and not exists(select 1 from public.farm_sectores s join public.farm_fundos f on f.tenant_id=s.tenant_id and f.id=s.fundo_id
      where s.id=new.sector_id and s.tenant_id=new.tenant_id and s.activo and f.activo) then raise exception 'Sector/Fundo inactivo o de otra empresa'; end if;
  end if;
  return new;
end $$;
create function public.farm_exigir_gestion(p_tenant uuid)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant,'farm.manage');
  perform public.platform_exigir_modulo(p_tenant,'FARM_STRUCTURE');
end $$;
create function public.farm_tabla(p_tipo text)
returns text language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  if p_tipo is null or p_tipo not in ('fundos','sectores','parcelas') then raise exception 'Tipo físico desconocido'; end if;
  return 'farm_'||p_tipo;
end $$;
create function public.farm_dto(p_tenant uuid,p_tipo text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d jsonb; v_habilitado boolean; v_padre jsonb;
begin
  execute format('select to_jsonb(x) from public.%I x where tenant_id=$1 and id=$2',public.farm_tabla(p_tipo)) into d using p_tenant,p_id;
  if d is null then return null; end if;
  v_habilitado:=(d->>'activo')::boolean;
  if p_tipo='sectores' then v_habilitado:=v_habilitado and exists(select 1 from public.farm_fundos where id=(d->>'fundo_id')::uuid and tenant_id=p_tenant and activo);
  elsif p_tipo='parcelas' then v_habilitado:=v_habilitado and exists(select 1 from public.farm_sectores s join public.farm_fundos f on f.tenant_id=s.tenant_id and f.id=s.fundo_id
    where s.id=(d->>'sector_id')::uuid and s.tenant_id=p_tenant and s.activo and f.activo); end if;
  if p_tipo='sectores' then select to_jsonb(f) into v_padre from public.farm_fundos f where f.tenant_id=p_tenant and f.id=(d->>'fundo_id')::uuid;
  elsif p_tipo='parcelas' then select to_jsonb(s) into v_padre from public.farm_sectores s where s.tenant_id=p_tenant and s.id=(d->>'sector_id')::uuid; end if;
  return jsonb_build_object('id',d->>'id','tenantId',p_tenant,'codigo',d->>'codigo','nombre',d->>'nombre','activo',(d->>'activo')::boolean,
    'habilitado',v_habilitado,'padreId',coalesce(d->>'fundo_id',d->>'sector_id'),'padreCodigo',v_padre->>'codigo','padreNombre',v_padre->>'nombre',
    'fundoId',d->>'fundo_id','sectorId',d->>'sector_id','createdAt',d->>'created_at');
end $$;
create function public.farm_admin_listar(p_tenant_id uuid,p_tipo text,p_busqueda text default '',p_activo boolean default null,p_padre_id uuid default null,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_tabla text:=public.farm_tabla(p_tipo); v_filas jsonb; v_total bigint;
begin
  perform public.farm_exigir_gestion(p_tenant_id);
  if p_offset is null or p_offset<0 then raise exception 'Paginación inválida'; end if;
  execute format($q$select count(*) from public.%I x where tenant_id=$1 and position(lower(btrim(coalesce($2,''))) in lower(codigo||' '||nombre))>0
    and ($3 is null or activo=$3) and ($4 is null or coalesce(to_jsonb(x)->>'fundo_id',to_jsonb(x)->>'sector_id')=$4::text)$q$,v_tabla)
    into v_total using p_tenant_id,p_busqueda,p_activo,p_padre_id;
  execute format($q$select coalesce(jsonb_agg(dto order by codigo,id),'[]'::jsonb) from (select public.farm_dto($1,$5,id) dto,codigo,id from public.%I x
    where tenant_id=$1 and position(lower(btrim(coalesce($2,''))) in lower(codigo||' '||nombre))>0 and ($3 is null or activo=$3)
    and ($4 is null or coalesce(to_jsonb(x)->>'fundo_id',to_jsonb(x)->>'sector_id')=$4::text) order by codigo,id limit 50 offset $6) r$q$,v_tabla)
    into v_filas using p_tenant_id,p_busqueda,p_activo,p_padre_id,p_tipo,p_offset;
  return jsonb_build_object('filas',v_filas,'total',v_total);
end $$;
create function public.farm_admin_guardar(p_tenant_id uuid,p_tipo text,p_id uuid,p_codigo text,p_nombre text,p_activo boolean,p_padre_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_tabla text:=public.farm_tabla(p_tipo); v_id uuid:=p_id; v_padre text; v_columna text;
begin
  perform public.farm_exigir_gestion(p_tenant_id);
  if p_tipo<>'fundos' then
    if p_padre_id is null then raise exception 'Padre físico requerido'; end if;
    v_columna:=case p_tipo when 'sectores' then 'fundo_id' else 'sector_id' end;
    if p_id is not null then
      execute format('select %I::text from public.%I where tenant_id=$1 and id=$2',v_columna,v_tabla) into v_padre using p_tenant_id,p_id;
      if v_padre is not null and v_padre<>p_padre_id::text then raise exception 'Padre físico inmutable'; end if;
    end if;
  end if;
  if p_id is null then
    execute format('insert into public.%I(tenant_id,codigo,nombre,activo%s) values($1,upper(btrim($2)),btrim($3),$4%s) returning id',
      v_tabla,case when v_columna is null then '' else ','||quote_ident(v_columna) end,case when v_columna is null then '' else ',$5' end)
      into v_id using p_tenant_id,p_codigo,p_nombre,p_activo,p_padre_id;
  else
    execute format('update public.%I set codigo=upper(btrim($3)),nombre=btrim($4),activo=$5 where tenant_id=$1 and id=$2 returning id',v_tabla)
      into v_id using p_tenant_id,p_id,p_codigo,p_nombre,p_activo;
    if v_id is null then raise exception using errcode='42501',message='Estructura de otra empresa o inexistente'; end if;
  end if;
  return public.farm_dto(p_tenant_id,p_tipo,v_id);
end $$;
create function public.farm_admin_estado(p_tenant_id uuid,p_tipo text,p_id uuid,p_activo boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  perform public.farm_exigir_gestion(p_tenant_id);
  execute format('update public.%I set activo=$3 where tenant_id=$1 and id=$2 returning id',public.farm_tabla(p_tipo)) into v_id using p_tenant_id,p_id,p_activo;
  if v_id is null then raise exception using errcode='42501',message='Estructura de otra empresa o inexistente'; end if;
  return public.farm_dto(p_tenant_id,p_tipo,v_id);
end $$;

-- Contrato SQL público de Farm para consumidores: sólo referencias físicas del
-- mismo Tenant. Campaign no consulta repositorios internos ni Harvest participa.
create function public.farm_exigir_parcela_vinculable(p_tenant uuid,p_parcela uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform 1 from public.farm_parcelas p join public.farm_sectores s on s.id=p.sector_id and s.tenant_id=p.tenant_id
    join public.farm_fundos f on f.id=s.fundo_id and f.tenant_id=s.tenant_id
    where p.id=p_parcela and p.tenant_id=p_tenant and p.activo and s.activo and f.activo for share of p,s,f;
  if not found then raise exception using errcode='42501',message='Parcela de otra empresa, inexistente o jerarquía inactiva'; end if;
end $$;
create function public.farm_describir_parcela(p_tenant uuid,p_parcela uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select public.farm_dto(p_tenant,'parcelas',p_parcela);
$$;
create function public.farm_parcelas_seleccionables(p_tenant_id uuid,p_busqueda text default '')
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_exigir_permiso(p_tenant_id,'campaign.manage');
  perform public.platform_exigir_modulo(p_tenant_id,'CAMPAIGN');
  perform public.platform_exigir_modulo(p_tenant_id,'FARM_STRUCTURE');
  return (select coalesce(jsonb_agg(x order by x->>'nombre'),'[]'::jsonb) from (
    select jsonb_build_object('id',p.id,'codigo',p.codigo,'nombre',f.nombre||' / '||s.nombre||' / '||p.nombre) x
    from public.farm_parcelas p join public.farm_sectores s on s.id=p.sector_id and s.tenant_id=p.tenant_id join public.farm_fundos f on f.id=s.fundo_id and f.tenant_id=s.tenant_id
    where p.tenant_id=p_tenant_id and p.activo and s.activo and f.activo
      and position(lower(btrim(coalesce(p_busqueda,''))) in lower(p.codigo||' '||p.nombre||' '||s.nombre||' '||f.nombre))>0
    order by f.nombre,s.nombre,p.nombre,p.id limit 50) r);
end $$;
create function public.campaign_exigir_vinculo_parcela(p_tenant uuid,p_campania uuid,p_lote uuid)
returns void language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_admin_exigir_campania(p_tenant,p_campania);
  perform public.platform_exigir_modulo(p_tenant,'FARM_STRUCTURE');
  perform 1 from public.lotes where id=p_lote and campania_id=p_campania and tenant_id=p_tenant for update;
  if not found then raise exception using errcode='42501',message='Lote operativo de otra campaña o empresa'; end if;
end $$;
create function public.campaign_admin_parcelas_lote(p_tenant_id uuid,p_campania_id uuid,p_lote_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_exigir_vinculo_parcela(p_tenant_id,p_campania_id,p_lote_id);
  return (select coalesce(jsonb_agg(public.farm_describir_parcela(p_tenant_id,r.parcela_id)||jsonb_build_object('vinculoActivo',r.activo) order by r.parcela_id),'[]'::jsonb)
    from public.campaign_lote_parcelas r
    where r.tenant_id=p_tenant_id and r.lote_id=p_lote_id);
end $$;
create function public.campaign_admin_vincular_parcela(p_tenant_id uuid,p_campania_id uuid,p_lote_id uuid,p_parcela_id uuid,p_vincular boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  perform public.campaign_exigir_vinculo_parcela(p_tenant_id,p_campania_id,p_lote_id);
  if p_vincular is null then raise exception 'Intención de vínculo requerida'; end if;
  if p_vincular then
    perform public.farm_exigir_parcela_vinculable(p_tenant_id,p_parcela_id);
    insert into public.campaign_lote_parcelas(tenant_id,lote_id,parcela_id) values(p_tenant_id,p_lote_id,p_parcela_id)
      on conflict(tenant_id,lote_id,parcela_id) do update set activo=true;
  else
    update public.campaign_lote_parcelas set activo=false where tenant_id=p_tenant_id and lote_id=p_lote_id and parcela_id=p_parcela_id;
    if not found then raise exception using errcode='42501',message='Vínculo de otra empresa o inexistente'; end if;
  end if;
  return public.campaign_admin_parcelas_lote(p_tenant_id,p_campania_id,p_lote_id);
end $$;
create function public.campaign_proteger_vinculo_fisico()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and (new.tenant_id<>old.tenant_id or new.lote_id<>old.lote_id or new.parcela_id<>old.parcela_id) then raise exception 'Identidad del vínculo físico inmutable'; end if;
  if new.activo and (tg_op='INSERT' or not old.activo) then perform public.farm_exigir_parcela_vinculable(new.tenant_id,new.parcela_id); end if;
  return new;
end $$;
create trigger campaign_vinculo_fisico before insert or update on public.campaign_lote_parcelas for each row execute function public.campaign_proteger_vinculo_fisico();
do $$ declare t text; begin
  foreach t in array array['farm_fundos','farm_sectores','farm_parcelas','campaign_lote_parcelas'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on public.%I from service_role',t); end if;
    execute format('create trigger farm_historia_no_delete before delete on public.%I for each row execute function public.farm_no_borrar_historia()',t);
    execute format('create trigger farm_historia_no_truncate before truncate on public.%I for each statement execute function public.farm_no_borrar_historia()',t);
    if t<>'campaign_lote_parcelas' then execute format('create trigger farm_jerarquia before insert or update on public.%I for each row execute function public.farm_validar_jerarquia()',t); end if;
  end loop;
end $$;
create function public.farm_f8_version() returns integer language sql immutable as $$ select 1; $$;
do $$ declare r record; begin
  for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname like 'farm_%' or p.proname in ('campaign_exigir_vinculo_parcela','campaign_admin_parcelas_lote','campaign_admin_vincular_parcela','campaign_proteger_vinculo_fisico')) loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if exists(select 1 from pg_roles where rolname='service_role') then execute format('revoke all on function %s from service_role',r.oid::regprocedure); end if;
    if r.proname in ('farm_admin_listar','farm_admin_guardar','farm_admin_estado','farm_parcelas_seleccionables','campaign_admin_parcelas_lote','campaign_admin_vincular_parcela') then
      execute format('grant execute on function %s to authenticated',r.oid::regprocedure); end if;
  end loop;
end $$;
end $farm_f8$;
notify pgrst,'reload schema';
commit;
