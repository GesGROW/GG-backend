import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP, COSECHADOR } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'
const db = new PGlite(),
  T2 = crypto.randomUUID(),
  C2 = crypto.randomUUID(),
  cuentas = {},
  M = '202610141400_portal_reportes.sql'
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const call = async (n, types = [], args = []) =>
  (
    await db.query(
      `select ${n}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) r`,
      args
    )
  ).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sujeto ?? ''
  ])
const reporte = (tipo = 'RESUMEN', camp = A, tenant = T1, periodo = 'CAMPANIA') =>
  call(
    'harvest_reportes_obtener',
    ['uuid', 'uuid', 'text', 'text'],
    [tenant, camp, tipo, periodo]
  )
let sesion, codigo, piloto
before(async () => {
  await prepararHarvestSql(db)
  // Un registro piloto previo a F5.6 nunca entra en producción reportable.
  sesion = (
    await db.query(
      'select s.id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1 limit 1',
      [A]
    )
  ).rows[0].id
  const lote = crypto.randomUUID()
  codigo = 'F75-' + crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    lote,
    A
  ])
  await db.query(
    'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
    [codigo, lote, A]
  )
  await call(
    'harvest_asignar_lote_tickets',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [A, OP, COSECHADOR, codigo, crypto.randomUUID()]
  )
  piloto = await call(
    'harvest_registrar_cosecha',
    ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid'],
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
    M,
    '20261022232855_harvest_resumen_jaberos.sql',
    '202610141500_portal_suscripcion.sql',
    '202610141600_portal_cutover_administrativo.sql',
    '202610141700_farm_structure.sql'
  ])
    await db.exec(read(n))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa reportes B','F75-B')",
    [T2]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'F75-B','Ajena','ACTIVA')",
    [C2, T2]
  )
  for (const [nombre, rol] of [
    ['consulta', 'CONSULTA'],
    ['admin', 'ADMIN_EMPRESA'],
    ['campo', 'OPERADOR_CAMPO']
  ]) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await login(nombre)
    cuentas[nombre].id = (await call('iam_obtener_identidad')).usuario.id
    for (const t of nombre === 'admin' ? [T1, T2] : [T1])
      await db.query(
        `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo=$3`,
        [t, cuentas[nombre].id, rol]
      )
  }
  await login('admin')
  await db.query(
    'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
    [T2, cuentas.admin.id]
  )
  await call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text'],
    [
      crypto.randomUUID(),
      T2,
      'CREAR_SUSCRIPCION',
      { planId: '00000000-0000-4000-8000-000000000063' },
      'Piloto reportes'
    ]
  )
  await login('consulta')
})
after(() => db.close())
test('dashboard sin producción excluye piloto y entrega métricas cero desde F5.6', async () => {
  assert.ok(piloto)
  const r = await reporte('DASHBOARD')
  assert.equal(r.datos.resumen.total_jabas, 0)
  assert.equal(r.datos.resumen.total_jaberos, 0)
  assert.equal(r.datos.hoy.total_jabas, 0)
  assert.equal(r.datos.resumen.ultima_lectura, null)
  assert.ok(r.actualizadoEn)
  assert.equal(r.tenantId, T1)
})
test('campañas activas y cerradas del Tenant; usuario de consulta no necesita harvest.manage', async () => {
  await login('admin')
  await call('campaign_admin_cerrar', ['uuid', 'uuid'], [T1, B])
  await login('consulta')
  const lista = await call('harvest_reportes_campanias', ['uuid'], [T1])
  assert.equal(lista.find((c) => c.id === B).estado, 'CERRADA')
  assert.equal(lista.find((c) => c.id === A).estado, 'ACTIVA')
  assert.equal(
    lista.some((c) => c.id === C2),
    false
  )
  assert.equal((await reporte('RESUMEN', B)).datos.resumen.total_jabas, 0)
})
test('legacy antes + nuevo después del cutover sin doble conteo en todas las proyecciones', async () => {
  await login(null)
  const legacy = 'LEG-F75-' + crypto.randomUUID()
  await call(
    'asignar_ticket_campania',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [A, OP, COSECHADOR, legacy, crypto.randomUUID()]
  )
  await call(
    'registrar_lectura_jaba_campania',
    ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid'],
    [
      A,
      OP,
      sesion,
      legacy,
      crypto.randomUUID(),
      new Date().toISOString(),
      crypto.randomUUID()
    ]
  )
  await login('admin')
  await call('iam_activar_harvest', ['uuid'], [A])
  const g = await call(
    'harvest_admin_generar',
    ['uuid', 'uuid', 'uuid', 'integer', 'integer'],
    [T1, A, crypto.randomUUID(), 2, 2]
  )
  const nuevo = (
    await db.query('select codigo from harvest_tickets where lote_id=$1 limit 1', [
      g.lotes[0].id
    ])
  ).rows[0].codigo
  await login(null)
  await call(
    'harvest_asignar_lote_tickets',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [A, OP, COSECHADOR, nuevo, crypto.randomUUID()]
  )
  await call(
    'harvest_registrar_cosecha',
    ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid'],
    [
      A,
      OP,
      sesion,
      nuevo,
      crypto.randomUUID(),
      new Date().toISOString(),
      crypto.randomUUID()
    ]
  )
  await login('consulta')
  const r = await reporte('DASHBOARD')
  assert.equal(r.datos.resumen.total_jabas, 2)
  assert.equal(r.datos.resumen.total_jaberos, 1)
  assert.equal(r.datos.hoy.total_jabas, 2)
  assert.equal(r.datos.resumen.total_cosechadores, 1)
  assert.equal(r.datos.resumen.total_lotes, 1)
  assert.equal(r.datos.resumen.total_sesiones, 1)
  assert.equal(r.datos.resumen.dias_con_produccion, 1)
  for (const [tipo, proyeccion, args] of [
    ['RESUMEN', 'harvest_proyectar_resumen', ['uuid', 'text']],
    ['DIARIA', 'harvest_proyectar_diaria', ['uuid', 'text']],
    ['LOTES', 'harvest_proyectar_lotes', ['uuid']]
  ]) {
    const directo = await call(
      proyeccion,
      args,
      args.length === 2 ? [A, 'America/Lima'] : [A]
    )
    assert.deepEqual((await reporte(tipo)).datos, directo)
  }
  assert.equal((await reporte('DIARIA')).datos.produccion[0].total_jabas, 2)
  assert.equal((await reporte('LOTES')).datos.produccion[0].total_jabas, 2)
  // Contratos de campo conservados bajo DNI legacy, ahora sobre igual proyección.
  await login(null)
  assert.equal(
    (
      await call(
        'obtener_resumen_campania_campania',
        ['uuid', 'varchar', 'text'],
        [A, OP, 'America/Lima']
      )
    ).resumen.total_jabas,
    2
  )
  await login('consulta')
})
for (const periodo of ['HOY', 'SEMANA', 'MES', 'CAMPANIA'])
  test('ranking ' + periodo + ' conserva posición y orden del backend', async () => {
    const r = (await reporte('RANKING', A, T1, periodo)).datos
    assert.deepEqual(
      r,
      await call('harvest_proyectar_ranking', ['uuid', 'text'], [A, periodo])
    )
    assert.equal(r.ranking[0].posicion, 1)
    assert.equal(r.ranking[0].total_jabas, 2)
  })
test('cross-tenant incluso con membresías en ambas empresas; IDs nulos y tipos inválidos rechazados', async () => {
  await login('admin')
  await assert.rejects(reporte('RESUMEN', C2, T1), /otra empresa/)
  await assert.rejects(
    call('harvest_reportes_validar', ['uuid', 'uuid'], [T1, C2]),
    /otra empresa/
  )
  await assert.rejects(reporte('RESUMEN', null), /Campaña requerida/)
  await assert.rejects(reporte('FALSO'), /Reporte desconocido/)
  await assert.rejects(reporte('RANKING', A, T1, 'ANIO'), /ranking inválido/)
  await login('consulta')
  await assert.rejects(reporte('RESUMEN', C2, T2), /membresía/i)
})
test('permiso reports.view obligatorio, membresía activa y sesión vigentes en cada lectura/exportación', async () => {
  await login('campo')
  await assert.rejects(reporte(), /Permiso/)
  await assert.rejects(call('harvest_reportes_campanias', ['uuid'], [T1]), /Permiso/)
  await login('admin')
  // Ni siquiera harvest.manage concede reports.view por implicación.
  await db.query(
    "delete from identity_rol_permisos where tenant_id=$1 and permiso='reports.view' and rol_id in(select id from identity_roles where tenant_id=$1 and codigo='ADMIN_EMPRESA')",
    [T1]
  )
  await assert.rejects(reporte(), /Permiso/)
  await login('consulta')
  await db.query(
    'update identity_membresias set activo=false where usuario_id=$1 and tenant_id=$2',
    [cuentas.consulta.id, T1]
  )
  await assert.rejects(reporte(), /membresía/i)
  await db.query(
    'update identity_membresias set activo=true where usuario_id=$1 and tenant_id=$2',
    [cuentas.consulta.id, T1]
  )
  await login(null)
  await assert.rejects(reporte(), /Sesión/)
  await login('consulta')
})
test('módulo HARVEST deshabilitado bloquea lectura y validación CSV aun con reports.view', async () => {
  await login('admin')
  await call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text'],
    [
      crypto.randomUUID(),
      T2,
      'DESHABILITAR_MODULO',
      { modulo: 'HARVEST' },
      'Bloquear reportes'
    ]
  )
  await assert.rejects(reporte('DASHBOARD', C2, T2), /Módulo no habilitado/)
  await assert.rejects(
    call('harvest_reportes_validar', ['uuid', 'uuid'], [T2, C2]),
    /Módulo no habilitado/
  )
  await assert.rejects(
    call('harvest_reportes_campanias', ['uuid'], [T2]),
    /Módulo no habilitado/
  )
  await login('consulta')
})
test('ACL: sólo fachadas autorizadas, migración idempotente y SCC preservado', async () => {
  const comercial = await call('platform_estado_comercial', ['uuid'], [T1])
  await db.exec(read(M))
  assert.deepEqual(await call('platform_estado_comercial', ['uuid'], [T1]), comercial)
  await db.exec('set role authenticated')
  try {
    assert.equal((await reporte()).datos.resumen.total_jabas, 2)
    await assert.rejects(
      call('harvest_reportes_exigir', ['uuid', 'uuid'], [T1, A]),
      /permission denied/
    )
    await assert.rejects(
      call('harvest_proyectar_resumen', ['uuid', 'text'], [A, 'America/Lima']),
      /permission denied/
    )
    await assert.rejects(
      db.query('select * from harvest_produccion_reportable'),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  try {
    await assert.rejects(reporte(), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
})
