-- Mantenimiento MANUAL: ejecutar solo cuando se quiera retirar esta DEMO.
-- Requiere postgres/propietario. No ejecutar junto al seed.
-- No usa CASCADE ni TRUNCATE; conserva las FK. Los triggers de inmutabilidad
-- indicados se suspenden únicamente dentro de esta transacción con tablas
-- bloqueadas y se restauran antes del COMMIT (un error revierte también el DDL).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(hashtextextended('gesgrow.demo.quijas.v1',0));

create temporary table gg_demo_delete (
  tabla text not null, clave jsonb not null, primary key(tabla,clave)
) on commit drop;
create temporary table gg_demo_deleted (tabla text, filas bigint) on commit drop;
create temporary table gg_demo_cleanup_order (orden integer, tabla text, filtro text, columnas text[]) on commit drop;
insert into gg_demo_cleanup_order(orden,tabla,filtro) values
  (1,'harvest_registros_cosecha','id::text like ''de001015-2026-4000-8012-%'''),
  (2,'operaciones_pda_procesadas','id::text like ''de001015-2026-4000-8010-%'' or id::text like ''de001015-2026-4000-8013-%'''),
  (3,'harvest_asignaciones_lote','lote_id::text like ''de001015-2026-4000-8009-%'''),
  (4,'harvest_tickets','lote_id::text like ''de001015-2026-4000-8009-%'' and codigo like ''DEMO-Q-%'''),
  (5,'harvest_generaciones','id::text like ''de001015-2026-4000-8011-%'''),
  (6,'harvest_lotes_tickets','id::text like ''de001015-2026-4000-8009-%'''),
  (7,'sesiones_lectura','id::text like ''de001015-2026-4000-8008-%'''),
  (8,'operaciones_pda_campania','id::text like ''de001015-2026-4000-8010-%'' or id::text like ''de001015-2026-4000-8013-%'''),
  (9,'harvest_cutovers','campania_id::text like ''de001015-2026-4000-8001-%'''),
  (10,'campaign_lote_parcelas','lote_id::text like ''de001015-2026-4000-8004-%'' and parcela_id::text like ''de001015-2026-4000-8007-%'''),
  (11,'lote_variedades','lote_id::text like ''de001015-2026-4000-8004-%'' and variedad_id::text like ''de001015-2026-4000-8003-%'''),
  (12,'lotes','id::text like ''de001015-2026-4000-8004-%'''),
  (13,'trabajador_campania_rol','id::text like ''de001015-2026-4000-8005-%'''),
  (14,'farm_parcelas','id::text like ''de001015-2026-4000-8007-%'''),
  (15,'farm_sectores','id::text like ''de001015-2026-4000-8007-%'''),
  (16,'farm_fundos','id::text like ''de001015-2026-4000-8007-%'''),
  (17,'variedades','id::text like ''de001015-2026-4000-8003-%'''),
  (18,'usuarios_app','trabajador_id::text like ''de001015-2026-4000-8002-%'''),
  (19,'trabajadores','id::text like ''de001015-2026-4000-8002-%'' and dni between ''99015001'' and ''99015026'''),
  (20,'campanias','id::text like ''de001015-2026-4000-8001-%'' and codigo like ''DEMO-Q-%'''),
  (21,'cultivos','id::text like ''de001015-2026-4000-8000-%'' and codigo like ''DEMO-Q-%''');

create or replace function pg_temp.gg_demo_pk(alias_fila text,columnas text[])
returns text language sql immutable as $$
  select 'jsonb_build_object('||string_agg(format('%L,%I.%I',columna,alias_fila,columna),',' order by n)||')'
    from unnest(columnas) with ordinality c(columna,n);
$$;

do $$
declare r record; fk record; v_clave text; v_union text; v_externo boolean; v_lock text;
  v_columnas text[]; v_padre text; v_hija text;
begin
  if not exists(select 1 from public.tenants where id='00000000-0000-4000-8000-000000000001' and codigo='SCC') then
    raise exception 'La empresa SCC esperada no existe'; end if;
  select string_agg(format('public.%I',tabla),',' order by orden) into v_lock from gg_demo_cleanup_order;
  execute 'lock table '||v_lock||' in exclusive mode';
  for r in select * from gg_demo_cleanup_order order by orden loop
    -- Manifiesto de PK exactas, acotado al namespace y a esta empresa.
    select array_agg(a.attname::text order by k.n)
      into v_columnas from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,n)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
      where c.contype='p' and c.conrelid=to_regclass('public.'||r.tabla);
    if v_columnas is null then raise exception 'Sin PK: %',r.tabla; end if;
    update gg_demo_cleanup_order set columnas=v_columnas where tabla=r.tabla;
    v_clave:=pg_temp.gg_demo_pk('t',v_columnas);
    execute format('insert into gg_demo_delete select %L,%s from public.%I t where (%s)%s',
      r.tabla,v_clave,r.tabla,r.filtro,
      case when r.tabla='cultivos' then '' else ' and tenant_id=''00000000-0000-4000-8000-000000000001''::uuid' end);
  end loop;
  analyze gg_demo_delete;
  -- Rechazar cualquier dependencia ajena al manifiesto, incluso si una FK
  -- desplegada tuviera ON DELETE CASCADE. Nunca se arrastran filas externas.
  for fk in select c.*,p.relname padre,h.relname hija,nh.nspname esquema_hija
    from pg_constraint c join pg_class p on p.oid=c.confrelid join pg_class h on h.oid=c.conrelid
      join pg_namespace nh on nh.oid=h.relnamespace
    where c.contype='f' and c.confrelid in (select to_regclass('public.'||tabla) from gg_demo_cleanup_order)
  loop
    select pg_temp.gg_demo_pk('p',columnas) into v_padre from gg_demo_cleanup_order where tabla=fk.padre;
    select pg_temp.gg_demo_pk('h',columnas) into v_hija from gg_demo_cleanup_order where tabla=fk.hija and fk.esquema_hija='public';
    -- Una tabla externa nunca aparece en el manifiesto de borrado.
    v_hija:=coalesce(v_hija,'''null''::jsonb');
    select string_agg(format('h.%I=p.%I',ah.attname,ap.attname),' and ' order by k.n) into v_union
      from unnest(fk.conkey,fk.confkey) with ordinality k(hija,padre,n)
      join pg_attribute ah on ah.attrelid=fk.conrelid and ah.attnum=k.hija
      join pg_attribute ap on ap.attrelid=fk.confrelid and ap.attnum=k.padre;
    execute format('select exists(select 1 from %I.%I h join public.%I p on %s
      join gg_demo_delete d on d.tabla=%L and %s=d.clave
      where not exists(select 1 from gg_demo_delete dh where dh.tabla=%L and %s=dh.clave))',
      fk.esquema_hija,fk.hija,fk.padre,v_union,fk.padre,v_padre,
      case when fk.esquema_hija='public' then fk.hija else '' end,v_hija) into v_externo;
    if v_externo then raise exception 'Limpieza detenida: %.% contiene referencias ajenas a la DEMO hacia %. No se borra nada.',
      fk.esquema_hija,fk.hija,fk.padre; end if;
  end loop;
end $$;

do $$
declare r record; v_estado "char";
begin
  for r in select * from (values
    ('harvest_registros_cosecha','harvest_registro_productivo'),
    ('harvest_cutovers','harvest_cutover_fijo'),
    ('harvest_generaciones','harvest_generacion_inmutable'),
    ('campaign_lote_parcelas','farm_historia_no_delete'),
    ('farm_parcelas','farm_historia_no_delete'),
    ('farm_sectores','farm_historia_no_delete'),
    ('farm_fundos','farm_historia_no_delete')) t(tabla,disparador)
  loop
    select tgenabled into v_estado from pg_trigger where tgrelid=to_regclass('public.'||r.tabla) and tgname=r.disparador;
    if v_estado is distinct from 'O'::"char" then raise exception 'Trigger ausente o con estado inesperado: %.%',r.tabla,r.disparador; end if;
    execute format('alter table public.%I disable trigger %I',r.tabla,r.disparador);
  end loop;
end $$;

do $$ declare r record; v_filas bigint; begin
  for r in select * from gg_demo_cleanup_order order by orden loop
    execute format('delete from public.%I t using gg_demo_delete d where d.tabla=%L and %s=d.clave',
      r.tabla,r.tabla,pg_temp.gg_demo_pk('t',r.columnas));
    get diagnostics v_filas=row_count;
    insert into gg_demo_deleted values(r.tabla,v_filas);
  end loop;
end $$;

alter table public.harvest_registros_cosecha enable trigger harvest_registro_productivo;
alter table public.harvest_cutovers enable trigger harvest_cutover_fijo;
alter table public.harvest_generaciones enable trigger harvest_generacion_inmutable;
alter table public.campaign_lote_parcelas enable trigger farm_historia_no_delete;
alter table public.farm_parcelas enable trigger farm_historia_no_delete;
alter table public.farm_sectores enable trigger farm_historia_no_delete;
alter table public.farm_fundos enable trigger farm_historia_no_delete;

select * from gg_demo_deleted order by tabla;
drop function pg_temp.gg_demo_pk(text,text[]);
commit;
