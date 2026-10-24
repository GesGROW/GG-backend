import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'
const db = new PGlite(),
  owner = crypto.randomUUID(),
  nueva = crypto.randomUUID(),
  existente = crypto.randomUUID(),
  otra = crypto.randomUUID(),
  iNueva = crypto.randomUUID(),
  iExistente = crypto.randomUUID()
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const login = (s) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [s])
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
let supervisor
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls;"
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
    '202610211000_portal_activacion_cuenta.sql',
    '202610211100_owner_modulos.sql',
    '202610211200_usuarios_accesos_modulo.sql'
  ])
    await db.exec(read(n))
  await db.query(
    "insert into auth.users(id,email,invited_at,encrypted_password) values($1,'owner@test.local',null,'hash'),($2,'nueva@test.local',now(),''),($3,'existente@test.local',null,'hash'),($4,'otra@test.local',null,'hash')",
    [owner, nueva, existente, otra]
  )
  await login(owner)
  const usuario = (await call('iam_obtener_identidad()')).usuario.id
  await db.query(
    "with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id) insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA'",
    [T1, usuario]
  )
  supervisor = (
    await db.query(
      "select id from identity_roles where tenant_id=$1 and codigo='SUPERVISOR_COSECHA'",
      [T1]
    )
  ).rows[0].id
})
after(() => db.close())

const lista = () => call('iam_admin_accesos_cosecha($1::uuid)', [T1])
const preparar = (id, email, roles = [supervisor]) =>
  call('iam_preparar_invitacion($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid[],null)', [
    id,
    T1,
    email,
    'Invitada',
    roles
  ])
test('el owner ve Cosecha vacío y solo se publica el rol Supervisor para nuevas invitaciones', async () => {
  const d = await lista()
  assert.equal(d.habilitado, true)
  assert.equal(d.rolSupervisorId, supervisor)
  assert.deepEqual(d.usuarios, [])
  const permisos = (
    await db.query('select permiso from identity_rol_permisos where rol_id=$1', [
      supervisor
    ])
  ).rows.map((r) => r.permiso)
  assert.ok(permisos.includes('harvest.manage'))
  assert.ok(!permisos.includes('company.manage'))
})
test('provisionar y enviar correo dejan Pendiente; el owner no puede aceptar por el receptor', async () => {
  await preparar(iNueva, 'nueva@test.local')
  await call('iam_completar_invitacion($1::uuid,$2::uuid)', [iNueva, nueva])
  await call('iam_preparar_entrega_invitacion($1::uuid)', [iNueva])
  await call('iam_confirmar_entrega_invitacion($1::uuid)', [iNueva])
  assert.equal((await lista()).usuarios[0].estado, 'PENDIENTE')
  await assert.rejects(
    call('iam_aceptar_invitacion($1::uuid)', [iNueva]),
    /no está disponible/
  )
})
test('nueva cuenta solo acepta al definir contraseña; la aceptación es idempotente y no duplica usuarios', async () => {
  await login(nueva)
  await assert.rejects(
    call('iam_aceptar_invitacion($1::uuid)', [iNueva]),
    /Activa tu cuenta/
  )
  await db.query("update auth.users set encrypted_password='hash' where id=$1", [nueva])
  assert.equal(
    (await call('iam_aceptar_invitacion($1::uuid)', [iNueva])).estado,
    'ACEPTADA'
  )
  const primera = (
    await db.query('select aceptada_en from identity_invitaciones where id=$1', [
      iNueva
    ])
  ).rows[0].aceptada_en
  await call('iam_aceptar_invitacion($1::uuid)', [iNueva])
  assert.deepEqual(
    (
      await db.query('select aceptada_en from identity_invitaciones where id=$1', [
        iNueva
      ])
    ).rows[0].aceptada_en,
    primera
  )
  await assert.rejects(lista(), /denegado/)
  await login(owner)
  assert.equal((await lista()).usuarios.length, 1)
  assert.equal((await lista()).usuarios[0].estado, 'ACEPTADA')
})
test('cuenta existente sigue pendiente hasta abrir su enlace autenticado y no necesita nueva contraseña', async () => {
  await preparar(iExistente, 'existente@test.local')
  await call('iam_completar_invitacion($1::uuid,$2::uuid)', [iExistente, existente])
  assert.equal(
    (await lista()).usuarios.filter((u) => u.estado === 'PENDIENTE').length,
    1
  )
  await login(otra)
  await call('iam_obtener_identidad()')
  await assert.rejects(
    call('iam_aceptar_invitacion($1::uuid)', [iExistente]),
    /no está disponible/
  )
  await login(existente)
  assert.equal(
    (await call('iam_obtener_activacion_cuenta($1::uuid)', [iExistente]))
      .requiereActivacion,
    false
  )
  await call('iam_aceptar_invitacion($1::uuid)', [iExistente])
  await login(owner)
  assert.equal(
    (await lista()).usuarios.filter((u) => u.estado === 'ACEPTADA').length,
    2
  )
})
test('rol de otra empresa se rechaza y los nuevos RPC no están abiertos a anónimos o service_role', async () => {
  const t2 = crypto.randomUUID()
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Otra','OTRA-ACCESOS')",
    [t2]
  )
  const rolAjeno = (
    await db.query(
      "select id from identity_roles where tenant_id=$1 and codigo='SUPERVISOR_COSECHA'",
      [t2]
    )
  ).rows[0].id
  await assert.rejects(
    preparar(crypto.randomUUID(), 'ajeno@test.local', [rolAjeno]),
    /Rol no permitido/
  )
  assert.equal(
    await call(
      "has_function_privilege('anon','iam_admin_accesos_cosecha(uuid)','execute')"
    ),
    false
  )
  assert.equal(
    await call(
      "has_function_privilege('service_role','iam_aceptar_invitacion(uuid)','execute')"
    ),
    false
  )
  await db.exec(read('202610211200_usuarios_accesos_modulo.sql'))
  assert.equal(
    (await lista()).usuarios.filter((u) => u.estado === 'ACEPTADA').length,
    2
  )
})

test('una cuenta ya miembro incorpora Supervisor al aceptar, conservando sus roles anteriores', async () => {
  await login(owner)
  const id = crypto.randomUUID()
  await preparar(id, 'owner@test.local')
  await call('iam_completar_invitacion($1::uuid,$2::uuid)', [id, owner])
  assert.equal(
    (await lista()).usuarios.find((u) => u.email === 'owner@test.local').estado,
    'PENDIENTE'
  )
  assert.equal(await call("iam_tiene_permiso($1::uuid,'harvest.manage')", [T1]), false)
  await call('iam_aceptar_invitacion($1::uuid)', [id])
  assert.equal(await call("iam_tiene_permiso($1::uuid,'harvest.manage')", [T1]), true)
  assert.equal(await call("iam_tiene_permiso($1::uuid,'company.manage')", [T1]), true)
  assert.equal(
    (await lista()).usuarios.find((u) => u.email === 'owner@test.local').estado,
    'ACEPTADA'
  )
})
