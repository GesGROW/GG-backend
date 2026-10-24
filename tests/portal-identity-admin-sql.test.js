import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, OP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  T2 = crypto.randomUUID(),
  workerA = crypto.randomUUID(),
  workerB = crypto.randomUUID()
const cuentas = {},
  migracion = '202610141100_portal_identity_admin.sql'
const read = (name) =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const call = async (name, types = [], args = []) =>
  (
    await db.query(
      `select ${name}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) r`,
      args
    )
  ).rows[0].r
const login = (nombre) =>
  db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [cuentas[nombre]?.sujeto ?? '', JSON.stringify({ email: nombre + '@example.test' })]
  )
const rol = async (tenant, codigo) =>
  (
    await db.query('select id from identity_roles where tenant_id=$1 and codigo=$2', [
      tenant,
      codigo
    ])
  ).rows[0].id
async function miembro(nombre, tenant, codigo) {
  const m = (
    await db.query(
      'insert into identity_membresias(usuario_id,tenant_id) values($1,$2) returning id',
      [cuentas[nombre].id, tenant]
    )
  ).rows[0].id
  await db.query(
    'insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) values($1,$2,$3)',
    [tenant, m, await rol(tenant, codigo)]
  )
}
const guardar = (tenant, usuario, activo, roles, trabajador = null, nombre = null) =>
  call(
    'iam_admin_guardar_membresia',
    ['uuid', 'uuid', 'boolean', 'uuid[]', 'uuid', 'text'],
    [tenant, usuario, activo, roles, trabajador, nombre]
  )
async function preparar({
  id = crypto.randomUUID(),
  tenant = T1,
  email = 'nueva@example.test',
  nombre = 'Nueva cuenta',
  roles,
  trabajador = null
} = {}) {
  return call(
    'iam_preparar_invitacion',
    ['uuid', 'uuid', 'text', 'text', 'uuid[]', 'uuid'],
    [id, tenant, email, nombre, roles ?? [await rol(tenant, 'CONSULTA')], trabajador]
  )
}
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls; alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to service_role;"
  )
  for (const name of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql',
    '202610141000_platform_ciclo_vida.sql',
    migracion,
    '202610141200_portal_campaign_workforce.sql',
    '202610141300_portal_harvest_admin.sql',
    '202610211000_portal_activacion_cuenta.sql'
  ])
    await db.exec(read(name))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa B','B-ADMIN')",
    [T2]
  )
  for (const [id, tenant, dni] of [
    [workerA, T1, '87654320'],
    [workerB, T2, '87654320']
  ])
    await db.query(
      "insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo) values($1,$2,$3,'Persona','Agrícola',true)",
      [id, tenant, dni]
    )
  for (const nombre of ['admin', 'adminB', 'multi', 'soloB', 'consulta']) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      cuentas[nombre].sujeto,
      nombre + '@example.test'
    ])
    await login(nombre)
    cuentas[nombre].id = (await call('iam_obtener_identidad')).usuario.id
  }
  await miembro('admin', T1, 'ADMIN_EMPRESA')
  await miembro('adminB', T2, 'ADMIN_EMPRESA')
  await miembro('multi', T1, 'CONSULTA')
  await miembro('multi', T2, 'GESTOR')
  await miembro('soloB', T2, 'CONSULTA')
  await miembro('consulta', T1, 'CONSULTA')
})
after(() => db.close())

test('administrador lista, busca y consulta sólo usuarios de su Tenant; trabajador sin cuenta', async () => {
  await login('admin')
  const lista = await call('iam_admin_listar_usuarios', ['uuid'], [T1])
  assert.equal(lista.total, 3)
  assert.equal(
    lista.usuarios.some((u) => u.usuarioId === cuentas.soloB.id),
    false
  )
  const filtrada = await call(
    'iam_admin_listar_usuarios',
    ['uuid', 'text', 'integer'],
    [T1, 'multi@', 0]
  )
  assert.deepEqual(
    filtrada.usuarios.map((u) => u.usuarioId),
    [cuentas.multi.id]
  )
  assert.equal(filtrada.usuarios[0].trabajadorId, null)
  assert.equal(
    (await call('iam_admin_listar_usuarios', ['uuid', 'text'], [T1, '%'])).total,
    0
  )
  await assert.rejects(
    call('iam_admin_obtener_usuario', ['uuid', 'uuid'], [T1, cuentas.soloB.id]),
    /no pertenece/
  )
  await assert.rejects(
    call('iam_admin_listar_usuarios', ['uuid'], [T2]),
    /no autorizada/
  )
  const catalogo = await call('iam_admin_catalogo_accesos', ['uuid'], [T1])
  assert.equal(catalogo.roles.length, 4)
  assert.equal(
    catalogo.trabajadores.some((t) => t.id === workerA),
    true
  )
  assert.equal(
    catalogo.trabajadores.some((t) => t.id === workerB),
    false
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from identity_membresias where trabajador_id=$1',
        [workerA]
      )
    ).rows[0].n,
    0
  )
})
test('vínculo opcional, roles y permisos efectivos; ninguna modificación cross-tenant', async () => {
  await login('admin')
  const gestion = await rol(T1, 'GESTOR'),
    consulta = await rol(T1, 'CONSULTA')
  const u = await guardar(
    T1,
    cuentas.multi.id,
    true,
    [gestion, consulta],
    workerA,
    'Nombre en A'
  )
  assert.equal(u.trabajador.id, workerA)
  assert.deepEqual(u.permisos, [
    'campaign.manage',
    'harvest.view',
    'reports.view',
    'workforce.manage'
  ])
  await assert.rejects(
    guardar(T1, cuentas.multi.id, true, [await rol(T2, 'CONSULTA')]),
    /Rol no permitido/
  )
  await assert.rejects(
    guardar(T1, cuentas.multi.id, true, [consulta], workerB),
    /foreign key/
  )
  await assert.rejects(guardar(T1, cuentas.soloB.id, true, [consulta]), /no pertenece/)
  const sinRoles = await guardar(T1, cuentas.multi.id, true, [])
  assert.deepEqual(sinRoles.permisos, [])
  assert.equal(sinRoles.trabajador, null)
  await guardar(T1, cuentas.multi.id, true, [consulta], null, 'Nombre en A')
})
test('suspensión/reactivación de A no afecta B ni elimina la cuenta global', async () => {
  await login('admin')
  const r = [await rol(T1, 'CONSULTA')]
  assert.deepEqual((await guardar(T1, cuentas.multi.id, false, r)).permisos, [])
  await login('multi')
  await assert.rejects(
    call('iam_resolver_tenant_context', ['uuid'], [T1]),
    /no autorizada/
  )
  assert.equal((await call('iam_resolver_tenant_context', ['uuid'], [T2])).tenantId, T2)
  assert.equal((await call('iam_obtener_identidad')).usuario.activo, true)
  await login('admin')
  await guardar(T1, cuentas.multi.id, true, r)
  await login('multi')
  assert.equal((await call('iam_obtener_identidad')).membresias.length, 2)
})
test('actor sin company.manage no administra; company.manage no concede contratación', async () => {
  await login('consulta')
  await assert.rejects(call('iam_admin_listar_usuarios', ['uuid'], [T1]), /Permiso/)
  await assert.rejects(preparar(), /Permiso/)
  await assert.rejects(guardar(T1, cuentas.multi.id, false, []), /Permiso/)
  await login('admin')
  assert.equal(await call('platform_puede_administrar', ['uuid'], [T1]), false)
  await assert.rejects(
    call('platform_obtener_comercial', ['uuid'], [T1]),
    /subscription.manage/
  )
  assert.equal((await call('iam_admin_listar_usuarios', ['uuid'], [T1])).total, 3)
})
test('aprovisionar crea identidad, membresía y roles sin trabajador; reintento idempotente', async () => {
  await login('admin')
  const intento = await preparar(),
    sujeto = crypto.randomUUID()
  assert.equal(
    (await call('iam_destinatario_invitacion', ['uuid'], [intento.id])).sujeto,
    null
  )
  await db.query('insert into auth.users(id,email) values($1,$2)', [
    sujeto,
    'nueva@example.test'
  ])
  await db.exec('set role service_role')
  let recibo
  try {
    recibo = await call(
      'iam_completar_invitacion',
      ['uuid', 'uuid'],
      [intento.id, sujeto]
    )
  } finally {
    await db.exec('reset role')
  }
  assert.deepEqual(
    await call('iam_completar_invitacion', ['uuid', 'uuid'], [intento.id, sujeto]),
    recibo
  )
  assert.deepEqual((await preparar({ id: intento.id })).resultado, recibo)
  const u = await call(
    'iam_admin_obtener_usuario',
    ['uuid', 'uuid'],
    [T1, recibo.usuarioId]
  )
  assert.equal(u.trabajadorId, null)
  assert.equal(u.nombre, 'Nueva cuenta')
  assert.deepEqual(u.permisos, ['harvest.view', 'reports.view'])
  await assert.rejects(preparar({ id: intento.id, nombre: 'Otro' }), /reutilizado/)
})
test('vincular cuenta existente con membresía en otra empresa; no sobrescribe una membresía existente', async () => {
  await login('admin')
  const i = await preparar({ email: 'soloB@example.test', trabajador: workerA })
  const r = await call(
    'iam_completar_invitacion',
    ['uuid', 'uuid'],
    [i.id, cuentas.soloB.sujeto]
  )
  assert.equal(r.usuarioId, cuentas.soloB.id)
  assert.equal(
    (await call('iam_admin_obtener_usuario', ['uuid', 'uuid'], [T1, r.usuarioId]))
      .trabajadorId,
    workerA
  )
  await guardar(T1, r.usuarioId, false, [])
  const otra = await preparar({
    email: 'soloB@example.test',
    roles: [await rol(T1, 'ADMIN_EMPRESA')]
  })
  await call(
    'iam_completar_invitacion',
    ['uuid', 'uuid'],
    [otra.id, cuentas.soloB.sujeto]
  )
  const u = await call('iam_admin_obtener_usuario', ['uuid', 'uuid'], [T1, r.usuarioId])
  assert.equal(u.activo, false)
  assert.deepEqual(u.roles, [])
  await login('soloB')
  assert.equal((await call('iam_resolver_tenant_context', ['uuid'], [T2])).tenantId, T2)
})
test('invitación rechaza trabajador/rol/identidad ajenos y autorización revocada al completar', async () => {
  await login('admin')
  await assert.rejects(preparar({ trabajador: workerB }), /foreign key/)
  await assert.rejects(
    preparar({ roles: [await rol(T2, 'GESTOR')] }),
    /Rol no permitido/
  )
  const i = await preparar({ email: 'revocada@example.test' }),
    sujeto = crypto.randomUUID()
  await db.query('insert into auth.users(id,email) values($1,$2)', [
    sujeto,
    'revocada@example.test'
  ])
  await assert.rejects(
    call('iam_completar_invitacion', ['uuid', 'uuid'], [i.id, cuentas.multi.sujeto]),
    /incompatible/
  )
  await db.query(
    'update identity_membresias set activo=false where usuario_id=$1 and tenant_id=$2',
    [cuentas.admin.id, T1]
  )
  await assert.rejects(
    call('iam_completar_invitacion', ['uuid', 'uuid'], [i.id, sujeto]),
    /revocada/
  )
  await db.query(
    'update identity_membresias set activo=true where usuario_id=$1 and tenant_id=$2',
    [cuentas.admin.id, T1]
  )
})
test('RLS y ACL impiden completar desde navegador y filtran invitaciones de otras empresas', async () => {
  await login('adminB')
  await db.exec('set role authenticated')
  try {
    assert.equal(
      (await db.query('select count(*)::int n from identity_invitaciones')).rows[0].n,
      0
    )
    await assert.rejects(
      call(
        'iam_completar_invitacion',
        ['uuid', 'uuid'],
        [crypto.randomUUID(), cuentas.multi.sujeto]
      ),
      /permission denied/
    )
    await assert.rejects(
      call('iam_destinatario_invitacion', ['uuid'], [crypto.randomUUID()]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  assert.equal(
    (
      await db.query(
        "select has_table_privilege('service_role','identity_invitaciones','UPDATE') p"
      )
    ).rows[0].p,
    false
  )
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','iam_admin_guardar_membresia(uuid,uuid,boolean,uuid[],uuid,text)','execute') p"
      )
    ).rows[0].p,
    false
  )
})
test('migración idempotente conserva suscripción, módulos SCC y operador DNI legacy', async () => {
  const anterior = await call('platform_estado_comercial', ['uuid'], [T1])
  await db.exec(read(migracion))
  assert.deepEqual(await call('platform_estado_comercial', ['uuid'], [T1]), anterior)
  for (const m of ['HARVEST', 'CAMPAIGN', 'WORKFORCE'])
    assert.equal(
      await call('platform_modulo_habilitado', ['uuid', 'text'], [T1, m]),
      true
    )
  await login(null)
  assert.equal((await call('validar_operador_campanias', ['varchar'], [OP])).dni, OP)
  assert.ok(
    await call('obtener_cache_operativa_campania', ['uuid', 'varchar'], [A, OP])
  )
})

test('activación verifica destinatario, membresía, roles y módulos y distingue una cuenta ya activada', async () => {
  await login('admin')
  const invitacion = await preparar({
    email: 'activacion@example.test',
    roles: [await rol(T1, 'GESTOR')]
  })
  assert.deepEqual(
    await call('iam_preparar_entrega_invitacion', ['uuid'], [invitacion.id]),
    { tipo: 'ACTIVACION', enviada: false }
  )
  await assert.rejects(
    call('iam_confirmar_entrega_invitacion', ['uuid'], [invitacion.id]),
    /todavía no ha sido completada/
  )
  const sujeto = crypto.randomUUID()
  await db.query(
    "insert into auth.users(id,email,invited_at,encrypted_password) values($1,'activacion@example.test',now(),'')",
    [sujeto]
  )
  const resultado = await call(
    'iam_completar_invitacion',
    ['uuid', 'uuid'],
    [invitacion.id, sujeto]
  )
  // La aparición de la cuenta en el proveedor no cambia el tipo de entrega de un reintento.
  assert.equal(
    (await call('iam_preparar_entrega_invitacion', ['uuid'], [invitacion.id])).tipo,
    'ACTIVACION'
  )
  await call('iam_confirmar_entrega_invitacion', ['uuid'], [invitacion.id])
  assert.equal(
    (await call('iam_preparar_entrega_invitacion', ['uuid'], [invitacion.id])).enviada,
    true
  )
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sujeto])
  const datos = await call('iam_obtener_activacion_cuenta', ['uuid'], [invitacion.id])
  assert.equal(datos.tenantId, T1)
  assert.ok(datos.empresa)
  assert.equal(datos.requiereActivacion, true)
  assert.deepEqual(datos.roles, ['GESTOR'])
  assert.ok(datos.modulos.includes('HARVEST'))
  assert.doesNotMatch(JSON.stringify(datos), /token|encrypted_password/)
  await db.query(
    "update auth.users set encrypted_password='hash-del-proveedor' where id=$1",
    [sujeto]
  )
  assert.equal(
    (await call('iam_obtener_activacion_cuenta', ['uuid'], [invitacion.id]))
      .requiereActivacion,
    false
  )
  await db.query('update identity_membresias set activo=false where id=$1', [
    resultado.membresiaId
  ])
  await assert.rejects(
    call('iam_obtener_activacion_cuenta', ['uuid'], [invitacion.id]),
    /no está disponible/
  )
})

test('cuenta existente recibe entrega de acceso; RPC de receptor y servidor están aislados', async () => {
  await login('admin')
  const invitacion = await preparar({ email: 'multi@example.test' })
  assert.equal(
    (await call('iam_preparar_entrega_invitacion', ['uuid'], [invitacion.id])).tipo,
    'ACCESO'
  )
  await call(
    'iam_completar_invitacion',
    ['uuid', 'uuid'],
    [invitacion.id, cuentas.multi.sujeto]
  )
  await login('consulta')
  await assert.rejects(
    call('iam_obtener_activacion_cuenta', ['uuid'], [invitacion.id]),
    /no está disponible/
  )
  await login('multi')
  await db.exec('set role authenticated')
  try {
    assert.equal(
      (await call('iam_obtener_activacion_cuenta', ['uuid'], [invitacion.id]))
        .requiereActivacion,
      false
    )
    for (const nombre of [
      'iam_preparar_entrega_invitacion',
      'iam_confirmar_entrega_invitacion'
    ])
      await assert.rejects(call(nombre, ['uuid'], [invitacion.id]), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  try {
    await assert.rejects(
      call('iam_obtener_activacion_cuenta', ['uuid'], [invitacion.id]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  await db.exec(read('202610211000_portal_activacion_cuenta.sql'))
  assert.equal(
    (await call('iam_preparar_entrega_invitacion', ['uuid'], [invitacion.id])).tipo,
    'ACCESO'
  )
})
