begin;

-- Una ejecución completa se marca dentro de esta misma transacción. El fallo
-- de Supabase revierte también el marcador, por lo que se puede volver a aplicar.
do $platform_f61$
begin
  if obj_description(to_regclass('public.tenants'),'pg_class') =
    'GesGROW F6.1: ownership y contexto transaccional v1' then
    return;
  end if;

-- F6.1: ownership organizacional. No se cambia la autenticación provisional.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  codigo text not null unique check (codigo = upper(btrim(codigo)) and codigo <> ''),
  estado text not null default 'ACTIVA' check (estado in ('ACTIVA','SUSPENDIDA','INACTIVA')),
  created_at timestamptz not null default clock_timestamp()
);
insert into public.tenants(id,nombre,codigo)
values('00000000-0000-4000-8000-000000000001','SCC','SCC');
alter table public.tenants enable row level security;
revoke all on public.tenants from public,anon,authenticated;

create function public.platform_tenant_campania(p_id uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
  select tenant_id into v_id from public.campanias where id=p_id;
  if v_id is null then raise exception 'No se pudo resolver el Tenant de la campaña'; end if;
  return v_id;
end $$;

create function public.platform_tenant_operativo()
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_campania uuid;
begin
  -- Solo contexto de campaña ya utilizado por los RPC autorizados. No se lee
  -- un p_tenant_id ni una GUC tenant_id suministrada por el cliente.
  v_campania := coalesce(nullif(current_setting('scc.campania_id',true),''),
    nullif(current_setting('scc.hoja_campania_id',true),''))::uuid;
  if v_campania is not null then return public.platform_tenant_campania(v_campania); end if;
  -- Contratos legacy sin contexto siguen perteneciendo únicamente al SCC.
  return '00000000-0000-4000-8000-000000000001'::uuid;
end $$;
revoke all on function public.platform_tenant_campania(uuid),public.platform_tenant_operativo()
from public,anon,authenticated;

-- Añadir la columna con DEFAULT constante rellena el histórico sin UPDATE:
-- conserva los triggers inmutables de cutover y los hechos de producción F5.
do $$ declare tabla text;
begin
  foreach tabla in array array[
    'campanias','trabajadores','usuarios_app','trabajador_campania_rol',
    'variedades','lotes','lote_variedades','sesiones_lectura','asignaciones_ticket','lecturas_jaba',
    'operaciones_pda_campania','operaciones_pda_procesadas',
    'harvest_lotes_tickets','harvest_tickets','harvest_asignaciones_lote',
    'harvest_registros_cosecha','harvest_cutovers',
    'integraciones_api','integracion_campania','trabajadores_campania_hoja'
  ] loop
    if to_regclass('public.'||tabla) is null then
      -- Las fixtures mínimas pueden omitir tablas de integración; producción
      -- las tiene desde Sheets. Ninguna tabla existente queda sin propietario.
      if tabla in ('integraciones_api','integracion_campania','trabajadores_campania_hoja') then continue; end if;
      raise exception 'Falta la tabla requerida %; aplique F5 antes de F6.1',tabla;
    end if;
    execute format('alter table public.%I add column tenant_id uuid not null default %L references public.tenants(id)',
      tabla,'00000000-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column tenant_id drop default',tabla);
    execute format('create index %I on public.%I(tenant_id)',tabla||'_tenant_idx',tabla);
  end loop;
end $$;
alter table public.campanias alter column tenant_id set default public.platform_tenant_operativo();
alter table public.trabajadores alter column tenant_id set default public.platform_tenant_operativo();
alter table public.variedades alter column tenant_id set default public.platform_tenant_operativo();

-- Herencia del propietario desde la relación principal, antes de NOT NULL/FK.
-- Los demás padres quedan contrastados por claves foráneas compuestas abajo.
create function public.platform_heredar_tenant()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_padre uuid; v_fila jsonb := to_jsonb(new);
begin
  if tg_op='UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'El propietario Tenant es inmutable';
  end if;
  if tg_nargs=2 and v_fila->>tg_argv[1] is not null then
    execute format('select tenant_id from public.%I where id=$1',tg_argv[0])
      into v_padre using (v_fila->>tg_argv[1])::uuid;
  elsif tg_nargs=3 and v_fila->>tg_argv[1] is not null then
    execute format('select tenant_id from public.%I where %I=$1',tg_argv[0],tg_argv[2])
      into v_padre using (v_fila->>tg_argv[1])::uuid;
  end if;
  new.tenant_id := coalesce(new.tenant_id,v_padre,public.platform_tenant_operativo());
  if v_padre is not null and new.tenant_id <> v_padre then
    raise exception using errcode='23503',message='Relación cross-tenant rechazada';
  end if;
  return new;
end $$;
revoke all on function public.platform_heredar_tenant() from public,anon,authenticated;

do $$ declare r record;
begin
  for r in select * from (values
    ('campanias',null::text,null::text),('trabajadores',null,null),('variedades',null,null),
    ('usuarios_app','trabajadores','trabajador_id'),
    ('trabajador_campania_rol','campanias','campania_id'),
    ('lotes','campanias','campania_id'),('lote_variedades','lotes','lote_id'),
    ('sesiones_lectura','lotes','lote_id'),('asignaciones_ticket','campanias','campania_id'),
    ('lecturas_jaba','asignaciones_ticket','asignacion_ticket_id'),
    ('operaciones_pda_campania','campanias','campania_id'),
    ('operaciones_pda_procesadas','operaciones_pda_campania','id'),
    ('harvest_lotes_tickets','campanias','campania_id'),('harvest_tickets','campanias','campania_id'),
    ('harvest_asignaciones_lote','campanias','campania_id'),
    ('harvest_registros_cosecha','campanias','campania_id'),
    ('harvest_cutovers','campanias','campania_id'),
    ('integraciones_api',null,null),('integracion_campania','campanias','campania_id'),
    ('trabajadores_campania_hoja','campanias','campania_id')
  ) as t(tabla,padre,campo) loop
    if to_regclass('public.'||r.tabla) is null then continue; end if;
    execute format('create trigger a_platform_propietario before insert or update on public.%I
      for each row execute function public.platform_heredar_tenant(%s)',r.tabla,
      case when r.padre is null then '' else format('%L,%L',r.padre,r.campo) end);
  end loop;
end $$;

-- Cada FK entre tablas operativas conserva sus columnas y además exige Tenant.
-- Esto incluye trabajador/rol/usuario/sesión/variedad/ticket/cutover/integración.
-- NOT VALID permite declarar primero y luego validar todo el SCC dentro de la
-- misma transacción; cualquier incoherencia aborta sin borrar ni reparar hechos.
do $$ declare r record; locales text; remotas text; nombre text; i integer := 0;
begin
  for r in select c.*, child.relname as hija, parent.relname as padre
    from pg_constraint c join pg_class child on child.oid=c.conrelid
    join pg_class parent on parent.oid=c.confrelid
    where c.contype='f' and child.relnamespace='public'::regnamespace
      and exists(select 1 from pg_attribute a where a.attrelid=c.conrelid and a.attname='tenant_id')
      and exists(select 1 from pg_attribute a where a.attrelid=c.confrelid and a.attname='tenant_id')
    order by c.oid
  loop
    select string_agg(quote_ident(a.attname),',' order by k.orden) into locales
    from unnest(r.conkey) with ordinality k(num,orden)
    join pg_attribute a on a.attrelid=r.conrelid and a.attnum=k.num;
    select string_agg(quote_ident(a.attname),',' order by k.orden) into remotas
    from unnest(r.confkey) with ordinality k(num,orden)
    join pg_attribute a on a.attrelid=r.confrelid and a.attnum=k.num;
    i := i+1; nombre := 'platform_tenant_fk_'||i;
    if not exists(select 1 from pg_constraint c
      where c.conrelid=r.confrelid and c.contype='u'
        and c.conkey=array[(select attnum from pg_attribute
          where attrelid=r.confrelid and attname='tenant_id')]::smallint[]||r.confkey) then
      execute format('alter table public.%I add constraint %I unique(tenant_id,%s)',
        r.padre,'platform_tenant_ref_'||i,remotas);
    end if;
    execute format('alter table public.%I add constraint %I foreign key(tenant_id,%s)
      references public.%I(tenant_id,%s) not valid',r.hija,nombre,locales,r.padre,remotas);
    execute format('alter table public.%I validate constraint %I',r.hija,nombre);
  end loop;
end $$;

-- DNI y código de campaña dejan de ser identificadores globales de GesGROW.
do $$ declare r record;
begin
  for r in select c.conrelid::regclass as tabla,c.conname from pg_constraint c
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    where c.contype='u' and cardinality(c.conkey)=1
      and ((c.conrelid='public.trabajadores'::regclass and a.attname='dni')
        or (c.conrelid='public.campanias'::regclass and a.attname='codigo'))
  loop execute format('alter table %s drop constraint %I',r.tabla,r.conname); end loop;
  -- Algunas instalaciones legacy expresan la unicidad con un índice suelto.
  for r in select x.indexrelid::regclass as indice from pg_index x
    join pg_attribute a on a.attrelid=x.indrelid and a.attnum=x.indkey[0]
    where x.indisunique and not x.indisprimary and x.indnkeyatts=1 and x.indexprs is null
      and not exists(select 1 from pg_constraint c where c.conindid=x.indexrelid)
      and ((x.indrelid='public.trabajadores'::regclass and a.attname='dni')
        or (x.indrelid='public.campanias'::regclass and a.attname='codigo'))
  loop execute format('drop index %s',r.indice); end loop;
end $$;
alter table public.trabajadores add constraint trabajadores_tenant_dni_key unique(tenant_id,dni);
alter table public.campanias add constraint campanias_tenant_codigo_key unique(tenant_id,codigo);
drop index public.ux_campanias_una_activa_por_cultivo;
create unique index ux_campanias_una_activa_por_tenant_cultivo
on public.campanias(tenant_id,cultivo_id) where estado='ACTIVA'::public.estado_campania;
drop index public.variedades_nombre_por_cultivo;
create unique index variedades_nombre_por_tenant_cultivo on public.variedades(tenant_id,cultivo_id,nombre);

-- Adaptar también los cuerpos legacy no versionados, como en F4/0400.
-- Se mantienen nombres, ACL, parámetros, huellas y recibos. Los GUC de campaña
-- son exclusivamente locales a la transacción, nunca opciones permanentes.
do $migration$
declare
  r record; original text; actualizado text; parametro text;
  cuerpo text; envoltura text; retorno text; resolver_tenant text; retorno_sin_expresion boolean;
begin
  for r in select p.oid,p.proname,p.proargnames,p.proargmodes,p.proretset,
      p.prorettype::regtype::text as tipo_retorno,l.lanname
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and l.lanname in ('plpgsql','sql')
      and p.proname not like 'platform_%'
  loop
    parametro := case when 'p_contexto_campania_id'=any(r.proargnames) then 'p_contexto_campania_id'
      when 'p_campania_id'=any(r.proargnames) then 'p_campania_id' end;
    resolver_tenant := case when parametro is null then 'public.platform_tenant_operativo()'
      else format('case when %1$I is null then public.platform_tenant_operativo() else public.platform_tenant_campania(%1$I) end',parametro) end;
    original := pg_get_functiondef(r.oid); actualizado := original;
    -- Solo comparaciones SQL, nunca SET dni = ... ni claves JSON.
    actualizado := regexp_replace(actualizado,'(\m[a-z_][a-z_0-9]*)\.dni\s*=',
      format('\1.tenant_id = (%s) AND \1.dni =',resolver_tenant),'gi');
    actualizado := regexp_replace(actualizado,'on\s+conflict\s*\(\s*dni\s*\)',
      'on conflict (tenant_id,dni)','gi');
    -- La tabla ganó una columna: dejar explícita la lista del INSERT antiguo.
    actualizado := replace(actualizado,'insert into public.operaciones_pda_campania values(',
      'insert into public.operaciones_pda_campania(id,campania_id,dni_operador,tipo) values(');
    -- Búsqueda sin alias de Sheets (la alternativa por UUID se comprueba antes).
    actualizado := replace(actualizado,'p_trabajador_id is null and dni =',
      'p_trabajador_id is null and tenant_id = public.platform_tenant_operativo() and dni =');
    -- Los maestros legacy por UUID/nombre/código se acotan igual que el DNI.
    if r.proname like 'admin_guardar_%' then
      actualizado := regexp_replace(actualizado,'(\mwhere\s+)([a-z_][a-z_0-9]*)\.(id|nombre|codigo)\s*=',
        '\1\2.tenant_id = public.platform_tenant_operativo() AND \2.\3 =','gi');
    end if;
    if r.proname='admin_guardar_campania' then
      actualizado := regexp_replace(actualizado,'(\mc\.estado\s*=)',
        'c.tenant_id = public.platform_tenant_operativo() AND \1','gi');
    end if;
    if r.proname in ('autorizar_integracion_gestion_maestros','autorizar_integracion_reportes') then
      actualizado := replace(actualizado,'where auth_user_id = auth.uid() and activo',
        'where tenant_id = public.platform_tenant_operativo() and auth_user_id = auth.uid() and activo');
    end if;
    -- Listados legacy sin contexto: SCC; hojas: Tenant de campaña autorizado.
    if r.proname='admin_listar_trabajadores' then
      actualizado := replace(actualizado,'from public.trabajadores t;',
        'from public.trabajadores t where t.tenant_id=public.platform_tenant_operativo();');
    elsif r.proname='admin_listar_campanias' then
      actualizado := replace(actualizado,'from public.campanias c;',
        'from public.campanias c where c.tenant_id=public.platform_tenant_operativo();');
    elsif r.proname='admin_listar_variedades' then
      actualizado := replace(actualizado,'from public.variedades v;',
        'from public.variedades v where v.tenant_id=public.platform_tenant_operativo();');
    elsif r.proname='admin_listar_lotes' then
      actualizado := replace(actualizado,'on c.id = l.campania_id;',
        'on c.id = l.campania_id where l.tenant_id=public.platform_tenant_operativo();');
    elsif r.proname='admin_listar_roles_campania' then
      actualizado := replace(actualizado,'on ua.trabajador_id = tcr.trabajador_id;',
        'on ua.trabajador_id = tcr.trabajador_id where tcr.tenant_id=public.platform_tenant_operativo();');
    elsif r.proname='campania_operativa_id' then
      actualizado := replace(actualizado,'from public.campanias where estado = ''ACTIVA'';',
        'from public.campanias where estado = ''ACTIVA'' and tenant_id=public.platform_tenant_operativo();');
    end if;
    if parametro is not null and r.lanname='plpgsql' then
      retorno_sin_expresion := r.tipo_retorno='void' or r.proretset
        or coalesce('o'=any(r.proargmodes) or 'b'=any(r.proargmodes),false);
      -- Se conserva íntegro el bloque y sus manejadores de excepción existentes.
      -- Los RETURN salen del bloque etiquetado; un único epílogo restaura el
      -- contexto después de evaluar el resultado, antes de devolverlo al cliente.
      cuerpo := substring(actualizado from '\$function\$(.*)\$function\$');
      if cuerpo is null then raise exception 'No se pudo leer el cuerpo de %',r.oid::regprocedure; end if;
      if retorno_sin_expresion then
        -- RETURN NEXT/QUERY acumulan filas y no salen de la función.
        cuerpo := regexp_replace(cuerpo,'\mreturn\s*;', 'exit platform_cuerpo;', 'gi');
        retorno := 'return;';
      else
        cuerpo := regexp_replace(cuerpo,'\mreturn\s+([^;]+);',
          'v_platform_resultado := \1; exit platform_cuerpo;', 'gi');
        retorno := 'return v_platform_resultado;';
      end if;
      -- Algunos RPC legacy omiten el punto y coma del END final del cuerpo.
      cuerpo := regexp_replace(cuerpo,';?\s*$',';');
      envoltura := format($scope$
        declare
          v_platform_campania_anterior text := current_setting('scc.campania_id',true);
          v_platform_hoja_anterior text := current_setting('scc.hoja_campania_id',true);
          %s
        begin
          if %I is not null then
            perform public.platform_tenant_campania(%I);
            perform set_config('scc.campania_id',%I::text,true);
          end if;
          <<platform_cuerpo>>
          %s
          perform set_config('scc.campania_id',coalesce(v_platform_campania_anterior,''),true);
          perform set_config('scc.hoja_campania_id',coalesce(v_platform_hoja_anterior,''),true);
          %s
        exception when others then
          perform set_config('scc.campania_id',coalesce(v_platform_campania_anterior,''),true);
          perform set_config('scc.hoja_campania_id',coalesce(v_platform_hoja_anterior,''),true);
          raise;
        end;
      $scope$,case when retorno_sin_expresion then '' else 'v_platform_resultado '||r.tipo_retorno||';' end,
        parametro,parametro,parametro,cuerpo,retorno);
      actualizado := replace(actualizado,'$function$'||substring(actualizado from '\$function\$(.*)\$function\$')||'$function$',
        '$function$'||envoltura||'$function$');
    end if;
    if actualizado<>original then execute actualizado; end if;
  end loop;
end $migration$;

-- DTO ownership: la caché y las identidades Workforce se propagan a v5 sin
-- renombrar campos ni exigir payloads nuevos a dispositivos/archivos antiguos.
do $$ declare original text;
begin
  original := pg_get_functiondef('public.obtener_cache_operativa(varchar)'::regprocedure);
  execute replace(original,'''id'', t.id, ''dni'', t.dni',
    '''tenant_id'', t.tenant_id, ''id'', t.id, ''dni'', t.dni');
  original := pg_get_functiondef('public.validar_operador_campanias(varchar)'::regprocedure);
  original := replace(original,'''dni'',t.dni,''nombre''',
    '''tenant_id'',t.tenant_id,''dni'',t.dni,''nombre''');
  original := replace(original,'''id'', c.id, ''codigo'', c.codigo',
    '''tenant_id'', c.tenant_id, ''id'', c.id, ''codigo'', c.codigo');
  execute original;
end $$;
create or replace function public.workforce_identidades_campania(p_campania_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'dni',t.dni,'tenantId',t.tenant_id)),'[]'::jsonb)
  from public.trabajadores t where t.tenant_id=public.platform_tenant_campania(p_campania_id)
    and exists(select 1 from public.trabajador_campania_rol r where r.trabajador_id=t.id and r.campania_id=p_campania_id);
$$;
do $$ declare original text;
begin
  original := pg_get_functiondef('public.harvest_obtener_snapshot(uuid,varchar)'::regprocedure);
  original := replace(original,'''campaniaId'',p_campania_id',
    '''tenantId'',public.platform_tenant_campania(p_campania_id),''campaniaId'',p_campania_id');
  original := regexp_replace(original,'''campaniaId'',([latr])\.campania_id',
    '''tenantId'',\1.tenant_id,''campaniaId'',\1.campania_id','g');
  execute original;
end $$;

-- acceso_global de una integración significa sus campañas en su EmpresaCliente.
-- Nunca todas las empresas de GesGROW. La API y el archivo siguen intactos.
do $$ declare original text;
begin
  if to_regprocedure('public.integracion_puede_campania(uuid)') is not null then
    original := pg_get_functiondef('public.integracion_puede_campania(uuid)'::regprocedure);
    execute replace(original,'ia.auth_user_id = auth.uid() and ia.activo',
      'ia.tenant_id = public.platform_tenant_campania(p_campania_id) and ia.auth_user_id = auth.uid() and ia.activo');
  end if;
end $$;
comment on table public.tenants is 'GesGROW F6.1: ownership y contexto transaccional v1';
end $platform_f61$;
notify pgrst,'reload schema';
commit;
