import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const M = '20261029190249_harvest_busqueda_codigo_lote.sql'
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const sub = crypto.randomUUID()
const buscar = (tipo, busqueda, extra = {}) =>
  call(
    'harvest_admin_listar_filtrado($1::uuid,$2::text,$3::uuid,$4::text,null,null,$5::text,$6::integer,$7::date,$8::date)',
    [
      extra.tenant ?? T,
      tipo,
      extra.campania ?? A,
      busqueda,
      extra.estado ?? '',
      extra.offset ?? 0,
      extra.desde ?? null,
      extra.hasta ?? null
    ]
  )
let lote, codigo, trabajador, legacy, acl, fecha

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  for (const n of readdirSync(dir)
    .filter(
      (n) =>
        n >= '202610140600_' &&
        n <= '20261025015953_harvest_tickets_lote_panel_ligero.sql' &&
        n.endsWith('.sql')
    )
    .sort())
    await db.exec(read(n))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub])
  const usuario = (await call('iam_obtener_identidad()')).usuario.id
  await db.query(
    `with m as(insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='SUPERVISOR_COSECHA'`,
    [T, usuario]
  )
  await call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,61,1)', [
    T,
    A,
    crypto.randomUUID()
  ])
  const segundaPagina = await buscar('lotes', '', { offset: 50 })
  lote = segundaPagina.filas.at(-1).id
  assert.ok(!(await buscar('lotes', '')).filas.some((l) => l.id === lote))
  codigo = (await call('harvest_admin_lote_dto($1::uuid,$2::uuid)', [T, lote])).codigo
  assert.match(codigo, /^\d{6}$/)
  assert.equal((await buscar('lotes', codigo)).total, 0)
  trabajador = crypto.randomUUID()
  const op = crypto.randomUUID()
  await db.query(
    "insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo) values($1,$2,'67891234','Ángela','Prueba',true)",
    [trabajador, T]
  )
  await db.query(
    'insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id,tenant_id) values($1,$2,$3,$4,$5)',
    [lote, A, trabajador, op, T]
  )
  assert.equal((await buscar('asignaciones', codigo)).total, 0)
  // Historical lots without a print snapshot must remain searchable as before.
  legacy = crypto.randomUUID()
  await db.query(
    'insert into harvest_lotes_tickets(id,campania_id,tenant_id) values($1,$2,$3)',
    [legacy, A, T]
  )
  acl = (
    await db.query(
      "select proacl::text acl from pg_proc where oid='public.harvest_admin_indice(uuid,text)'::regprocedure"
    )
  ).rows[0].acl
  fecha = (await call("harvest_admin_indice($1::uuid,'asignaciones')", [T])).fecha
  await db.exec(read(M))
})
after(() => db.close())

test('el código visible encuentra el lote generado aunque estuviera después de la primera página', async () => {
  const r = await buscar('lotes', '  ' + codigo + '  ')
  assert.equal(r.total, 1)
  assert.equal(r.filas[0].id, lote)
  assert.equal(r.filas[0].codigo, codigo)
  assert.equal((await buscar('lotes', codigo, { offset: 50 })).total, 1)
  assert.deepEqual((await buscar('lotes', codigo, { offset: 50 })).filas, [])
  assert.equal((await buscar('lotes', codigo, { estado: 'DISPONIBLE' })).total, 0)
  assert.equal((await buscar('lotes', codigo, { estado: 'ASIGNADO' })).total, 1)
  assert.equal((await buscar('lotes', codigo, { hasta: '2000-01-01' })).total, 0)
  const antiguo = await call(
    "harvest_admin_listar($1::uuid,'lotes',$2::uuid,$3::text)",
    [T, A, codigo]
  )
  assert.equal(antiguo.filas[0].id, lote)
})

test('asignados encuentra código, DNI y nombre sin perder los filtros de fecha o estado', async () => {
  for (const busqueda of [codigo, '67891234', 'ANGELA', lote]) {
    const r = await buscar('asignaciones', busqueda)
    assert.equal(r.total, 1)
    assert.equal(r.filas[0].id, lote)
    assert.equal(r.filas[0].trabajador.id, trabajador)
  }
  assert.equal((await buscar('asignaciones', codigo, { hasta: '2000-01-01' })).total, 0)
  assert.equal((await buscar('lotes', legacy)).filas[0].id, legacy)
})

test('conserva aislamiento, privilegios, fechas y reejecución segura de la migración', async () => {
  assert.equal((await buscar('lotes', codigo, { campania: B })).total, 0)
  await assert.rejects(buscar('lotes', codigo, { tenant: crypto.randomUUID() }))
  await db.exec(read(M))
  assert.equal((await buscar('lotes', codigo)).total, 1)
  assert.equal(
    (
      await db.query(
        "select proacl::text acl from pg_proc where oid='public.harvest_admin_indice(uuid,text)'::regprocedure"
      )
    ).rows[0].acl,
    acl
  )
  assert.equal(
    (await call("harvest_admin_indice($1::uuid,'asignaciones')", [T])).fecha,
    fecha
  )
  await db.exec('set role authenticated')
  try {
    assert.equal((await buscar('lotes', codigo)).total, 1)
  } finally {
    await db.exec('reset role')
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await assert.rejects(buscar('lotes', codigo))
})
