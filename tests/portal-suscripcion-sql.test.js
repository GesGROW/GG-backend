import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as SCC } from '@gesgrow/core/contexts/platform/index.js'
const db = new PGlite(),
  cuentas = {},
  PILOTO = '00000000-0000-4000-8000-000000000063',
  CAMPO = '00000000-0000-4000-8000-000000000064',
  M = '202610141500_portal_suscripcion.sql',
  dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
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
const ver = (t) => call('platform_portal_obtener_suscripcion', ['uuid'], [t])
const cambiar = (
  t,
  tipo,
  parametros = {},
  v = '1',
  op = crypto.randomUUID(),
  at = null
) =>
  call(
    'platform_portal_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text', 'bigint', 'timestamptz'],
    [op, t, tipo, parametros, 'Acuerdo comercial de prueba', v, at]
  )
async function miembro(n, t, delegado = false, rol = 'ADMIN_EMPRESA') {
  await db.query(
    `with m as (insert into identity_membresias(usuario_id,tenant_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $2,m.id,r.id from m cross join identity_roles r where r.tenant_id=$2 and r.codigo=$3`,
    [cuentas[n].id, t, rol]
  )
  if (delegado)
    await db.query(
      'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
      [t, cuentas[n].id]
    )
}
async function empresa() {
  const t = crypto.randomUUID()
  await db.query('insert into tenants(id,codigo,nombre) values($1,$2,$2)', [
    t,
    ('F76-' + t).toUpperCase()
  ])
  await miembro('comercial', t, true)
  await miembro('ordinario', t)
  await miembro('campo', t, false, 'OPERADOR_CAMPO')
  await login('comercial')
  await call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text'],
    [
      crypto.randomUUID(),
      t,
      'CREAR_SUSCRIPCION',
      { planId: CAMPO, hasta: '2090-01-01T00:00:00Z' },
      'Alta de prueba'
    ]
  )
  return t
}
let antesScc
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls; alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to service_role;"
  )
  for (const n of readdirSync(dir)
    .filter((n) => /^20261014/.test(n) && n >= '202610140600' && n < M)
    .sort())
    await db.exec(read(n))
  antesScc = await call('platform_estado_comercial', ['uuid'], [SCC])
  await db.exec(read(M))
  for (const n of ['comercial', 'ordinario', 'campo', 'ajeno']) {
    cuentas[n] = { sujeto: crypto.randomUUID() }
    await login(n)
    cuentas[n].id = (await call('iam_obtener_identidad')).usuario.id
  }
  await miembro('ordinario', SCC)
})
after(() => db.close())
test('company.manage consulta estado, plan, historial y módulos efectivos sin subscription.manage', async () => {
  const t = await empresa()
  await login('ordinario')
  const r = await ver(t)
  assert.equal(r.tenantId, t)
  assert.equal(r.puedeAdministrar, false)
  assert.equal(r.versionBase, '1')
  assert.equal(r.planActual.id, CAMPO)
  assert.deepEqual(r.modulosEfectivos, ['HARVEST'])
  assert.ok(r.historial.length)
  assert.ok(r.actualizadoEn)
  await assert.rejects(
    cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }),
    /subscription.manage/
  )
  await db.exec('set role authenticated')
  try {
    assert.ok(await ver(t))
    assert.equal(
      (await db.query('select count(*)::int n from platform_delegaciones_comerciales'))
        .rows[0].n,
      0
    )
    await assert.rejects(
      db.query(
        'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
        [t, cuentas.ordinario.id]
      ),
      /permission denied/
    )
    await assert.rejects(
      db.query("update platform_suscripciones set estado='ACTIVA'"),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
})
test('plan + add-on independiente; cambio de plan y baja/habilitación preservan las reglas F6.4', async () => {
  const t = await empresa()
  const add = await cambiar(t, 'HABILITAR_MODULO', {
    modulo: 'WORKFORCE',
    origen: 'ADD_ON'
  })
  assert.equal(add.fase, 'APLICADA')
  assert.deepEqual((await ver(t)).modulosEfectivos, ['HARVEST', 'WORKFORCE'])
  await cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }, '2')
  let r = await ver(t)
  assert.equal(r.planActual.id, PILOTO)
  assert.equal(
    r.estado.modulos.find((m) => m.modulo_codigo === 'WORKFORCE').origen,
    'ADD_ON'
  )
  await cambiar(t, 'DESHABILITAR_MODULO', { modulo: 'HARVEST' }, '3')
  assert.deepEqual((await ver(t)).modulosEfectivos, ['CAMPAIGN', 'WORKFORCE'])
  await cambiar(t, 'HABILITAR_MODULO', { modulo: 'HARVEST', origen: 'EXCEPCION' }, '4')
  r = await ver(t)
  assert.ok(r.modulosEfectivos.includes('HARVEST'))
  assert.equal(r.historial.length, 5)
})
test('renovación, suspensión/reactivación y cancelación cambian acceso efectivo en servidor', async () => {
  const t = await empresa()
  await cambiar(t, 'RENOVAR_SUSCRIPCION', { hasta: '2091-01-01T00:00:00Z' })
  assert.match((await ver(t)).estado.suscripcion.hasta, /2091/)
  await cambiar(t, 'SUSPENDER_SUSCRIPCION', {}, '2')
  assert.deepEqual((await ver(t)).modulosEfectivos, [])
  await cambiar(t, 'REACTIVAR_SUSCRIPCION', {}, '3')
  assert.deepEqual((await ver(t)).modulosEfectivos, ['HARVEST'])
  await cambiar(t, 'CANCELAR_SUSCRIPCION', {}, '4')
  assert.equal((await ver(t)).estado.suscripcion.estado, 'CANCELADA')
  assert.deepEqual((await ver(t)).modulosEfectivos, [])
  await assert.rejects(cambiar(t, 'REACTIVAR_SUSCRIPCION', {}, '5'), /terminal/)
})
test('conflicto de versión rechaza intención nueva; reintento aplicado devuelve recibo aunque versión haya avanzado', async () => {
  const t = await empresa(),
    op = crypto.randomUUID()
  const r = await cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }, '1', op)
  await assert.rejects(
    cambiar(t, 'SUSPENDER_SUSCRIPCION', {}, '1'),
    (e) => e.code === '40001'
  )
  await cambiar(t, 'DESHABILITAR_MODULO', { modulo: 'HARVEST' }, '2')
  assert.deepEqual(await cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }, '1', op), r)
  await assert.rejects(
    cambiar(t, 'CAMBIAR_PLAN', { planId: CAMPO }, '1', op),
    /reutilizado/
  )
  await assert.rejects(
    cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }, '3', op),
    /otra versión/
  )
  assert.equal((await ver(t)).historial.length, 3)
})
test('cambio programado mantiene estado actual, reloj servidor y rechazo por versión al llegar vigencia', async () => {
  const t = await empresa(),
    op = crypto.randomUUID(),
    at = (await db.query("select clock_timestamp()+interval '2 seconds' f")).rows[0].f
  const r = await cambiar(t, 'SUSPENDER_SUSCRIPCION', {}, '1', op, at)
  assert.equal(r.fase, 'PROGRAMADA')
  let estado = await ver(t)
  assert.equal(estado.estado.suscripcion.estado, 'ACTIVA')
  assert.equal(estado.programados.length, 1)
  await db.query('select pg_sleep(2.05)')
  // El lector ordinario no ejecuta reglas comerciales en UI. Platform aplica
  // la intención persistida y revalida su actor al consultar.
  await login('ordinario')
  estado = await ver(t)
  assert.equal(estado.estado.suscripcion.estado, 'SUSPENDIDA')
  assert.equal(estado.programados.length, 0)
  assert.ok(
    estado.historial.some((e) => e.fase === 'APLICADA' && e.operacion_id === op)
  )
  await login('comercial')
  assert.deepEqual(await cambiar(t, 'SUSPENDER_SUSCRIPCION', {}, '1', op, at), r)
  await cambiar(t, 'REACTIVAR_SUSCRIPCION', {}, '2')
  const futura = (await db.query("select clock_timestamp()+interval '2 seconds' f"))
    .rows[0].f
  await cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }, '3', crypto.randomUUID(), futura)
  await cambiar(t, 'DESHABILITAR_MODULO', { modulo: 'HARVEST' }, '3')
  await db.query('select pg_sleep(2.05)')
  estado = await ver(t)
  assert.equal(estado.planActual.id, CAMPO)
  assert.ok(
    estado.historial.some(
      (e) => e.fase === 'RECHAZADA' && /versión/.test(e.contexto.rechazo)
    )
  )
})
test('cross-tenant, otro actor, membresía o delegación revocadas y sesión ausente se revalidan', async () => {
  const t = await empresa(),
    otro = await empresa(),
    op = crypto.randomUUID()
  await cambiar(t, 'CAMBIAR_PLAN', { planId: PILOTO }, '1', op)
  await assert.rejects(
    cambiar(otro, 'CAMBIAR_PLAN', { planId: PILOTO }, '1', op),
    /otro Tenant/
  )
  await login('ajeno')
  await assert.rejects(ver(t), /membresía/)
  await login('campo')
  await assert.rejects(ver(t), /Permiso/)
  await login('comercial')
  await db.query(
    'update platform_delegaciones_comerciales set activo=false where tenant_id=$1',
    [t]
  )
  await assert.rejects(
    cambiar(t, 'SUSPENDER_SUSCRIPCION', {}, '2'),
    /subscription.manage/
  )
  await db.query(
    'update identity_membresias set activo=false where tenant_id=$1 and usuario_id=$2',
    [otro, cuentas.comercial.id]
  )
  await assert.rejects(ver(otro), /membresía/)
  await login(null)
  await assert.rejects(ver(t), /Sesión/)
})
test('historial inmutable y ninguna autodelegación; SCC y migración idempotente preservados', async () => {
  await login('ordinario')
  const r = await ver(SCC)
  assert.deepEqual(r.estado, antesScc)
  assert.deepEqual(r.modulosEfectivos, ['CAMPAIGN', 'HARVEST', 'WORKFORCE'])
  await assert.rejects(
    db.exec("update platform_eventos_comerciales set motivo='Ocultar'"),
    /inmutable/
  )
  await assert.rejects(db.exec('delete from platform_eventos_comerciales'), /inmutable/)
  await assert.rejects(db.exec('truncate platform_eventos_comerciales'), /inmutable/)
  await db.exec(read(M))
  assert.deepEqual((await ver(SCC)).estado, antesScc)
  await db.exec('set role anon')
  try {
    await assert.rejects(ver(SCC), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','platform_portal_solicitar_cambio(uuid,uuid,text,jsonb,text,bigint,timestamptz)','execute') p"
      )
    ).rows[0].p,
    false
  )
})
