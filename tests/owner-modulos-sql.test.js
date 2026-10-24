import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const migracion = read('202610211100_owner_modulos.sql')
let usuario, membresia, consultaId
const permisos = async (codigo) =>
  (
    await db.query(
      `select rp.permiso from identity_rol_permisos rp join identity_roles r on r.tenant_id=rp.tenant_id and r.id=rp.rol_id where r.tenant_id=$1 and r.codigo=$2 order by rp.permiso`,
      [T1, codigo]
    )
  ).rows.map((r) => r.permiso)

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated;"
  )
  for (const n of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql'
  ])
    await db.exec(read(n))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    crypto.randomUUID()
  ])
  usuario = (await db.query('select iam_obtener_identidad() r')).rows[0].r.usuario.id
  membresia = (
    await db.query(
      'insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id',
      [T1, usuario]
    )
  ).rows[0].id
  await db.query(
    "insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,$2,id from identity_roles where tenant_id=$1 and codigo='ADMIN_EMPRESA'",
    [T1, membresia]
  )
  consultaId = (
    await db.query(
      "select id from identity_roles where tenant_id=$1 and codigo='CONSULTA'",
      [T1]
    )
  ).rows[0].id
  assert.ok((await permisos('ADMIN_EMPRESA')).includes('harvest.view'))
  await db.exec(migracion)
})
after(() => db.close())

test('la migración retira permisos operativos del owner existente y conserva membresía, resumen y administración', async () => {
  assert.deepEqual(await permisos('ADMIN_EMPRESA'), ['company.manage', 'reports.view'])
  const c = (await db.query('select iam_resolver_tenant_context($1::uuid) r', [T1]))
    .rows[0].r
  assert.equal(c.membresiaId, membresia)
  assert.deepEqual(c.permisos, ['company.manage', 'reports.view'])
  await assert.rejects(
    db.query("select iam_exigir_permiso($1::uuid,'harvest.view')", [T1]),
    /denegado/
  )
})
test('las asignaciones operativas independientes se conservan', async () => {
  await db.query(
    'insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) values($1,$2,$3)',
    [T1, membresia, consultaId]
  )
  assert.equal(
    (await db.query("select iam_tiene_permiso($1::uuid,'harvest.view') r", [T1]))
      .rows[0].r,
    true
  )
  assert.deepEqual(await permisos('CONSULTA'), ['harvest.view', 'reports.view'])
})
test('nuevas empresas reciben owner sin operación y la migración puede repetirse sin retirar otros roles', async () => {
  const tenant = crypto.randomUUID()
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Nueva','OWNER-TEST')",
    [tenant]
  )
  const actuales = await db.query(
    "select rp.permiso from identity_rol_permisos rp join identity_roles r on r.tenant_id=rp.tenant_id and r.id=rp.rol_id where r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA' order by rp.permiso",
    [tenant]
  )
  assert.deepEqual(
    actuales.rows.map((r) => r.permiso),
    ['company.manage', 'reports.view']
  )
  await db.exec(migracion)
  assert.equal(
    (await db.query("select iam_tiene_permiso($1::uuid,'harvest.view') r", [T1]))
      .rows[0].r,
    true
  )
})
