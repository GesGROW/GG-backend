import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { setTimeout as esperar } from 'node:timers/promises'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as SCC } from '@gesgrow/core/contexts/platform/index.js'
const MODULOS = ['HARVEST', 'CAMPAIGN', 'WORKFORCE'] // Contratación SCC de F6.3.

const db = new PGlite()
const read = (name) =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const PILOTO = '00000000-0000-4000-8000-000000000063',
  CAMPO = '00000000-0000-4000-8000-000000000064'
const cuentas = {}
let sccAntes
const call = async (name, types = [], args = []) =>
  (
    await db.query(
      `select public.${name}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) resultado`,
      args
    )
  ).rows[0].resultado
const login = (nombre) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[nombre]?.sujeto ?? ''
  ])
const enabled = (tenant, modulo) =>
  call('platform_puede_usar_modulo', ['uuid', 'text'], [tenant, modulo])
const estado = (tenant) => call('platform_estado_comercial', ['uuid'], [tenant])
const consultar = (tenant) => call('platform_obtener_comercial', ['uuid'], [tenant])
const cambio = (tenant, tipo, parametros = {}, options = {}) =>
  call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text', 'timestamptz'],
    [
      options.id ?? crypto.randomUUID(),
      tenant,
      tipo,
      parametros,
      options.motivo ?? 'Cambio administrativo autorizado',
      options.at ?? null
    ]
  )
async function miembro(nombre, tenant, delegado = false) {
  await db.query(
    `with m as (insert into identity_membresias(usuario_id,tenant_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $2,m.id,r.id from m cross join identity_roles r where r.tenant_id=$2 and r.codigo='ADMIN_EMPRESA'`,
    [cuentas[nombre].id, tenant]
  )
  if (delegado)
    await db.query(
      'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
      [tenant, cuentas[nombre].id]
    )
}
async function empresa({
  plan = CAMPO,
  estadoInicial = 'ACTIVA',
  crear = true,
  hasta = '2099-01-01T00:00:00Z'
} = {}) {
  const tenant = crypto.randomUUID()
  await db.query('insert into tenants(id,codigo,nombre) values($1,$2,$2)', [
    tenant,
    ('T-' + tenant).toUpperCase()
  ])
  await miembro('comercial', tenant, true)
  await miembro('ordinario', tenant)
  await login('comercial')
  if (crear)
    await cambio(tenant, 'CREAR_SUSCRIPCION', {
      planId: plan,
      estado: estadoInicial,
      hasta
    })
  return tenant
}
async function serverFuture() {
  return (await db.query("select clock_timestamp()+interval '2 seconds' as instante"))
    .rows[0].instante
}
async function esperarHasta(at) {
  while ((await db.query('select clock_timestamp() now')).rows[0].now < at)
    await esperar(100)
}
before(async () => {
  await prepararHarvestSql(db)
  await db.exec("set timezone='UTC'")
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls;"
  )
  // Simular los grants por defecto de Supabase administrado para verificar
  // que F6.4 los cierre explícitamente sobre auditoría y helpers privados.
  await db.exec(
    'alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to service_role;'
  )
  for (const name of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql'
  ])
    await db.exec(read(name))
  sccAntes = (
    await db.query(
      'select to_jsonb(s) s from platform_suscripciones s where tenant_id=$1',
      [SCC]
    )
  ).rows[0].s
  await db.exec(read('202610141000_platform_ciclo_vida.sql'))
  await db.exec(read('202610141100_portal_identity_admin.sql'))
  await db.exec(read('202610141200_portal_campaign_workforce.sql'))
  await db.exec(read('202610141300_portal_harvest_admin.sql'))
  await db.exec(read('202610141400_portal_reportes.sql'))
  await db.exec(read('202610141500_portal_suscripcion.sql'))
  for (const nombre of ['comercial', 'ordinario', 'ajeno']) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await login(nombre)
    cuentas[nombre].id = (await call('iam_obtener_identidad')).usuario.id
  }
  await miembro('comercial', SCC, true)
})
after(() => db.close())

test('baseline preserva SCC y entitlements F6.3, sin inventar actor/historia anterior', async () => {
  await login('comercial')
  const resultado = await consultar(SCC)
  const { version_comercial, estado_pre_suspension, ...s } =
    resultado.estado.suscripcion
  assert.deepEqual(s, sccAntes)
  assert.equal(version_comercial, 0)
  assert.equal(resultado.historial.length, 1)
  assert.equal(resultado.historial[0].tipo_evento, 'ESTADO_IMPORTADO')
  assert.equal(resultado.historial[0].actor.tipo, 'MIGRACION_F6.4')
  for (const m of MODULOS) assert.equal(await enabled(SCC, m), true)
})

test('creación y cambio de Plan hacen snapshots y preservan add-ons/excepciones; no borran entitlements', async () => {
  const t = await empresa()
  const inicial = await estado(t)
  assert.equal(await enabled(t, 'HARVEST'), true)
  assert.equal(await enabled(t, 'WORKFORCE'), false)
  await cambio(t, 'HABILITAR_MODULO', { modulo: 'WORKFORCE', origen: 'ADD_ON' })
  await cambio(t, 'CAMBIAR_PLAN', { planId: PILOTO })
  assert.equal(await enabled(t, 'CAMPAIGN'), true)
  assert.equal(await enabled(t, 'WORKFORCE'), true)
  await cambio(t, 'DESHABILITAR_MODULO', { modulo: 'HARVEST' })
  assert.equal(await enabled(t, 'HARVEST'), false)
  await cambio(t, 'CAMBIAR_PLAN', { planId: CAMPO })
  assert.equal(await enabled(t, 'CAMPAIGN'), false)
  assert.equal(await enabled(t, 'WORKFORCE'), true)
  assert.equal(await enabled(t, 'HARVEST'), false)
  const r = await consultar(t)
  assert.equal(r.estado.modulos.length, 3)
  assert.equal(r.historial[0].estado_anterior.suscripcion, null)
  assert.deepEqual(r.historial[0].estado_nuevo, inicial)
  for (let i = 1; i < r.historial.length; i++)
    assert.deepEqual(r.historial[i].estado_anterior, r.historial[i - 1].estado_nuevo)
  assert.deepEqual(r.historial.at(-1).estado_nuevo, r.estado)
  assert.ok(r.historial.every((e) => e.actor.usuarioId === cuentas.comercial.id))
})

test('renovación extiende vigencia, suspensión conserva módulos y reactivación restaura trial o activa', async () => {
  const t = await empresa({ estadoInicial: 'TRIAL' })
  assert.equal(await enabled(t, 'HARVEST'), true)
  await cambio(t, 'SUSPENDER_SUSCRIPCION')
  assert.equal(await enabled(t, 'HARVEST'), false)
  await cambio(t, 'REACTIVAR_SUSCRIPCION')
  assert.equal((await estado(t)).suscripcion.estado, 'TRIAL')
  await cambio(t, 'RENOVAR_SUSCRIPCION', { hasta: '2100-01-01T00:00:00Z' })
  assert.equal((await estado(t)).suscripcion.estado, 'ACTIVA')
  assert.equal(await enabled(t, 'HARVEST'), true)
  await assert.rejects(
    cambio(t, 'RENOVAR_SUSCRIPCION', { hasta: '2099-01-01T00:00:00Z' }),
    /extender/
  )
  await cambio(t, 'SUSPENDER_SUSCRIPCION')
  await cambio(t, 'RENOVAR_SUSCRIPCION', { hasta: '2101-01-01T00:00:00Z' })
  assert.equal(await enabled(t, 'HARVEST'), false)
  await cambio(t, 'REACTIVAR_SUSCRIPCION')
  assert.equal(await enabled(t, 'HARVEST'), true)
  await cambio(t, 'CANCELAR_SUSCRIPCION')
  assert.equal(await enabled(t, 'HARVEST'), false)
  await assert.rejects(cambio(t, 'REACTIVAR_SUSCRIPCION'), /terminal/)
  await assert.rejects(
    cambio(t, 'RENOVAR_SUSCRIPCION', { hasta: '2102-01-01T00:00:00Z' }),
    /terminal/
  )
})

test('habilitar/baja de módulo exige catálogo real, origen explícito y vigencia; SCC sigue intacto', async () => {
  const t = await empresa()
  await cambio(t, 'HABILITAR_MODULO', {
    modulo: 'WORKFORCE',
    origen: 'EXCEPCION',
    hasta: '2090-01-01T00:00:00Z'
  })
  assert.equal(await enabled(t, 'WORKFORCE'), true)
  await cambio(t, 'DESHABILITAR_MODULO', { modulo: 'WORKFORCE' })
  assert.equal(await enabled(t, 'WORKFORCE'), false)
  await assert.rejects(
    cambio(t, 'HABILITAR_MODULO', { modulo: 'INVENTORY' }),
    /no disponible/
  )
  await assert.rejects(
    cambio(t, 'HABILITAR_MODULO', { modulo: 'HARVEST', origen: 'PLAN' }),
    /inválido/
  )
  await assert.rejects(
    cambio(t, 'HABILITAR_MODULO', { modulo: 'HARVEST', hasta: '2020-01-01' }),
    /inválido/
  )
  await login('comercial')
  for (const m of MODULOS) assert.equal(await enabled(SCC, m), true)
})

test('cambios programados respetan antes/después, snapshot del Plan, idempotencia y reloj servidor', async () => {
  const t = await empresa(),
    addon = await empresa(),
    cancelar = await empresa(),
    nuevo = await empresa({ crear: false }),
    baja = await empresa()
  const at = await serverFuture(),
    id = crypto.randomUUID()
  const vencida = await empresa({ estadoInicial: 'TRIAL', hasta: at.toISOString() })
  const r = await cambio(t, 'CAMBIAR_PLAN', { planId: PILOTO }, { at, id })
  assert.equal(r.fase, 'PROGRAMADA')
  await assert.rejects(
    call('platform_aplicar_operacion', ['uuid'], [id]),
    /todavía no es efectivo/
  )
  await cambio(
    addon,
    'HABILITAR_MODULO',
    { modulo: 'WORKFORCE', origen: 'ADD_ON' },
    { at }
  )
  await cambio(cancelar, 'CANCELAR_SUSCRIPCION', {}, { at })
  await cambio(baja, 'DESHABILITAR_MODULO', { modulo: 'HARVEST' }, { at })
  await cambio(
    nuevo,
    'CREAR_SUSCRIPCION',
    { planId: CAMPO, estado: 'ACTIVA', hasta: '2100-01-01' },
    { at }
  )
  assert.equal(await enabled(t, 'CAMPAIGN'), false)
  assert.equal(await enabled(addon, 'WORKFORCE'), false)
  assert.equal(await enabled(cancelar, 'HARVEST'), true)
  assert.equal(await enabled(nuevo, 'HARVEST'), false)
  assert.equal(await enabled(baja, 'HARVEST'), true)
  assert.equal(await enabled(vencida, 'HARVEST'), true)
  // Cambiar la plantilla después de admitir el cambio no modifica su intención.
  await db.query(
    "delete from platform_plan_modulos where plan_id=$1 and modulo_codigo='CAMPAIGN'",
    [PILOTO]
  )
  try {
    await esperarHasta(at)
    // La resolución F6.3 aplica por sí misma, sin depender de un cron de UI.
    assert.equal(await enabled(t, 'CAMPAIGN'), true)
    await login('ordinario')
    assert.deepEqual(await call('iam_listar_trabajadores', ['uuid'], [addon]), [])
    await login('comercial')
    assert.equal(await enabled(addon, 'WORKFORCE'), true)
    assert.equal(await enabled(cancelar, 'HARVEST'), false)
    assert.equal(await enabled(nuevo, 'HARVEST'), true)
    assert.equal(await enabled(baja, 'HARVEST'), false)
    assert.equal(await enabled(vencida, 'HARVEST'), false)
    await assert.rejects(cambio(vencida, 'REACTIVAR_SUSCRIPCION'), /suspendida/)
    await cambio(vencida, 'RENOVAR_SUSCRIPCION', { hasta: '2100-01-01T00:00:00Z' })
    assert.equal(await enabled(vencida, 'HARVEST'), true)
    assert.deepEqual(await cambio(t, 'CAMBIAR_PLAN', { planId: PILOTO }, { at, id }), r)
    const h = (await consultar(t)).historial.filter((e) => e.operacion_id === id)
    assert.deepEqual(
      h.map((e) => e.fase),
      ['PROGRAMADA', 'APLICADA']
    )
    assert.equal(h[1].contexto.ejecutor, 'SISTEMA')
    assert.equal(h[1].actor.usuarioId, cuentas.comercial.id)
    assert.equal(
      new Date((await estado(nuevo)).suscripcion.desde).getTime(),
      at.getTime()
    )
  } finally {
    await db.query(
      "insert into platform_plan_modulos(plan_id,modulo_codigo) values($1,'CAMPAIGN')",
      [PILOTO]
    )
  }
})

test('cambio intervenido o actor revocado queda rechazado en auditoría; worker no resucita cancelación', async () => {
  const conflicto = await empresa(),
    revocado = await empresa()
  const at = await serverFuture()
  const r = await cambio(conflicto, 'CAMBIAR_PLAN', { planId: PILOTO }, { at })
  const r2 = await cambio(revocado, 'SUSPENDER_SUSCRIPCION', {}, { at })
  await cambio(conflicto, 'CANCELAR_SUSCRIPCION')
  await db.query(
    'update platform_delegaciones_comerciales set activo=false where tenant_id=$1',
    [revocado]
  )
  await esperarHasta(at)
  await db.exec('set role service_role')
  try {
    assert.equal(await call('platform_procesar_programados'), 2)
  } finally {
    await db.exec('reset role')
  }
  assert.equal(await enabled(conflicto, 'HARVEST'), false)
  assert.equal(await enabled(revocado, 'HARVEST'), true)
  const h = (
    await db.query(
      "select contexto,estado_anterior,estado_nuevo from platform_eventos_comerciales where operacion_id in ($1,$2) and fase='RECHAZADA'",
      [r.operacionId, r2.operacionId]
    )
  ).rows
  assert.equal(h.length, 2)
  assert.ok(h.some((e) => /versión/.test(e.contexto.rechazo)))
  assert.ok(h.some((e) => /revocada/.test(e.contexto.rechazo)))
  assert.ok(
    h.every((e) => JSON.stringify(e.estado_anterior) === JSON.stringify(e.estado_nuevo))
  )
  assert.equal(await call('platform_procesar_programados'), 0)
})

test('idempotencia devuelve recibo original tras otros cambios y rechaza ID reutilizado o actor falso', async () => {
  const t = await empresa(),
    otra = await empresa(),
    id = crypto.randomUUID()
  const r = await cambio(t, 'SUSPENDER_SUSCRIPCION', {}, { id })
  await cambio(t, 'REACTIVAR_SUSCRIPCION')
  await db.exec("set timezone='America/Lima'")
  try {
    assert.deepEqual(await cambio(t, 'SUSPENDER_SUSCRIPCION', {}, { id }), r)
  } finally {
    await db.exec("set timezone='UTC'")
  }
  assert.deepEqual(await cambio(t, 'SUSPENDER_SUSCRIPCION', {}, { id }), r)
  await assert.rejects(
    cambio(t, 'SUSPENDER_SUSCRIPCION', {}, { id, motivo: 'Otro motivo' }),
    /reutilizado/
  )
  await assert.rejects(cambio(otra, 'SUSPENDER_SUSCRIPCION', {}, { id }), /reutilizado/)
  await assert.rejects(
    cambio(t, 'SUSPENDER_SUSCRIPCION', { actor: cuentas.comercial.id }),
    /desconocidos/
  )
  assert.equal(
    (await consultar(t)).historial.filter((e) => e.operacion_id === id).length,
    1
  )
  await assert.rejects(
    cambio(t, 'SUSPENDER_SUSCRIPCION', {}, { at: '2020-01-01' }),
    /pasado/
  )
})

test('historial y comandos inmutables; toda mutación de proyección exige auditoría al commit', async () => {
  const t = await empresa()
  for (const table of [
    'platform_eventos_comerciales',
    'platform_operaciones_comerciales'
  ]) {
    await assert.rejects(
      db.query(`update ${table} set motivo='Alterado' where tenant_id=$1`, [t]),
      /inmutable/
    )
    await assert.rejects(
      db.query(`delete from ${table} where tenant_id=$1`, [t]),
      /inmutable/
    )
    await assert.rejects(db.exec('truncate ' + table + ' cascade'), /inmutable/)
  }
  const anterior = await estado(t)
  // Autocommit fuerza evaluación de las constraint triggers diferidas.
  await assert.rejects(
    db.query(
      "update platform_suscripciones set estado='CANCELADA' where tenant_id=$1",
      [t]
    ),
    /sin evento/
  )
  await assert.rejects(
    db.query('update platform_tenant_modulos set habilitado=false where tenant_id=$1', [
      t
    ]),
    /sin evento/
  )
  assert.deepEqual(await estado(t), anterior)
  await db.exec('set role service_role')
  try {
    await assert.rejects(
      db.query(
        "insert into platform_eventos_comerciales(tenant_id,tipo_evento,fase,actor,effective_at,estado_anterior,estado_nuevo,motivo,version_comercial) values($1,'ESTADO_IMPORTADO','BASELINE','{}',now(),'{}','{}','Falso',0)",
        [t]
      ),
      /permission denied/
    )
    await assert.rejects(
      call('platform_aplicar_operacion', ['uuid'], [crypto.randomUUID()]),
      /permission denied/
    )
    await assert.rejects(
      db.query(
        'update platform_tenant_modulos set habilitado=false where tenant_id=$1',
        [t]
      ),
      /permission denied/
    )
    await assert.rejects(
      call(
        'platform_crear_suscripcion',
        ['uuid', 'uuid', 'text', 'timestamptz'],
        [crypto.randomUUID(), CAMPO, 'ACTIVA', '2020-01-01']
      ),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
})

test('actor ordinario/admin del Tenant no puede contratar ni delegarse; RLS/FK impiden cruces', async () => {
  const t = await empresa(),
    otro = await empresa()
  await login('ordinario')
  assert.equal(await call('platform_puede_administrar', ['uuid'], [t]), false)
  await db.exec('set role authenticated')
  try {
    await assert.rejects(cambio(t, 'SUSPENDER_SUSCRIPCION'), /subscription.manage/)
    assert.deepEqual(
      (await db.query('select id from platform_eventos_comerciales')).rows,
      []
    )
    await assert.rejects(
      db.query(
        'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
        [t, cuentas.ordinario.id]
      ),
      /permission denied/
    )
    await assert.rejects(
      call('platform_aplicar_pendientes', ['uuid'], [t]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  await login('ajeno')
  await assert.rejects(cambio(t, 'SUSPENDER_SUSCRIPCION'), /no autorizada/)
  await assert.rejects(
    db.query(
      'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
      [t, cuentas.ajeno.id]
    ),
    /foreign key/
  )
  await login('comercial')
  const op = (await consultar(t)).historial[0].operacion_id
  await assert.rejects(
    db.query(
      `insert into platform_eventos_comerciales(tenant_id,operacion_id,tipo_evento,fase,actor_usuario_id,actor,effective_at,estado_anterior,estado_nuevo,motivo)
    values($1,$2,'CREAR_SUSCRIPCION','RECHAZADA',$3,'{}',now(),'{}','{}','Cruce')`,
      [otro, op, cuentas.comercial.id]
    ),
    /foreign key/
  )
  await db.query(
    'update platform_delegaciones_comerciales set activo=false where tenant_id=$1',
    [otro]
  )
  await db.exec('set role authenticated')
  try {
    assert.ok(
      (await db.query('select tenant_id from platform_eventos_comerciales')).rows.every(
        (r) => r.tenant_id !== otro
      )
    )
    assert.ok(await consultar(t))
    await assert.rejects(consultar(otro), /subscription.manage/)
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  try {
    await assert.rejects(cambio(t, 'SUSPENDER_SUSCRIPCION'), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
})

test('F6.4 idempotente preserva SCC, receipts, historial y RPC legacy/Identity de F6.3', async () => {
  await login('comercial')
  const antes = await consultar(SCC)
  await db.exec(read('202610141000_platform_ciclo_vida.sql'))
  assert.deepEqual(await consultar(SCC), antes)
  for (const m of MODULOS) assert.equal(await enabled(SCC, m), true)
  assert.equal(
    (await call('iam_obtener_reporte', ['uuid', 'text'], [A, 'RESUMEN'])).ok,
    true
  )
  await login('legacy')
  assert.equal((await call('validar_operador_campanias', ['varchar'], [OP])).dni, OP)
  assert.ok(
    await call('obtener_cache_operativa_campania', ['uuid', 'varchar'], [B, OP])
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
