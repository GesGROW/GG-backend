import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP, SUP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'
import { ROLES_APLICACION } from '@gesgrow/core/contexts/identity-access/index.js'

const db = new PGlite()
const read = (name) =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const T2 = crypto.randomUUID(),
  C2 = crypto.randomUUID(),
  W2 = crypto.randomUUID()
const cuentas = {}
const call = async (name, types = [], args = []) =>
  (
    await db.query(
      `select ${name}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) resultado`,
      args
    )
  ).rows[0].resultado
async function login(nombre) {
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [cuentas[nombre]?.sujeto ?? '', JSON.stringify({ email: nombre + '@example.test' })]
  )
}
async function rol(tenant, codigo) {
  return (
    await db.query('select id from identity_roles where tenant_id=$1 and codigo=$2', [
      tenant,
      codigo
    ])
  ).rows[0].id
}
async function miembro(nombre, tenant, codigo, worker = null) {
  const m = (
    await db.query(
      'insert into identity_membresias(usuario_id,tenant_id,trabajador_id) values($1,$2,$3) returning id',
      [cuentas[nombre].id, tenant, worker]
    )
  ).rows[0].id
  await db.query(
    'insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) values($1,$2,$3)',
    [tenant, m, await rol(tenant, codigo)]
  )
  return m
}
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated;"
  )
  for (const name of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql',
    '202610141000_platform_ciclo_vida.sql',
    '202610141100_portal_identity_admin.sql',
    '202610141200_portal_campaign_workforce.sql',
    '202610141300_portal_harvest_admin.sql'
  ])
    await db.exec(read(name))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa B','EMPRESA-B')",
    [T2]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'C2','Campaña Empresa B','ACTIVA')",
    [C2, T2]
  )
  await db.query(
    "insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo) values($1,$2,'12345678','Trabajador','Sin cuenta',true)",
    [W2, T2]
  )
  for (const nombre of ['admin', 'solo', 'multi', 'nadie', 'inactivo']) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await login(nombre)
    const perfil = await call('iam_obtener_identidad')
    cuentas[nombre].id = perfil.usuario.id
  }
  cuentas.admin.m = await miembro('admin', T1, 'ADMIN_EMPRESA')
  cuentas.solo.m = await miembro('solo', T1, 'OPERADOR_CAMPO')
  cuentas.multi.m = await miembro('multi', T1, 'CONSULTA')
  await miembro('multi', T2, 'GESTOR', W2)
  cuentas.inactivo.m = await miembro('inactivo', T1, 'ADMIN_EMPRESA')
  await db.query('update identity_membresias set activo=false where id=$1', [
    cuentas.inactivo.m
  ])
})
after(() => db.close())

test('cuenta independiente del trabajador: sin membresía no hay TenantContext', async () => {
  await login('nadie')
  const perfil = await call('iam_obtener_identidad')
  assert.equal(perfil.usuario.id, cuentas.nadie.id)
  assert.deepEqual(perfil.membresias, [])
  await assert.rejects(call('iam_resolver_tenant_context'), /sin membresía/)
  await assert.rejects(call('iam_listar_campanias', ['uuid'], [T1]), /no autorizada/)
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from identity_membresias where trabajador_id=$1',
        [W2]
      )
    ).rows[0].n,
    1
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from usuarios_app where trabajador_id=$1',
        [W2]
      )
    ).rows[0].n,
    0
  )
})
test('una membresía selecciona Tenant automáticamente; selección inválida se rechaza', async () => {
  await login('solo')
  const c = await call('iam_resolver_tenant_context')
  assert.equal(c.usuarioId, cuentas.solo.id)
  assert.equal(c.tenantId, T1)
  assert.deepEqual(c.permisos, ['harvest.operate', 'harvest.view'])
  await assert.rejects(
    call('iam_resolver_tenant_context', ['uuid'], [T2]),
    /no autorizada/
  )
  await assert.rejects(
    call('iam_guardar_empresa', ['uuid', 'text'], [T1, 'Manipulada']),
    /Permiso/
  )
})
test('varias empresas requieren selección y cada una aporta sus permisos', async () => {
  await login('multi')
  assert.equal((await call('iam_obtener_identidad')).membresias.length, 2)
  await assert.rejects(call('iam_resolver_tenant_context'), /Seleccione/)
  const a = await call('iam_resolver_tenant_context', ['uuid'], [T1])
  const b = await call('iam_resolver_tenant_context', ['uuid'], [T2])
  assert.deepEqual(a.permisos, ['harvest.view', 'reports.view'])
  assert.deepEqual(b.permisos, [...ROLES_APLICACION.GESTOR].sort())
  await assert.rejects(
    call('iam_guardar_empresa', ['uuid', 'text'], [T2, 'No admin']),
    /Permiso/
  )
})
test('membresía, usuario, rol y Tenant inactivos revocan permisos inmediatamente', async () => {
  await login('inactivo')
  await assert.rejects(call('iam_resolver_tenant_context', ['uuid'], [T1]), /inactiva/)
  await login('solo')
  const r = await rol(T1, 'OPERADOR_CAMPO')
  await db.query('update identity_roles set activo=false where id=$1', [r])
  assert.deepEqual((await call('iam_resolver_tenant_context')).permisos, [])
  await db.query('update identity_roles set activo=true where id=$1', [r])
  await db.query('update identity_usuarios set activo=false where id=$1', [
    cuentas.solo.id
  ])
  await assert.rejects(call('iam_resolver_tenant_context'), /usuario inactivo/)
  await db.query('update identity_usuarios set activo=true where id=$1', [
    cuentas.solo.id
  ])
  await db.query("update tenants set estado='SUSPENDIDA' where id=$1", [T1])
  await assert.rejects(
    call('iam_resolver_tenant_context', ['uuid'], [T1]),
    /no autorizada/
  )
  await db.query("update tenants set estado='ACTIVA' where id=$1", [T1])
})
test('gestión por permisos: vínculo Usuario–Trabajador opcional y FK sin cruces', async () => {
  await login('admin')
  const solo = await call(
    'iam_guardar_membresia',
    ['uuid', 'uuid', 'boolean', 'uuid[]', 'uuid'],
    [T1, cuentas.solo.id, true, [await rol(T1, 'OPERADOR_CAMPO')], SUP]
  )
  assert.equal(solo.trabajadorId, SUP)
  await assert.rejects(
    call(
      'iam_guardar_membresia',
      ['uuid', 'uuid', 'boolean', 'uuid[]', 'uuid'],
      [T1, cuentas.solo.id, true, [await rol(T1, 'OPERADOR_CAMPO')], W2]
    ),
    /foreign key/
  )
  await assert.rejects(
    call(
      'iam_guardar_membresia',
      ['uuid', 'uuid', 'boolean', 'uuid[]', 'uuid'],
      [T1, cuentas.solo.id, true, [await rol(T2, 'CONSULTA')], null]
    ),
    /Rol no autorizado/
  )
  const sinWorker = await call(
    'iam_guardar_membresia',
    ['uuid', 'uuid', 'boolean', 'uuid[]', 'uuid'],
    [T1, cuentas.solo.id, true, [await rol(T1, 'OPERADOR_CAMPO')], null]
  )
  assert.equal(sinWorker.trabajadorId, null)
  const t = await call(
    'iam_guardar_trabajador',
    ['uuid', 'uuid', 'varchar', 'varchar', 'varchar', 'boolean'],
    [T1, null, '33333333', 'Persona', 'Sin cuenta', true]
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from identity_membresias where trabajador_id=$1',
        [t.id]
      )
    ).rows[0].n,
    0
  )
  await assert.rejects(
    call(
      'iam_guardar_trabajador',
      ['uuid', 'uuid', 'varchar', 'varchar', 'varchar', 'boolean'],
      [T1, W2, '12345678', 'Cruce', '', true]
    ),
    /otra empresa/
  )
})
test('RLS y ACL reales: lectura por membresía, sin escalado ni escrituras directas', async () => {
  await login('solo')
  await db.exec('set role authenticated')
  try {
    const roles = (await db.query('select tenant_id from identity_roles')).rows
    assert.ok(roles.length === 4 && roles.every((r) => r.tenant_id === T1))
    assert.equal((await db.query('select * from identity_membresias')).rows.length, 1)
    assert.equal((await db.query('select * from identity_usuarios')).rows.length, 1)
    await assert.rejects(
      db.query('insert into identity_membresias(usuario_id,tenant_id) values($1,$2)', [
        cuentas.solo.id,
        T2
      ]),
      /permission denied/
    )
    await assert.rejects(
      call('iam_exigir_permiso', ['uuid', 'text'], [T1, 'company.manage']),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  await login('admin')
  await db.exec('set role authenticated')
  try {
    const usuarios = (await db.query('select id from identity_usuarios')).rows.map(
      (u) => u.id
    )
    assert.ok(usuarios.includes(cuentas.solo.id))
    assert.ok(!usuarios.includes(cuentas.nadie.id))
    assert.ok(
      (await db.query('select tenant_id from identity_roles')).rows.every(
        (r) => r.tenant_id === T1
      )
    )
  } finally {
    await db.exec('reset role')
  }
  await login('nadie')
  await db.exec('set role anon')
  try {
    await assert.rejects(
      call('iam_resolver_tenant_context', ['uuid'], [T1]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
})
test('una GUC y campos de roles externos no sustituyen una membresía autorizada', async () => {
  await login('solo')
  await db.query(
    "select set_config('scc.tenant_id',$1,false),set_config('scc.campania_id',$2,false)",
    [T2, C2]
  )
  try {
    assert.equal((await call('iam_resolver_tenant_context')).tenantId, T1)
    await assert.rejects(
      call('iam_resolver_tenant_context', ['uuid'], [T2]),
      /no autorizada/
    )
    await assert.rejects(
      call(
        'iam_obtener_reporte',
        ['uuid', 'text', 'text'],
        [C2, 'RESUMEN', 'CAMPANIA']
      ),
      /no autorizada/
    )
  } finally {
    await db.exec(
      "select set_config('scc.tenant_id','',false),set_config('scc.campania_id','',false)"
    )
  }
})
test('cuenta de aplicación no usa DNI legacy; PDA anónimo mantiene autorización diaria', async () => {
  await login('nadie')
  await assert.rejects(
    call('validar_operador_campanias', ['varchar'], [OP]),
    /compatibilidad provisional/
  )
  await login('legacy')
  const legacy = await call('validar_operador_campanias', ['varchar'], [OP])
  assert.equal(legacy.dni, OP)
  assert.ok(legacy.campanias.some((c) => c.id === A))
  const r = await call(
    'asignar_ticket_campania',
    ['uuid', 'varchar', 'varchar', 'varchar', 'uuid'],
    [B, OP, '33334444', 'LEGACY-F62', crypto.randomUUID()]
  )
  assert.ok(r)
})
test('Harvest F5 funciona con usuario sin trabajador, valida permisos y conserva cutover/consumo único', async () => {
  await login('admin')
  await call('iam_activar_harvest', ['uuid'], [A])
  const worker = (
    await db.query(
      "select id from trabajadores where tenant_id=$1 and dni='33333333'",
      [T1]
    )
  ).rows[0].id
  const lote = crypto.randomUUID(),
    codigo = 'IAM-F62-TICKET'
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    lote,
    A
  ])
  await db.query(
    'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
    [codigo, lote, A]
  )
  const roles = (
    await db.query(
      "select id from trabajador_campania_rol where campania_id=$1 and rol='JABERO'",
      [A]
    )
  ).rows
  await db.query(
    "update sesiones_lectura set estado='CERRADA' where jabero_rol_id=$1",
    [roles[0].id]
  )
  const fisico = (
    await db.query(
      'select l.id,lv.variedad_id from lotes l join lote_variedades lv on lv.lote_id=l.id where l.campania_id=$1',
      [A]
    )
  ).rows[0]
  await login('multi')
  await assert.rejects(
    call(
      'iam_asignar_lote',
      ['uuid', 'uuid', 'text', 'uuid'],
      [A, worker, codigo, crypto.randomUUID()]
    ),
    /Permiso/
  )
  await login('solo')
  await assert.rejects(
    call(
      'iam_asignar_lote',
      ['uuid', 'uuid', 'text', 'uuid'],
      [A, W2, codigo, crypto.randomUUID()]
    ),
    /otra empresa/
  )
  const asignacionId = crypto.randomUUID()
  const asignada = await call(
    'iam_asignar_lote',
    ['uuid', 'uuid', 'text', 'uuid'],
    [A, worker, codigo, asignacionId]
  )
  assert.equal(asignada.asignacion.trabajador_id, worker)
  assert.deepEqual(
    await call(
      'iam_asignar_lote',
      ['uuid', 'uuid', 'text', 'uuid'],
      [A, worker, codigo, asignacionId]
    ),
    asignada
  )
  const sesionId = crypto.randomUUID()
  const sesion = await call(
    'iam_iniciar_sesion_lectura',
    ['uuid', 'uuid', 'uuid', 'uuid', 'uuid'],
    [A, fisico.id, fisico.variedad_id, roles[0].id, sesionId]
  )
  assert.equal(sesion.identity_usuario_id, cuentas.solo.id)
  assert.equal(sesion.iniciada_por_usuario_id, null)
  const op = crypto.randomUUID(),
    registro = crypto.randomUUID()
  const types = ['uuid', 'uuid', 'text', 'uuid', 'uuid', 'timestamptz']
  const args = [A, sesionId, codigo, registro, op, new Date().toISOString()]
  const cosecha = await call('iam_registrar_cosecha', types, args)
  assert.equal(cosecha.registro.version_produccion, 1)
  await call('iam_cerrar_sesion_lectura', ['uuid', 'uuid'], [A, sesionId])
  assert.deepEqual(await call('iam_registrar_cosecha', types, args), cosecha)
  await assert.rejects(
    call('iam_registrar_cosecha', types, [
      A,
      sesionId,
      codigo,
      crypto.randomUUID(),
      crypto.randomUUID(),
      new Date().toISOString()
    ]),
    /ya_utilizado/
  )
  assert.equal(
    (
      await db.query(
        'select identity_usuario_id,dni_operador from operaciones_pda_campania where id=$1',
        [op]
      )
    ).rows[0].dni_operador,
    null
  )
  await login('multi')
  assert.equal(
    (
      await call(
        'iam_obtener_reporte',
        ['uuid', 'text', 'text'],
        [A, 'RESUMEN', 'CAMPANIA']
      )
    ).resumen.total_jabas,
    1
  )
  await login('solo')
  await assert.rejects(
    call('iam_obtener_reporte', ['uuid', 'text', 'text'], [A, 'RESUMEN', 'CAMPANIA']),
    /Permiso/
  )
})
test('F6.2 no persiste GUC scc y su reejecución conserva cuentas, roles y membresías', async () => {
  const antes = (await db.query('select * from identity_membresias order by id')).rows
  await db.exec(read('202610140800_identity_access.sql'))
  assert.deepEqual(
    (await db.query('select * from identity_membresias order by id')).rows,
    antes
  )
  assert.deepEqual(
    (
      await db.query(
        "select p.oid from pg_proc p cross join lateral unnest(p.proconfig) v where v like 'scc.%'"
      )
    ).rows,
    []
  )
})
