import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  cuentas = {}
const M = '20261024181514_harvest_confirmacion_salida_impresion.sql'
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sub ?? ''
  ])
const vista = (cantidad = 43, tamanio = 10, op = crypto.randomUUID()) =>
  call(
    'harvest_admin_previsualizar($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer)',
    [T, A, op, cantidad, tamanio]
  )
const confirmar = (p) =>
  call(
    'harvest_admin_reservar_impresion($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer,$6::jsonb)',
    [T, A, p.operacionId, p.cantidadTickets, p.tamanioLote, p]
  )
const generar = () =>
  call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,1,1)', [
    T,
    A,
    crypto.randomUUID()
  ])
const estado = () =>
  call(`jsonb_build_object('generaciones',(select count(*) from harvest_generaciones),
 'lotes',(select count(*) from harvest_lotes_tickets),'tickets',(select count(*) from harvest_tickets),
 'reservas',(select count(*) from harvest_impresion_codigos_lote),'filas',(select count(*) from harvest_impresion_filas),
 'secuencia',(select jsonb_build_array(last_value,is_called) from harvest_impresion_codigo_lote_seq))`)

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  for (const n of readdirSync(dir)
    .filter((n) => n >= '202610140600_' && n < M && n.endsWith('.sql'))
    .sort())
    await db.exec(read(n))
  for (const [nombre, rol] of [
    ['ana', 'SUPERVISOR_COSECHA'],
    ['bea', 'SUPERVISOR_COSECHA'],
    ['view', 'CONSULTA'],
    ['owner', 'ADMIN_EMPRESA']
  ]) {
    cuentas[nombre] = { sub: crypto.randomUUID() }
    await login(nombre)
    const usuario = (await call('iam_obtener_identidad()')).usuario.id
    await db.query(
      `with m as(insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
      select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo=$3`,
      [T, usuario, rol]
    )
  }
  await login('ana')
  await db.exec(read(M))
  await db.exec(read('20261024182100_harvest_indice_impresion_pendiente_actor.sql'))
})
after(() => db.close())

const resolver = (op, impresa, tenant = T) =>
  call('harvest_admin_resolver_impresion($1::uuid,$2::uuid,$3::boolean)', [
    tenant,
    op,
    impresa
  ])
const recuperar = (op) => call('harvest_admin_generacion($1::uuid,$2::uuid)', [T, op])
test('reservar para imprimir no crea lotes, tickets ni generación definitiva y reintenta sin duplicar', async () => {
  const antes = await estado(),
    p = await vista(7, 4),
    r = await confirmar(p)
  const despues = await estado()
  for (const k of ['generaciones', 'lotes', 'tickets', 'filas'])
    assert.equal(despues[k], antes[k])
  assert.equal(r.estadoImpresion, 'PENDIENTE')
  assert.deepEqual(await confirmar(p), r)
  assert.deepEqual(await recuperar(r.operacionId), r)
  const doc = await call('harvest_admin_documento_impresion($1::uuid,$2::uuid)', [
    T,
    r.operacionId
  ])
  assert.deepEqual(
    doc.filas.map((x) => x.codigo),
    r.lotes.flatMap((l) =>
      Array.from(
        { length: l.cantidadTickets },
        (_, i) => 'C' + l.codigoLote + String(i + 1).padStart(2, '0')
      )
    )
  )
  await assert.rejects(
    call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,7,4)', [
      T,
      A,
      r.operacionId
    ]),
    /provisional/
  )
  await assert.rejects(confirmar({ ...p, cantidadTickets: 8 }), /intención/)
})
test('No elimina el documento provisional; reintentos y respuestas tardías no lo reviven', async () => {
  const p = await vista(5, 3),
    r = await confirmar(p),
    antes = await estado()
  assert.equal((await resolver(r.operacionId, false)).cancelada, true)
  assert.equal((await resolver(r.operacionId, false)).cancelada, true)
  await assert.rejects(recuperar(r.operacionId), /inexistente/)
  await assert.rejects(resolver(r.operacionId, true), /inexistente/)
  await assert.rejects(confirmar(p), /cancelada/)
  assert.deepEqual(await estado(), antes)
  assert.equal(
    await call('(select count(*) from harvest_impresion_pendientes where id=$1)', [
      r.operacionId
    ]),
    0
  )
  const siguiente = await vista(1, 1)
  assert.ok(!r.lotes.some((l) => l.codigoLote === siguiente.lotes[0].codigoLote))
})
test('Sí guarda exactamente los códigos impresos una sola vez y registra la confirmación', async () => {
  const p = await vista(1001, 501),
    r = await confirmar(p),
    antes = await estado()
  const segunda = await call(
    'harvest_admin_documento_impresion($1::uuid,$2::uuid,500)',
    [T, r.operacionId]
  )
  assert.equal(segunda.filas.length, 500)
  assert.equal(segunda.filas[0].numeroTicket, 501)
  assert.equal(segunda.filas[1].numeroLote, 2)
  const fin = await resolver(r.operacionId, true),
    despues = await estado()
  assert.equal(fin.estadoImpresion, 'IMPRESA')
  assert.ok(fin.impresionConfirmadaEn)
  assert.deepEqual(fin.lotes, r.lotes)
  assert.equal(fin.fecha, r.fecha)
  assert.equal(despues.generaciones, antes.generaciones + 1)
  assert.equal(despues.tickets, antes.tickets + 1001)
  assert.deepEqual(await resolver(r.operacionId, true), fin)
  assert.deepEqual(await estado(), despues)
  const lote = await call('harvest_admin_lote_dto($1::uuid,$2::uuid)', [
    T,
    fin.lotes[0].id
  ])
  assert.equal(lote.estadoImpresion, 'IMPRESA')
  await assert.rejects(resolver(r.operacionId, false), /ya fue guardada/)
  assert.deepEqual(await recuperar(r.operacionId), fin)
  assert.deepEqual(await estado(), despues)
})
test('las reservas canceladas tampoco se reutilizan mediante importaciones', async () => {
  const r = await confirmar(await vista(1, 1))
  await resolver(r.operacionId, false)
  const l = crypto.randomUUID()
  await db.query(
    'insert into harvest_lotes_tickets(id,tenant_id,campania_id) values($1,$2,$3)',
    [l, T, A]
  )
  await assert.rejects(
    db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',
      ['C' + r.lotes[0].codigoLote + '01', l, A, T]
    ),
    /reservado/
  )
})
test('consultas y resolución exigen usuario, empresa y permisos; tablas privadas y RPC sin acceso anónimo', async () => {
  const r = await confirmar(await vista(1, 1))
  for (const n of ['view', 'owner', null]) {
    await login(n)
    await assert.rejects(resolver(r.operacionId, true))
    await assert.rejects(resolver(r.operacionId, false))
    await assert.rejects(recuperar(r.operacionId))
  }
  await login('ana')
  await assert.rejects(resolver(r.operacionId, false, crypto.randomUUID()))
  assert.equal((await recuperar(r.operacionId)).estadoImpresion, 'PENDIENTE')
  for (const rol of ['anon', 'service_role'])
    for (const f of [
      'harvest_admin_reservar_impresion(uuid,uuid,uuid,integer,integer,jsonb)',
      'harvest_admin_resolver_impresion(uuid,uuid,boolean)'
    ])
      assert.equal(
        await call("has_function_privilege($1,$2,'execute')", [rol, f]),
        false
      )
  await db.exec('set role authenticated')
  try {
    for (const tabla of [
      'harvest_impresion_pendientes',
      'harvest_impresion_reservas',
      'harvest_impresion_confirmadas'
    ])
      await assert.rejects(db.query('select * from ' + tabla), /permission denied/)
    assert.equal((await resolver(r.operacionId, true)).estadoImpresion, 'IMPRESA')
  } finally {
    await db.exec('reset role')
  }
})
