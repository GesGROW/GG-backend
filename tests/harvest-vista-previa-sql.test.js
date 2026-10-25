import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  cuentas = {}
const M = '20261024145845_harvest_vista_previa_tickets.sql'
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
    'harvest_admin_confirmar_impresion($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer,$6::jsonb)',
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
})
after(() => db.close())

test('previsualizar repetidamente no crea generación, tickets, lotes, reservas ni consume secuencia', async () => {
  const antes = await estado(),
    op = crypto.randomUUID()
  const p = await vista(43, 10, op)
  assert.deepEqual(await vista(43, 10, op), p)
  assert.deepEqual(await estado(), antes)
  assert.deepEqual(
    p.lotes.map((l) => l.cantidadTickets),
    [10, 10, 10, 10, 3]
  )
  assert.equal(p.previsualizacion, true)
  assert.equal(p.abreviaturaCultivo, 'ARA')
  assert.equal(
    p.fecha,
    await call("to_char(clock_timestamp() at time zone 'America/Lima','YYYYMMDD')")
  )
})

test('solo confirmar guarda exactamente los códigos, cultivo y fecha revisados; reintento idempotente', async () => {
  const p = await vista(),
    antes = await estado(),
    r = await confirmar(p)
  assert.equal(r.cantidadTickets, 43)
  assert.deepEqual(
    r.lotes.map(({ id, ...l }) => l),
    p.lotes
  )
  for (const campo of ['fecha', 'cultivoId', 'cultivoNombre', 'abreviaturaCultivo'])
    assert.equal(r[campo], p[campo])
  const despues = await estado()
  assert.equal(despues.generaciones, antes.generaciones + 1)
  assert.equal(despues.tickets, antes.tickets + 43)
  assert.deepEqual(await confirmar(p), r)
  assert.deepEqual(await estado(), despues)
  const doc = await call('harvest_admin_documento_impresion($1::uuid,$2::uuid)', [
    T,
    p.operacionId
  ])
  assert.equal(doc.filas[0].codigo, 'C' + p.lotes[0].codigoLote + '01')
  assert.equal(doc.filas[10].numeroLote, 2)
})

test('otra generación vuelve obsoleta la propuesta; no guarda ni imprime códigos distintos', async () => {
  const p = await vista()
  await generar()
  const antes = await estado()
  await assert.rejects(confirmar(p), /vista previa cambió/)
  assert.deepEqual(await estado(), antes)
  const nueva = await vista(43, 10, p.operacionId)
  assert.notEqual(nueva.lotes[0].codigoLote, p.lotes[0].codigoLote)
  await confirmar(nueva)
})

test('importaciones compatibles se saltan sin consumir prefijos al previsualizar', async () => {
  const r = await generar(),
    p = await vista(1, 1)
  await db.query(
    'insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',
    ['C' + p.lotes[0].codigoLote + '01', r.lotes[0].id, A, T]
  )
  const antes = await estado(),
    q = await vista(1, 1)
  assert.notEqual(q.lotes[0].codigoLote, p.lotes[0].codigoLote)
  assert.deepEqual(await estado(), antes)
  await confirmar(q)
})

test('cambio entre comprobación y generación revierte todas las filas; los huecos de secuencia son normales', async () => {
  const p = await vista(4, 2),
    antes = await estado()
  const original = await call(
    "pg_get_functiondef('harvest_admin_generar(uuid,uuid,uuid,integer,integer)'::regprocedure)"
  )
  await db.exec(
    original.replace(
      'while v_restantes>0 loop',
      "perform nextval('public.harvest_impresion_codigo_lote_seq'); while v_restantes>0 loop"
    )
  )
  try {
    await assert.rejects(confirmar(p), /vista previa cambió/)
  } finally {
    await db.exec(original)
  }
  const despues = await estado()
  assert.notDeepEqual(despues.secuencia, antes.secuencia)
  delete antes.secuencia
  delete despues.secuencia
  assert.deepEqual(despues, antes)
})

test('metadatos manipulados y cambio de fecha se rechazan; una confirmación perdida conserva intención y actor', async () => {
  const p = await vista(2, 1)
  for (const mutar of [
    (q) => (q.fecha = '20000101'),
    (q) => (q.abreviaturaCultivo = 'MAN'),
    (q) => (q.lotes[0].codigoLote = '999999'),
    (q) => (q.cantidadTickets = 3)
  ]) {
    const q = structuredClone(p)
    mutar(q)
    const antes = await estado()
    await assert.rejects(confirmar(q), /vista previa cambió/)
    assert.deepEqual(await estado(), antes)
  }
  const r = await confirmar(p)
  await login('bea')
  await assert.rejects(confirmar(p), /intención/)
  await login('ana')
  await db.query("update campanias set estado='CERRADA' where id=$1", [A])
  assert.deepEqual(await confirmar(p), r)
  await assert.rejects(vista(), /activa/)
  await db.query("update campanias set estado='ACTIVA' where id=$1", [A])
})

test('cantidades inválidas, permisos, tenant y ACL no permiten preview ni confirmación', async () => {
  for (const [a, b] of [
    [0, 1],
    [1, 0],
    [100001, 1],
    [1, 100001],
    [null, 1]
  ])
    await assert.rejects(vista(a, b), /cantidades/)
  const p = await vista(1, 1)
  for (const n of ['view', 'owner', null]) {
    await login(n)
    await assert.rejects(vista(), /autoriz|permiso|identidad|sesión|acceso/i)
    await assert.rejects(confirmar(p))
  }
  await login('ana')
  await assert.rejects(
    call('harvest_admin_previsualizar($1::uuid,$2::uuid,$3::uuid,1,1)', [
      crypto.randomUUID(),
      A,
      crypto.randomUUID()
    ])
  )
  await db.exec('set role authenticated')
  try {
    assert.equal((await vista(1, 1)).cantidadTickets, 1)
    await assert.rejects(
      call('harvest_impresion_intencion($1::jsonb)', [p]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  for (const rol of ['anon', 'service_role'])
    for (const f of [
      'harvest_admin_previsualizar(uuid,uuid,uuid,integer,integer)',
      'harvest_admin_confirmar_impresion(uuid,uuid,uuid,integer,integer,jsonb)'
    ])
      assert.equal(
        await call("has_function_privilege($1,$2,'execute')", [rol, f]),
        false
      )
})

test('límite de 100000 tickets sin guardarlos y agotamiento de prefijos fallan claramente', async () => {
  const antes = await estado(),
    p = await vista(100000, 100000)
  assert.equal(p.lotes[0].cantidadTickets, 100000)
  assert.deepEqual(await estado(), antes)
  await db.exec("select setval('harvest_impresion_codigo_lote_seq',999999,true)")
  await assert.rejects(vista(), /agotaron/)
})
