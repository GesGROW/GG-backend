import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, OP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  cuentas = {}
const M = '20261025015953_harvest_tickets_lote_panel_ligero.sql'
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sub ?? ''
  ])
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

let generacion, lote
const leer = (offset = 0, campania = A, id = lote, tenant = T) =>
  call('harvest_admin_tickets_lote($1::uuid,$2::uuid,$3::uuid,$4::integer)', [
    tenant,
    campania,
    id,
    offset
  ])
test('consulta códigos y estados con límite 50, total correcto y sin reconstruir DTOs de lotes', async () => {
  generacion = await call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,113,112)', [
    T,
    A,
    crypto.randomUUID()
  ])
  lote = generacion.lotes[0].id
  const r = await leer()
  assert.equal(r.tenantId, T)
  assert.equal(r.campaniaId, A)
  assert.equal(r.loteId, lote)
  assert.equal(r.total, 112)
  assert.equal(r.filas.length, 50)
  assert.ok(
    r.filas.every(
      (t) =>
        Object.keys(t).sort().join(',') === 'codigo,estado' && t.estado === 'DISPONIBLE'
    )
  )
  assert.equal((await leer(50)).filas.length, 50)
  assert.equal((await leer(100)).filas.length, 12)
  assert.deepEqual((await leer(112)).filas, [])
  assert.equal((await leer(0, A, generacion.lotes[1].id)).total, 1)
  const general = await call(
    "harvest_admin_listar($1::uuid,'tickets',$2::uuid,'',$3::uuid,null,'',0)",
    [T, A, lote]
  )
  assert.deepEqual(
    r.filas,
    general.filas.map((t) => ({ codigo: t.codigo, estado: t.estado }))
  )
  assert.ok(JSON.stringify(r).length < JSON.stringify(general).length / 2)
})
test('refleja consumo real sin confundir asignación con uso', async () => {
  const trabajador = crypto.randomUUID(),
    op = crypto.randomUUID(),
    codigo = (await leer()).filas[0].codigo
  await db.query(
    "insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo) values($1,$2,'67891234','Ana','Prueba',true)",
    [trabajador, T]
  )
  await db.query(
    'insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id,tenant_id) values($1,$2,$3,$4,$5)',
    [lote, A, trabajador, op, T]
  )
  assert.equal((await leer()).filas[0].estado, 'DISPONIBLE')
  // The test operator has Harvest management; cutover requires its separate
  // Campaign permission. Grant that permission only in this disposable fixture.
  await db.query(
    "insert into identity_rol_permisos(tenant_id,rol_id,permiso) select tenant_id,id,'campaign.manage' from identity_roles where tenant_id=$1 and codigo='SUPERVISOR_COSECHA' on conflict do nothing",
    [T]
  )
  await call('iam_activar_harvest($1::uuid)', [A])
  const sesion = (
    await db.query(
      "select s.id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1 and s.estado='ACTIVA' limit 1",
      [A]
    )
  ).rows[0].id
  await login(null)
  await call(
    'harvest_registrar_cosecha($1::uuid,$2::varchar,$3::uuid,$4,$5::uuid,$6,$7::uuid)',
    [
      A,
      OP,
      sesion,
      codigo,
      crypto.randomUUID(),
      new Date().toISOString(),
      crypto.randomUUID()
    ]
  )
  await login('ana')
  assert.equal((await leer()).filas[0].estado, 'UTILIZADO')
})
test('rechaza campaña, empresa, lote y paginación ajenos; usuarios sin autorización', async () => {
  await login('ana')
  for (const o of [-1, null]) await assert.rejects(leer(o), /requeridos/)
  await assert.rejects(leer(0, A, crypto.randomUUID()), /Lote/)
  await assert.rejects(leer(0, crypto.randomUUID()))
  await assert.rejects(leer(0, A, lote, crypto.randomUUID()))
  for (const quien of ['owner', null]) {
    await login(quien)
    await assert.rejects(leer())
  }
  await login('view')
  assert.equal((await leer()).total, 112)
  await login('ana')
  for (const rol of ['anon', 'service_role'])
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_admin_tickets_lote(uuid,uuid,uuid,integer)','execute')",
        [rol]
      ),
      false
    )
  await db.exec('set role authenticated')
  try {
    assert.equal((await leer()).total, 112)
  } finally {
    await db.exec('reset role')
  }
})
