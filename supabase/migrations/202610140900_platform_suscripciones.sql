begin;
-- F6.1 desplegada y F6.2 permanecen intactas. El marcador se confirma junto
-- con catálogo, piloto y guardas; un fallo revierte toda esta fase.
do $platform_f63$
begin
  if obj_description(to_regclass('public.platform_planes'),'pg_class') =
    'GesGROW F6.3: suscripciones y entitlements v1' then return; end if;
  if to_regprocedure('public.iam_resolver_tenant_context(uuid)') is null then
    raise exception 'Aplique Identity F6.2 antes de F6.3';
  end if;

create table public.platform_modulos (
  codigo text primary key check(codigo=upper(btrim(codigo)) and codigo<>''),
  nombre text not null check(btrim(nombre)<>''),
  disponible boolean not null default true
);
-- Sólo capacidades existentes. Nuevos códigos requieren una migración que
-- publique su capacidad real; Identity y Platform son capacidades base.
insert into public.platform_modulos(codigo,nombre) values
  ('HARVEST','Cosecha'),('CAMPAIGN','Gestión de campañas'),('WORKFORCE','Gestión de trabajadores');
create table public.platform_planes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check(codigo=upper(btrim(codigo)) and codigo<>''),
  nombre text not null check(btrim(nombre)<>''),
  activo boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);
create table public.platform_plan_modulos (
  plan_id uuid not null references public.platform_planes(id),
  modulo_codigo text not null references public.platform_modulos(codigo),
  primary key(plan_id,modulo_codigo)
);
create table public.platform_suscripciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id),
  plan_id uuid not null references public.platform_planes(id),
  estado text not null check(estado in ('TRIAL','ACTIVA','SUSPENDIDA','CANCELADA','VENCIDA')),
  desde timestamptz not null,
  hasta timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(tenant_id,id),
  check(hasta is null or hasta>desde),
  check(estado<>'TRIAL' or hasta is not null)
);
create table public.platform_tenant_modulos (
  tenant_id uuid not null references public.tenants(id),
  suscripcion_id uuid not null,
  modulo_codigo text not null references public.platform_modulos(codigo),
  habilitado boolean not null default true,
  origen text not null check(origen in ('PLAN','ADD_ON','EXCEPCION')),
  desde timestamptz not null,
  hasta timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key(tenant_id,modulo_codigo),
  foreign key(tenant_id,suscripcion_id) references public.platform_suscripciones(tenant_id,id),
  check(hasta is null or hasta>desde)
);
-- Una suscripción actual por empresa. Su estado puede evolucionar; el
-- historial comercial/renovaciones se incorporará en una fase posterior.
create trigger a_platform_propietario before insert or update on public.platform_suscripciones
  for each row execute function public.platform_heredar_tenant();
create trigger a_platform_propietario before insert or update on public.platform_tenant_modulos
  for each row execute function public.platform_heredar_tenant();

insert into public.platform_planes(id,codigo,nombre) values
  ('00000000-0000-4000-8000-000000000063','PILOTO_SCC','Piloto SCC'),
  ('00000000-0000-4000-8000-000000000064','OPERACION_CAMPO','Operación de campo');
insert into public.platform_plan_modulos(plan_id,modulo_codigo)
  select id,m.codigo from public.platform_planes p cross join public.platform_modulos m
  where p.codigo='PILOTO_SCC' or (p.codigo='OPERACION_CAMPO' and m.codigo='HARVEST');

-- Provisionamiento de confianza, nunca una compra/autoconcesión desde UI.
-- Copia inicial, no sincronización permanente con el nombre o catálogo del
-- Plan. Add-ons, excepciones y bajas se persisten sobre el entitlement.
create function public.platform_crear_suscripcion(p_tenant_id uuid,p_plan_id uuid,
  p_estado text,p_desde timestamptz,p_hasta timestamptz default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.platform_planes where id=p_plan_id and activo) then
    raise exception 'Plan no disponible'; end if;
  insert into public.platform_suscripciones(tenant_id,plan_id,estado,desde,hasta)
    values(p_tenant_id,p_plan_id,p_estado,p_desde,p_hasta) returning id into v_id;
  insert into public.platform_tenant_modulos(tenant_id,suscripcion_id,modulo_codigo,origen,desde)
    select p_tenant_id,v_id,pm.modulo_codigo,'PLAN',p_desde
    from public.platform_plan_modulos pm join public.platform_modulos m on m.codigo=pm.modulo_codigo
    where pm.plan_id=p_plan_id and m.disponible;
  return v_id;
end $$;
perform public.platform_crear_suscripcion('00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000063','ACTIVA',statement_timestamp(),null);

-- Resolución privada por datos persistidos y reloj del servidor. No lee GUC
-- tenant/módulos, JWT comerciales ni listas de capacidades de un cliente.
create function public.platform_modulo_habilitado(p_tenant_id uuid,p_modulo text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.platform_tenant_modulos e
    join public.platform_suscripciones s on s.tenant_id=e.tenant_id and s.id=e.suscripcion_id
    join public.platform_modulos m on m.codigo=e.modulo_codigo
    join public.tenants t on t.id=e.tenant_id
    where e.tenant_id=p_tenant_id and e.modulo_codigo=p_modulo and e.habilitado and m.disponible
      and t.estado='ACTIVA' and s.estado in ('TRIAL','ACTIVA')
      and s.desde<=statement_timestamp() and (s.hasta is null or statement_timestamp()<s.hasta)
      and e.desde<=statement_timestamp() and (e.hasta is null or statement_timestamp()<e.hasta));
$$;
create function public.platform_puede_usar_modulo(p_tenant_id uuid,p_modulo text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_resolver_tenant_context(p_tenant_id);
  return public.platform_modulo_habilitado(p_tenant_id,p_modulo);
end $$;
create function public.platform_exigir_modulo(p_tenant_id uuid,p_modulo text)
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.platform_modulo_habilitado(p_tenant_id,p_modulo) then
    raise exception using errcode='42501',message='Módulo no habilitado: '||p_modulo;
  end if;
end $$;

-- El selector de campañas sirve también como recurso de Harvest/reportes.
-- No exige contratar la gestión Campaign para operar Harvest ya habilitado.
create function public.platform_exigir_catalogo_campanias(p_tenant_id uuid)
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public.iam_resolver_tenant_context(p_tenant_id);
  if not ((public.iam_tiene_permiso(p_tenant_id,'campaign.manage') and
      public.platform_modulo_habilitado(p_tenant_id,'CAMPAIGN')) or
    ((public.iam_tiene_permiso(p_tenant_id,'harvest.view') or
      public.iam_tiene_permiso(p_tenant_id,'harvest.operate') or
      public.iam_tiene_permiso(p_tenant_id,'reports.view')) and
      public.platform_modulo_habilitado(p_tenant_id,'HARVEST'))) then
    raise exception using errcode='42501',message='Permiso y módulo requeridos para consultar campañas';
  end if;
end $$;

-- Envolver sólo APIs operativas conocidas, sin sustituir los cuerpos de F5,
-- las guardas Identity, ACL, firmas, recibos ni restauración de contexto F6.1.
-- La guarda exterior corre antes de inicializadores DECLARE/RETURN tempranos.
do $guards$
declare r record; original text; cuerpo text; nuevo text; modulo text;
  tenant text; guardas text; permiso text; base text;
begin
  for r in select p.oid,p.proname,p.proargnames,p.proretset,l.lanname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and l.lanname in ('plpgsql','sql')
  loop
    base:=regexp_replace(r.proname,'_hoja$','');
    modulo:=case
      when base in ('iam_guardar_campania','admin_guardar_campania','admin_listar_campanias',
        'admin_guardar_lote','admin_guardar_lote_variedades','admin_listar_lotes',
        'admin_guardar_variedad','admin_listar_variedades') then 'CAMPAIGN'
      when base in ('iam_guardar_trabajador','iam_listar_trabajadores',
        'admin_guardar_trabajador','admin_listar_trabajadores','admin_guardar_rol_campania','admin_listar_roles_campania') then 'WORKFORCE'
      when r.proname in ('iam_obtener_reporte','iam_consultar_ticket','iam_recursos_campania',
        'iam_activar_harvest','iam_asignar_lote','iam_iniciar_sesion_lectura','iam_cerrar_sesion_lectura',
        'iam_registrar_cosecha','harvest_crear_lotes_tickets','harvest_resolver_ticket',
        'harvest_asignar_lote_tickets','harvest_registrar_cosecha','harvest_obtener_snapshot',
        'harvest_asignar_v4','harvest_registrar_v4','admin_activar_harvest_campania')
        or regexp_replace(base,'_campania$','') in ('asignar_ticket','registrar_jabero','iniciar_sesion_lectura','cerrar_sesion_lectura',
          'registrar_lectura_jaba','obtener_o_registrar_cosechador_activo','obtener_cache_operativa',
          'obtener_resumen','obtener_resumen_campania','obtener_produccion_diaria','obtener_produccion_lotes',
          'obtener_ranking_cosechadores','obtener_ranking_cosechadores_periodo',
          'admin_obtener_resumen','admin_obtener_resumen_campania','admin_obtener_produccion_diaria',
          'admin_obtener_produccion_lotes','admin_obtener_ranking_cosechadores',
          'admin_obtener_ranking_cosechadores_periodo','listar_lotes_activos_v2','listar_lotes_activos') then 'HARVEST'
    end;
    guardas:='';
    if r.proname='iam_listar_campanias' then
      guardas:='perform public.platform_exigir_catalogo_campanias(p_tenant_id);';
    elsif modulo is not null then
      tenant:=case
        when 'p_tenant_id'=any(r.proargnames) then 'p_tenant_id'
        when 'p_contexto_campania_id'=any(r.proargnames) then 'public.platform_tenant_campania(p_contexto_campania_id)'
        when 'p_campania_id'=any(r.proargnames) then 'public.platform_tenant_campania(p_campania_id)'
        else 'public.platform_tenant_operativo()' end;
      -- Validar Identity antes de consultar la capacidad comercial.
      if r.proname like 'iam_%' then
        permiso:=case when modulo='CAMPAIGN' or r.proname='iam_activar_harvest' then 'campaign.manage'
          when modulo='WORKFORCE' then 'workforce.manage'
          when r.proname='iam_obtener_reporte' then 'reports.view'
          when r.proname in ('iam_consultar_ticket','iam_recursos_campania') then 'harvest.view'
          else 'harvest.operate' end;
        guardas:=format('perform public.iam_exigir_permiso(%s,%L);',tenant,permiso);
      end if;
      guardas:=guardas||format('perform public.platform_exigir_modulo(%s,%L);',tenant,modulo);
    end if;
    if guardas='' then continue; end if;
    original:=pg_get_functiondef(r.oid);
    cuerpo:=substring(original from '\$function\$(.*)\$function\$');
    if cuerpo is null then raise exception 'Cuerpo no disponible: %',r.oid::regprocedure; end if;
    if r.lanname='plpgsql' then
      cuerpo:=regexp_replace(cuerpo,';?\s*$',';');
      nuevo:='begin '||guardas||E'\n'||cuerpo||E'\nend;';
    else
      cuerpo:=regexp_replace(cuerpo,';\s*$','');
      nuevo:='begin '||guardas||case when r.proretset then ' return query '||cuerpo||';'
        else ' return ('||cuerpo||');' end||' end;';
      original:=replace(original,'LANGUAGE sql','LANGUAGE plpgsql');
    end if;
    execute replace(original,'$function$'||substring(original from '\$function\$(.*)\$function\$')||'$function$',
      '$function$'||nuevo||'$function$');
  end loop;
end $guards$;

-- Catálogos y contrato se consultan por membresía; nunca se conceden módulos
-- con company.manage. Sólo el backend de confianza puede provisionar.
do $$ declare tabla text; begin
  foreach tabla in array array['platform_modulos','platform_planes','platform_plan_modulos',
    'platform_suscripciones','platform_tenant_modulos'] loop
    execute format('alter table public.%I enable row level security',tabla);
    execute format('revoke all on public.%I from public,anon,authenticated',tabla);
    execute format('grant select on public.%I to authenticated',tabla);
  end loop;
end $$;
create policy platform_modulos_lectura on public.platform_modulos for select to authenticated using(true);
create policy platform_planes_lectura on public.platform_planes for select to authenticated using(true);
create policy platform_plan_modulos_lectura on public.platform_plan_modulos for select to authenticated using(true);
create policy platform_suscripciones_lectura on public.platform_suscripciones for select to authenticated
  using(public.iam_es_miembro(tenant_id));
create policy platform_tenant_modulos_lectura on public.platform_tenant_modulos for select to authenticated
  using(public.iam_es_miembro(tenant_id));
revoke all on function public.platform_crear_suscripcion(uuid,uuid,text,timestamptz,timestamptz),
  public.platform_modulo_habilitado(uuid,text),public.platform_exigir_modulo(uuid,text),
  public.platform_exigir_catalogo_campanias(uuid),public.platform_puede_usar_modulo(uuid,text)
  from public,anon,authenticated;
grant execute on function public.platform_puede_usar_modulo(uuid,text) to authenticated;
-- Supabase dispone de service_role; las fixtures mínimas pueden omitirlo.
if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.platform_crear_suscripcion(uuid,uuid,text,timestamptz,timestamptz) to service_role;
  grant select,insert,update on public.platform_suscripciones,public.platform_tenant_modulos to service_role;
  grant select on public.platform_modulos,public.platform_planes,public.platform_plan_modulos to service_role;
end if;
comment on table public.platform_planes is 'GesGROW F6.3: suscripciones y entitlements v1';
end $platform_f63$;
notify pgrst,'reload schema';
commit;
