import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, SUP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const M = '202610191000_portal_trabajadores_cosecha.sql'
const leer = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const sujeto = crypto.randomUUID(),
  otro = crypto.randomUUID(),
  campaniaAjena = crypto.randomUUID()
const listar = async (f = {}, tenant = T) =>
  (await db.query('select workforce_cosecha_listar($1::uuid,$2::jsonb) r', [tenant, f]))
    .rows[0].r
let provisional
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls;"
  )
  for (const n of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql',
    '202610141000_platform_ciclo_vida.sql',
    '202610141100_portal_identity_admin.sql',
    '202610141200_portal_campaign_workforce.sql',
    '202610141300_portal_harvest_admin.sql',
    '202610141400_portal_reportes.sql',
    '202610141500_portal_suscripcion.sql',
    '202610141600_portal_cutover_administrativo.sql',
    M
  ])
    await db.exec(leer(n))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sujeto])
  const u = (await db.query('select iam_obtener_identidad() r')).rows[0].r.usuario.id
  await db.query(
    "with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id) insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA'",
    [T, u]
  )
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Otra empresa','WORKERS-OTRA')",
    [otro]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado,cultivo_id) values($1,$2,'OTRA','Campaña ajena','ACTIVA','a1000000-0000-4000-8000-000000000001')",
    [campaniaAjena, otro]
  )
  await db.query(
    "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'79999999','Secreto','Ajeno',true)",
    [otro]
  )
  provisional = (
    await db.query(
      "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'71234567','','',true) returning id",
      [T]
    )
  ).rows[0].id
  await db.query(
    "insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,'COSECHADOR',true)",
    [T, provisional, A]
  )
})
after(() => db.close())

test('proyección distingue estado y ficha incompleta, conserva una fila por persona y actividad real', async () => {
  const d = await listar()
  assert.equal(d.trabajadores.filter((t) => t.id === provisional).length, 1)
  const p = d.trabajadores.find((t) => t.id === provisional)
  assert.equal(p.activo, true)
  assert.equal(p.datosCompletos, false)
  assert.equal(p.ultimaActividad, null)
  assert.equal(p.participaciones[0].campaniaId, A)
  assert.ok(d.trabajadores.find((t) => t.id === SUP).ultimaActividad)
  assert.ok(d.resumen.pendientes >= 1)
  assert.ok(!d.trabajadores.some((t) => t.dni === '79999999'))
  assert.ok(!d.campanias.some((c) => c.id === campaniaAjena))
})
test('filtros combinados, datos completados y paginación se calculan sobre todas las filas', async () => {
  const d = await listar({
    campania: A,
    funcion: 'COSECHADOR',
    datos: 'PENDIENTES',
    busqueda: '71234567'
  })
  assert.equal(d.total, 1)
  assert.equal(d.resumen.pendientes, 1)
  await db.query("select workforce_admin_editar($1,$2,'71234567','José','Pérez')", [
    T,
    provisional
  ])
  assert.equal((await listar({ busqueda: 'JOSE PEREZ', datos: 'COMPLETOS' })).total, 1)
  assert.equal((await listar({ busqueda: '71234567', datos: 'PENDIENTES' })).total, 0)
  await db.query(
    "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) select $1,(81000000+i)::text,'Persona','Prueba '||i,true from generate_series(1,61) i",
    [T]
  )
  const p1 = await listar({ busqueda: 'Persona Prueba' })
  const p2 = await listar({ busqueda: 'Persona Prueba', offset: 50 })
  assert.equal(p1.total, 61)
  assert.equal(p1.trabajadores.length, 50)
  assert.equal(p2.trabajadores.length, 11)
  assert.equal(p2.resumen.activos, 61)
  assert.ok(!p2.trabajadores.some((t) => p1.trabajadores.some((p) => p.id === t.id)))
})
test('aislamiento, validación, grants y migración repetible', async () => {
  await assert.rejects(listar({ campania: campaniaAjena }), /no pertenece/)
  await assert.rejects(listar({}, otro), /autoriz|membres|acceso/i)
  await assert.rejects(listar({ offset: -1 }), /Filtros/)
  await assert.rejects(listar({ funcion: 'ADMIN_EMPRESA' }), /Filtros/)
  const grants = (
    await db.query(
      "select has_function_privilege('anon','workforce_cosecha_listar(uuid,jsonb)','execute') anon,has_function_privilege('authenticated','workforce_cosecha_listar(uuid,jsonb)','execute') auth,has_table_privilege('authenticated','workforce_cosecha_actividad','select') vista"
    )
  ).rows[0]
  assert.deepEqual(grants, { anon: false, auth: true, vista: false })
  await db.exec(leer(M))
  assert.ok((await listar()).total > 0)
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await assert.rejects(listar(), /sesión|autentic|autoriz/i)
})
