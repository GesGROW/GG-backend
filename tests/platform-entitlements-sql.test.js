import assert from 'node:assert/strict'
import test, { before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'
// Catálogo histórico de F6.3; capacidades posteriores no se contratan implícitamente.
const MODULOS = ['HARVEST', 'CAMPAIGN', 'WORKFORCE']

const db = new PGlite()
const read = (name) =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const T2 = crypto.randomUUID(),
  T3 = crypto.randomUUID(),
  C2 = crypto.randomUUID()
const P = '00000000-0000-4000-8000-000000000064'
const cuentas = {}
const call = async (name, types = [], args = []) =>
  (
    await db.query(
      `select ${name}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) resultado`,
      args
    )
  ).rows[0].resultado
const login = (nombre) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[nombre]?.sujeto ?? ''
  ])
const enabled = (tenant, modulo) =>
  call('platform_puede_usar_modulo', ['uuid', 'text'], [tenant, modulo])
async function provision(tenant, codigo = 'PILOTO_SCC') {
  const plan = (
    await db.query('select id from platform_planes where codigo=$1', [codigo])
  ).rows[0].id
  return call(
    'platform_crear_suscripcion',
    ['uuid', 'uuid', 'text', 'timestamptz', 'timestamptz'],
    [tenant, plan, 'ACTIVA', '2020-01-01T00:00:00Z', null]
  )
}
async function miembro(nombre, tenant, rol) {
  await db.query(
    `with m as (insert into identity_membresias(usuario_id,tenant_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $2,m.id,r.id from m cross join identity_roles r where r.tenant_id=$2 and r.codigo=$3`,
    [cuentas[nombre].id, tenant, rol]
  )
}
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls;"
  )
  for (const name of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql'
  ])
    await db.exec(read(name))
  for (const [id, codigo] of [
    [T2, 'DOS'],
    [T3, 'SIN-CONTRATO']
  ])
    await db.query('insert into tenants(id,nombre,codigo) values($1,$2,$2)', [
      id,
      codigo
    ])
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'DOS-C','Campaña dos','ACTIVA')",
    [C2, T2]
  )
  await provision(T2, 'OPERACION_CAMPO')
  for (const nombre of ['admin', 'consulta', 'dos', 'nadie']) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await login(nombre)
    cuentas[nombre].id = (await call('iam_obtener_identidad')).usuario.id
  }
  await miembro('admin', T1, 'ADMIN_EMPRESA')
  await miembro('consulta', T1, 'CONSULTA')
  await miembro('dos', T2, 'ADMIN_EMPRESA')
  await miembro('dos', T3, 'ADMIN_EMPRESA')
})
beforeEach(async () => {
  await db.exec(
    "update platform_suscripciones set estado='ACTIVA',desde=statement_timestamp()-interval '1 day',hasta=null; update platform_tenant_modulos set habilitado=true,desde=statement_timestamp()-interval '1 day',hasta=null;"
  )
  await login('admin')
})
after(() => db.close())

test('SCC conserva tres módulos y una suscripción activa piloto; Identity/Platform son base', async () => {
  assert.deepEqual(
    (await db.query('select codigo from platform_modulos order by codigo')).rows.map(
      (r) => r.codigo
    ),
    [...MODULOS].sort()
  )
  for (const modulo of MODULOS) assert.equal(await enabled(T1, modulo), true)
  const s = (
    await db.query(
      'select s.estado,p.codigo from platform_suscripciones s join platform_planes p on p.id=s.plan_id where tenant_id=$1',
      [T1]
    )
  ).rows[0]
  assert.deepEqual(s, { estado: 'ACTIVA', codigo: 'PILOTO_SCC' })
  assert.equal(await enabled(T1, 'IDENTITY'), false)
  assert.equal(await enabled(T1, 'QUALITY'), false)
  assert.equal((await call('iam_listar_campanias', ['uuid'], [T1])).length, 2)
})

test('sin contrato o sin entitlement el Tenant no puede gestionar/operar; selección se revalida', async () => {
  await login('dos')
  assert.equal(await enabled(T3, 'HARVEST'), false)
  assert.equal(await enabled(T2, 'HARVEST'), true)
  assert.equal(await enabled(T2, 'WORKFORCE'), false)
  await assert.rejects(
    call('iam_listar_trabajadores', ['uuid'], [T2]),
    /Módulo no habilitado/
  )
  await assert.rejects(enabled(T1, 'HARVEST'), /no autorizada/)
  await login('nadie')
  await assert.rejects(enabled(T1, 'HARVEST'), /no autorizada/)
})

test('permiso sin módulo no autoriza RPC y módulo sin permiso tampoco', async () => {
  await db.query(
    "update platform_tenant_modulos set habilitado=false where tenant_id=$1 and modulo_codigo='HARVEST'",
    [T1]
  )
  assert.equal(await enabled(T1, 'HARVEST'), false)
  for (const name of [
    'iam_consultar_ticket',
    'iam_activar_harvest',
    'iam_asignar_lote'
  ]) {
    const types =
      name === 'iam_consultar_ticket'
        ? ['uuid', 'text']
        : name === 'iam_asignar_lote'
          ? ['uuid', 'uuid', 'text', 'uuid']
          : ['uuid']
    const args =
      name === 'iam_consultar_ticket'
        ? [A, 'NO']
        : name === 'iam_asignar_lote'
          ? [A, crypto.randomUUID(), 'NO', crypto.randomUUID()]
          : [A]
    await assert.rejects(call(name, types, args), /Módulo no habilitado/)
  }
  // Administración de Identity/empresa sigue accesible sin módulos.
  assert.ok(await call('iam_obtener_empresa', ['uuid'], [T1]))
  await db.query(
    'update platform_tenant_modulos set habilitado=true where tenant_id=$1',
    [T1]
  )
  await login('consulta')
  assert.equal(await enabled(T1, 'HARVEST'), true)
  await assert.rejects(
    call(
      'iam_asignar_lote',
      ['uuid', 'uuid', 'text', 'uuid'],
      [A, crypto.randomUUID(), 'NO', crypto.randomUUID()]
    ),
    /Permiso/
  )
  assert.equal(
    (await call('iam_obtener_reporte', ['uuid', 'text'], [A, 'RESUMEN'])).ok,
    true
  )
})

test('gestión Campaign/Workforce necesita su capacidad; selector Harvest no fuerza comprar Campaign', async () => {
  await login('dos')
  assert.deepEqual(
    (await call('iam_listar_campanias', ['uuid'], [T2])).map((c) => c.id),
    [C2]
  )
  await assert.rejects(
    call(
      'iam_guardar_campania',
      ['uuid', 'uuid', 'text', 'text', 'uuid', 'estado_campania'],
      [T2, C2, 'CAMBIO', 'Cambio', null, 'ACTIVA']
    ),
    /Módulo no habilitado: CAMPAIGN/
  )
  await assert.rejects(
    call(
      'iam_guardar_trabajador',
      ['uuid', 'uuid', 'varchar', 'varchar', 'varchar', 'boolean'],
      [T2, null, '33333333', 'Persona', 'Nueva', true]
    ),
    /Módulo no habilitado: WORKFORCE/
  )
  await db.query(
    'update platform_tenant_modulos set habilitado=false where tenant_id=$1',
    [T2]
  )
  await assert.rejects(call('iam_listar_campanias', ['uuid'], [T2]), /Permiso y módulo/)
})

test('estados y vigencias se resuelven con reloj del servidor, incluyendo fin exclusivo y trial finito', async () => {
  for (const estado of ['TRIAL', 'ACTIVA', 'SUSPENDIDA', 'CANCELADA', 'VENCIDA']) {
    await db.query(
      "update platform_suscripciones set estado=$2,hasta=statement_timestamp()+interval '1 day' where tenant_id=$1",
      [T1, estado]
    )
    assert.equal(
      await enabled(T1, 'HARVEST'),
      ['TRIAL', 'ACTIVA'].includes(estado),
      estado
    )
  }
  await db.query(
    "update platform_suscripciones set estado='ACTIVA',hasta=statement_timestamp()-interval '1 second' where tenant_id=$1",
    [T1]
  )
  assert.equal(await enabled(T1, 'HARVEST'), false)
  await db.query(
    "update platform_suscripciones set desde=statement_timestamp()+interval '1 day',hasta=null where tenant_id=$1",
    [T1]
  )
  assert.equal(await enabled(T1, 'HARVEST'), false)
  await assert.rejects(
    db.query(
      "update platform_suscripciones set estado='TRIAL',hasta=null where tenant_id=$1",
      [T1]
    ),
    /check constraint/
  )
  await db.query(
    "update platform_suscripciones set desde=statement_timestamp()-interval '1 day' where tenant_id=$1",
    [T1]
  )
  await db.query(
    "update platform_tenant_modulos set hasta=statement_timestamp() where tenant_id=$1 and modulo_codigo='HARVEST'",
    [T1]
  )
  assert.equal(await enabled(T1, 'HARVEST'), false)
})

test('add-on es independiente del Plan; renombrar/cambiar plantilla no recalcula contratos existentes', async () => {
  await login('dos')
  const s = (
    await db.query('select id from platform_suscripciones where tenant_id=$1', [T2])
  ).rows[0].id
  await db.query(
    "insert into platform_tenant_modulos(tenant_id,suscripcion_id,modulo_codigo,origen,desde) values($1,$2,'WORKFORCE','ADD_ON',statement_timestamp()-interval '1 day')",
    [T2, s]
  )
  assert.equal(await enabled(T2, 'WORKFORCE'), true)
  assert.equal((await call('iam_listar_trabajadores', ['uuid'], [T2])).length, 0)
  await db.query(
    "update platform_planes set nombre='Nombre comercial nuevo' where id=$1",
    [P]
  )
  await db.query(
    "insert into platform_plan_modulos(plan_id,modulo_codigo) values($1,'CAMPAIGN')",
    [P]
  )
  assert.equal(await enabled(T2, 'CAMPAIGN'), false)
  await db.query(
    "delete from platform_plan_modulos where plan_id=$1 and modulo_codigo='HARVEST'",
    [P]
  )
  assert.equal(await enabled(T2, 'HARVEST'), true)
})

test('FK compuesta e inmutabilidad impiden unir contrato/entitlement de diferentes Tenants', async () => {
  const s = (
    await db.query('select id from platform_suscripciones where tenant_id=$1', [T1])
  ).rows[0].id
  await assert.rejects(
    db.query(
      "insert into platform_tenant_modulos(tenant_id,suscripcion_id,modulo_codigo,origen,desde) values($1,$2,'HARVEST','EXCEPCION',statement_timestamp())",
      [T3, s]
    ),
    /foreign key/
  )
  await assert.rejects(
    db.query('update platform_suscripciones set tenant_id=$1 where id=$2', [T3, s]),
    /inmutable/
  )
  await assert.rejects(
    db.query('update platform_tenant_modulos set tenant_id=$1 where tenant_id=$2', [
      T3,
      T1
    ]),
    /inmutable/
  )
})

test('RLS aísla contratos y ninguna cuenta ADMIN_EMPRESA puede autoconcesionarse módulos', async () => {
  await login('dos')
  await db.exec('set role authenticated')
  try {
    assert.ok(
      (await db.query('select tenant_id from platform_suscripciones')).rows.every(
        (r) => r.tenant_id === T2
      )
    )
    assert.ok(
      (await db.query('select tenant_id from platform_tenant_modulos')).rows.every(
        (r) => r.tenant_id === T2
      )
    )
    await assert.rejects(
      db.query('update platform_tenant_modulos set habilitado=true'),
      /permission denied/
    )
    await assert.rejects(
      call('platform_modulo_habilitado', ['uuid', 'text'], [T1, 'HARVEST']),
      /permission denied/
    )
    await assert.rejects(provision(T3), /permission denied/)
    assert.equal(await enabled(T2, 'HARVEST'), true)
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  try {
    await assert.rejects(enabled(T1, 'HARVEST'), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role service_role')
  try {
    assert.ok(await provision(T3))
  } finally {
    await db.exec('reset role')
  }
})

test('GUC o módulos enviados externamente no alteran entitlements autorizados', async () => {
  await login('dos')
  await db.query(
    "select set_config('scc.tenant_id',$1,false),set_config('scc.campania_id',$2,false),set_config('scc.modulos','HARVEST,WORKFORCE',false)",
    [T1, A]
  )
  try {
    assert.equal(await enabled(T2, 'CAMPAIGN'), false)
    await assert.rejects(enabled(T1, 'HARVEST'), /no autorizada/)
  } finally {
    await db.exec(
      "select set_config('scc.campania_id','',false),set_config('scc.tenant_id','',false),set_config('scc.modulos','',false)"
    )
  }
})

test('PDA y comandos v4 existentes funcionan con piloto SCC, y no saltan una baja de HARVEST', async () => {
  await login('legacy')
  assert.equal((await call('validar_operador_campanias', ['varchar'], [OP])).dni, OP)
  assert.ok(
    await call('obtener_cache_operativa_campania', ['uuid', 'varchar'], [A, OP])
  )
  const id = crypto.randomUUID()
  const args = [B, OP, '44445555', 'F63-LEGACY', id]
  const first = await call(
    'harvest_asignar_v4',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    args
  )
  assert.equal(first.modelo, 'LEGACY')
  assert.deepEqual(
    await call(
      'harvest_asignar_v4',
      ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
      args
    ),
    first
  )
  await db.query(
    "update platform_tenant_modulos set habilitado=false where tenant_id=$1 and modulo_codigo='HARVEST'",
    [T1]
  )
  await assert.rejects(
    call('obtener_cache_operativa_campania', ['uuid', 'varchar'], [A, OP]),
    /Módulo no habilitado/
  )
  await assert.rejects(
    call('harvest_asignar_v4', ['uuid', 'varchar', 'varchar', 'text', 'uuid'], args),
    /Módulo no habilitado/
  )
  // Login es capacidad base; el bloqueo se aplica en la operación comercial.
  assert.equal((await call('validar_operador_campanias', ['varchar'], [OP])).dni, OP)
})

test('migración repetida no reinicia bajas/add-ons ni duplica SCC; no existen proconfig personalizados', async () => {
  await db.query(
    "update platform_tenant_modulos set habilitado=false where tenant_id=$1 and modulo_codigo='HARVEST'",
    [T1]
  )
  const antes = (
    await db.query(
      'select * from platform_tenant_modulos order by tenant_id,modulo_codigo'
    )
  ).rows
  await db.exec(read('202610140900_platform_suscripciones.sql'))
  assert.deepEqual(
    (
      await db.query(
        'select * from platform_tenant_modulos order by tenant_id,modulo_codigo'
      )
    ).rows,
    antes
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from platform_suscripciones where tenant_id=$1',
        [T1]
      )
    ).rows[0].n,
    1
  )
  assert.deepEqual(
    (
      await db.query(
        "select proname from pg_proc where array_to_string(proconfig,',') like '%scc.%'"
      )
    ).rows,
    []
  )
})
