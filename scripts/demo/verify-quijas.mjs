// Validación local sin conexión: esquema versionado, seed, reportes y limpieza.
// Ejecutar desde scc/backend: node scripts/demo/verify-quijas.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from '../../tests/helpers/harvestSql.js'

const db = new PGlite()
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const id = (kind, n) => `de001015-2026-4000-${8000+kind}-${String(n).padStart(12,'0')}`
const tenant = '00000000-0000-4000-8000-000000000001'
const subject = '00000000-0000-4000-9999-000000000001'
const actor = '00000000-0000-4000-9999-000000000002'
const seed = read('./seed-quijas.sql')
const cleanup = read('./cleanup-quijas.sql')
const tableNames = async () => (await db.query("select tablename from pg_tables where schemaname in ('public','auth') order by schemaname,tablename")).rows
const snapshot = async () => {
  const result = {}
  for (const { tablename } of await tableNames()) {
    const schema = tablename === 'users' ? 'auth' : 'public'
    result[`${schema}.${tablename}`] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') data from ${schema}.${tablename} t`)).rows[0].data
  }
  return result
}
const report = async (type, period='CAMPANIA') => (await db.query(
  'select public.harvest_reportes_obtener($1::uuid,$2::uuid,$3::text,$4::text) r', [tenant,id(1,1),type,period])).rows[0].r
async function rejectWithoutChange(sql, pattern) {
  const before = await snapshot()
  await assert.rejects(db.exec(sql), pattern)
  await db.exec('rollback')
  assert.deepEqual(await snapshot(), before)
}

try {
  await prepararHarvestSql(db)
  // El esquema base remoto usa enum; la fixture mínima histórica usa text.
  // Reproducir el tipo real aquí sin modificar migraciones ni fixtures globales.
  await db.exec(`create type public.estado_sesion as enum ('ACTIVA','CERRADA');
    alter table public.sesiones_lectura alter column estado drop default;
    alter table public.sesiones_lectura alter column estado type public.estado_sesion
      using estado::public.estado_sesion;
    alter table public.sesiones_lectura alter column estado set default 'ACTIVA';`)
  await db.exec(`create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,email text);
    grant usage on schema auth to anon,authenticated;
    create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  const migrations = readdirSync(new URL('../../supabase/migrations/',import.meta.url))
    .filter(n => n>='202610140600' && n<='202610141700_farm_structure.sql').sort()
  for (const name of migrations) await db.exec(read('../../supabase/migrations/'+name))
  await db.exec(read('./fixtures/validar-sesion-lectura.sql'))
  await db.exec(`create trigger demo_validar_sesion_lectura before insert or update on public.sesiones_lectura
    for each row execute function public.validar_sesion_lectura();`)
  await db.query('insert into auth.users values($1,$2)',[subject,'quijas@gmail.com'])
  await db.query('insert into identity_usuarios(id,nombre,email) values($1,$2,$3)',[actor,'Quijas','quijas@gmail.com'])
  await db.query("insert into identity_identidades values('SUPABASE',$1,$2)",[subject,actor])
  await db.query(`with m as (insert into identity_membresias(usuario_id,tenant_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $2,m.id,r.id from m cross join identity_roles r where r.tenant_id=$2 and r.codigo='ADMIN_EMPRESA'`,[actor,tenant])
  await db.query('update tenants set nombre=$1 where id=$2',['Quijas',tenant])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[subject])
  const otherTenant = crypto.randomUUID()
  await db.query("insert into tenants(id,codigo,nombre) values($1,'OTRA-EMPRESA','Empresa ajena')",[otherTenant])
  await db.query("insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'99015001','Persona','Ajena',true)",[otherTenant])
  await db.query("insert into campanias(tenant_id,codigo,nombre,estado) values($1,'AJENA','Campaña ajena','CERRADA')",[otherTenant])
  const original = await snapshot()

  await rejectWithoutChange(seed.replaceAll('quijas@gmail.com','otra-cuenta@example.test'),/membresía activa/)
  await rejectWithoutChange(seed.replace(
    "(case when s.d=0 and s.l>2 then 'ACTIVA' else 'CERRADA' end)::public.estado_sesion",
    "case when s.d=0 and s.l>2 then 'ACTIVA' else 'CERRADA' end"
  ),/column "estado" is of type estado_sesion/)
  console.log('Regresión reproducida: sin cast falla 42804 y revierte la carga parcial.')
  await rejectWithoutChange(seed.replace('x.operador_app,','null::uuid,'),/El usuario no está autorizado para utilizar la aplicación/)
  await rejectWithoutChange(seed.replace("if c.n=2 then", "if false then"),/La campaña del lote no está activa/)
  await rejectWithoutChange(seed.replace("set activo=true\n        where campania_id=c.id", "set activo=false\n        where campania_id=c.id"),/El jabero no está activo en la campaña/)
  console.log('Trigger remoto: rechaza operador ausente, campaña cerrada y jabero inactivo; cada fallo revierte la carga.')
  await db.exec(seed)
  console.log('Seed completo aplicado al esquema local con FK y triggers activos.')
  assert.equal((await db.query('select estado from campanias where id=$1',[id(1,2)])).rows[0].estado,'CERRADA')
  assert.equal((await db.query('select estado from campanias where id=$1',[id(1,1)])).rows[0].estado,'ACTIVA')
  assert.equal((await db.query('select count(*)::int n from trabajador_campania_rol where campania_id=$1 and activo',[id(1,2)])).rows[0].n,0)
  assert.equal((await db.query("select count(*)::int n from sesiones_lectura where id::text like 'de001015-2026-4000-%' and iniciada_por_usuario_id is not null and identity_usuario_id is null")).rows[0].n,264)
  assert.equal((await db.query('select count(*)::int n from campanias where id::text like $1',[id(1,1).slice(0,24)+'%'])).rows[0].n,3)
  for (const [table,expected] of [['trabajadores',26],['farm_fundos',2],['farm_sectores',4],['farm_parcelas',8],['lotes',12]]) {
    const n=(await db.query(`select count(*)::int n from ${table} where id::text like 'de001015-2026-4000-%'`)).rows[0].n
    assert.equal(n,expected,table)
  }
  await db.exec('set role authenticated')
  const dashboard = await report('DASHBOARD')
  assert.ok(dashboard.datos.hoy.total_jabas>0)
  for (const period of ['HOY','SEMANA','MES','CAMPANIA']) {
    const ranking = (await report('RANKING',period)).datos.ranking
    assert.equal(ranking.length,20)
    assert.ok(ranking[0].total_jabas>0)
  }
  assert.equal((await report('DIARIA')).datos.produccion.length,40)
  assert.equal((await report('LOTES')).datos.produccion.length,8)
  await db.exec('reset role')
  const tables = (await db.query(`select 'registros' tabla,count(*)::int n from harvest_registros_cosecha where id::text like 'de001015-2026-4000-%'
    union all select 'tickets',count(*)::int from harvest_tickets where codigo like 'DEMO-Q-%'
    union all select 'sesiones',count(*)::int from sesiones_lectura where id::text like 'de001015-2026-4000-%'`)).rows
  console.log(JSON.stringify(tables))
  await rejectWithoutChange(seed,/demo ya existe/)
  console.log('Carga duplicada rechazada sin modificar filas.')

  // Simula dependencia nueva y ajena con CASCADE: debe detener la limpieza.
  await db.exec('create table public.demo_external_guard(id uuid primary key,campania uuid references public.campanias(id) on delete cascade)')
  await db.query('insert into demo_external_guard values($1,$2)',[crypto.randomUUID(),id(1,1)])
  await rejectWithoutChange(cleanup,/referencias ajenas/)
  console.log('Dependencia externa detectada sin borrar filas.')
  await db.exec('drop table public.demo_external_guard')
  // Un fallo DESPUÉS de suspender triggers debe revertirlos y restaurar filas.
  await db.exec(`create function public.demo_force_cleanup_error() returns trigger language plpgsql as $$
    begin raise exception 'Fallo de mantenimiento simulado'; end $$;
    create trigger demo_force_cleanup_error before delete on public.harvest_tickets
      for each row execute function public.demo_force_cleanup_error();`)
  await rejectWithoutChange(cleanup,/Fallo de mantenimiento simulado/)
  assert.deepEqual((await db.query("select tgname from pg_trigger where not tgisinternal and tgenabled<>'O'")).rows,[])
  await db.exec('drop trigger demo_force_cleanup_error on public.harvest_tickets; drop function public.demo_force_cleanup_error()')
  console.log('Fallo durante borrado revierte filas y restaura triggers.')
  await db.exec(cleanup)
  console.log('Primera limpieza terminada.')
  assert.deepEqual(await snapshot(),original)
  const disabled = (await db.query("select tgname from pg_trigger where not tgisinternal and tgenabled<>'O'")).rows
  assert.deepEqual(disabled,[])
  await db.exec(cleanup)
  assert.deepEqual(await snapshot(),original)
  await db.exec(seed)
  await db.exec(cleanup)
  assert.deepEqual(await snapshot(),original)
  console.log('Correcto: reportes autorizados, periodos, no duplicación, rollback, defensa ante CASCADE, limpieza repetible y restauración exacta de todas las filas originales.')
} finally { await db.close() }
