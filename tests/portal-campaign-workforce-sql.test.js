import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  T2 = crypto.randomUUID(),
  cuentas = {},
  M = '202610141200_portal_campaign_workforce.sql'
const CULTIVO = 'a1000000-0000-4000-8000-000000000001',
  MANDARINA = 'a1000000-0000-4000-8000-000000000002'
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
let c, cB, w, wB, variedad
const crearC = (tenant, codigo, estado = 'CERRADA', cultivo = CULTIVO) =>
  call(
    'campaign_admin_crear',
    ['uuid', 'text', 'text', 'uuid', 'date', 'date', 'estado_campania'],
    [tenant, codigo, 'Campaña ' + codigo, cultivo, '2026-01-01', null, estado]
  )
const editarC = (tenant, id, cultivo = CULTIVO, inicio = '2026-01-01', fin = null) =>
  call(
    'campaign_admin_editar',
    ['uuid', 'uuid', 'text', 'text', 'uuid', 'date', 'date'],
    [tenant, id, 'EDITADA', 'Campaña editada', cultivo, inicio, fin]
  )
const crearW = (tenant, dni) =>
  call(
    'workforce_admin_crear',
    ['uuid', 'text', 'text', 'text'],
    [tenant, dni, 'Nueva', 'Persona']
  )
const rol = (trabajador, campania, role = 'COSECHADOR', activo = true, tenant = T1) =>
  call(
    'workforce_admin_' + (activo ? 'asignar' : 'retirar') + '_rol',
    ['uuid', 'uuid', 'uuid', 'rol_trabajador'],
    [tenant, trabajador, campania, role]
  )
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls; alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to service_role;"
  )
  for (const n of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql',
    '202610141000_platform_ciclo_vida.sql',
    '202610141100_portal_identity_admin.sql',
    M,
    '202610141300_portal_harvest_admin.sql'
  ])
    await db.exec(read(n))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa B','F73-B')",
    [T2]
  )
  for (const n of ['admin', 'campaign', 'workforce', 'consulta']) {
    cuentas[n] = { sujeto: crypto.randomUUID() }
    await login(n)
    cuentas[n].id = (await call('iam_obtener_identidad')).usuario.id
    const permiso = n === 'campaign' ? 'campaign.manage' : 'workforce.manage'
    if (['campaign', 'workforce'].includes(n))
      await db.query(
        `with r as (insert into identity_roles(tenant_id,codigo) values($1,$2) returning id)
      insert into identity_rol_permisos(tenant_id,rol_id,permiso) select $1,r.id,$3 from r`,
        [T1, 'TEST_' + n.toUpperCase(), permiso]
      )
    for (const t of n === 'admin' ? [T1, T2] : [T1])
      await db.query(
        `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r
      where r.tenant_id=$1 and r.codigo=$3`,
        [
          t,
          cuentas[n].id,
          n === 'admin'
            ? 'ADMIN_EMPRESA'
            : n === 'consulta'
              ? 'CONSULTA'
              : 'TEST_' + n.toUpperCase()
        ]
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
      'Piloto de prueba'
    ]
  )
})
after(() => db.close())
test('alta/edición de campaña preserva fechas, cultivo y código único por empresa', async () => {
  await login('admin')
  c = await crearC(T1, 'F73')
  cB = await crearC(T2, 'F73', 'ACTIVA')
  assert.equal(c.tenantId, T1)
  assert.equal(cB.codigo, c.codigo)
  await assert.rejects(crearC(T1, 'F73'), /duplicate key/)
  c = await editarC(T1, c.id)
  assert.equal(c.nombre, 'Campaña editada')
  assert.equal(c.estado, 'CERRADA')
  await assert.rejects(
    editarC(T1, c.id, CULTIVO, '2026-02-01', '2026-01-01'),
    /fin no puede/
  )
  await assert.rejects(editarC(T1, cB.id), /no pertenece/)
  const lista = await call(
    'campaign_admin_listar',
    ['uuid', 'text', 'text', 'uuid'],
    [T1, 'EDITADA', 'CERRADA', CULTIVO]
  )
  assert.deepEqual(
    lista.campanias.map((x) => x.id),
    [c.id]
  )
})
test('activar/cerrar son transiciones explícitas; una activa por Tenant y cultivo sin cierre implícito', async () => {
  await assert.rejects(
    call('campaign_admin_activar', ['uuid', 'uuid'], [T1, c.id]),
    /duplicate key/
  )
  assert.equal(
    (await call('campaign_admin_obtener', ['uuid', 'uuid'], [T1, A])).estado,
    'ACTIVA'
  )
  await call('campaign_admin_cerrar', ['uuid', 'uuid'], [T1, A])
  assert.equal(
    (await call('campaign_admin_activar', ['uuid', 'uuid'], [T1, c.id])).estado,
    'ACTIVA'
  )
  await assert.rejects(
    call('campaign_admin_activar', ['uuid', 'uuid'], [T1, c.id]),
    /Sólo una campaña cerrada/
  )
  await assert.rejects(
    call('campaign_admin_cerrar', ['uuid', 'uuid', 'date'], [T1, c.id, '2025-01-01']),
    /fin no puede/
  )
  assert.equal(
    (
      await call(
        'campaign_admin_cerrar',
        ['uuid', 'uuid', 'date'],
        [T1, c.id, '2026-02-01']
      )
    ).estado,
    'CERRADA'
  )
  await assert.rejects(
    call('campaign_admin_cerrar', ['uuid', 'uuid'], [T1, c.id]),
    /Sólo una campaña activa/
  )
  await call('campaign_admin_activar', ['uuid', 'uuid'], [T1, A])
  assert.equal(
    (await call('campaign_admin_obtener', ['uuid', 'uuid'], [T2, cB.id])).estado,
    'ACTIVA'
  )
  await assert.rejects(
    editarC(T1, A, MANDARINA),
    /cultivo de una campaña con lotes o personal/
  )
})
test('variedades reutilizan catálogo Tenant/cultivo y configuración de lote conserva sesiones históricas', async () => {
  variedad = await call(
    'campaign_admin_guardar_variedad',
    ['uuid', 'uuid', 'uuid', 'text', 'boolean'],
    [T1, A, null, 'Variedad F73', true]
  )
  const otra = await call(
    'campaign_admin_guardar_variedad',
    ['uuid', 'uuid', 'uuid', 'text', 'boolean'],
    [T2, cB.id, null, 'Variedad F73', true]
  )
  await assert.rejects(
    call(
      'campaign_admin_guardar_variedad',
      ['uuid', 'uuid', 'uuid', 'text', 'boolean'],
      [T1, A, otra.id, 'Ajena', true]
    ),
    /otra empresa/
  )
  const lotes = await call('campaign_admin_lotes', ['uuid', 'uuid'], [T1, A]),
    l = lotes[0]
  const otroCultivo = await call(
    'campaign_admin_guardar_variedad',
    ['uuid', 'uuid', 'uuid', 'text', 'boolean'],
    [T1, B, null, 'Otro cultivo F73', true]
  )
  assert.equal(
    (await call('campaign_admin_variedades', ['uuid', 'uuid'], [T1, A])).some(
      (v) => v.id === otroCultivo.id
    ),
    false
  )
  await assert.rejects(
    call(
      'campaign_admin_configurar_variedades_lote',
      ['uuid', 'uuid', 'uuid', 'uuid[]'],
      [T1, A, l.id, [otroCultivo.id]]
    ),
    /otra empresa\/cultivo/
  )
  const antes = (
    await db.query('select count(*)::int n from sesiones_lectura where lote_id=$1', [
      l.id
    ])
  ).rows[0].n
  await call(
    'campaign_admin_configurar_variedades_lote',
    ['uuid', 'uuid', 'uuid', 'uuid[]'],
    [T1, A, l.id, [variedad.id]]
  )
  assert.equal(
    (
      await db.query('select count(*)::int n from sesiones_lectura where lote_id=$1', [
        l.id
      ])
    ).rows[0].n,
    antes
  )
  assert.equal(
    (
      await db.query(
        'select activo from lote_variedades where lote_id=$1 and variedad_id=$2',
        [l.id, l.variedadIds[0]]
      )
    ).rows[0].activo,
    false
  )
  await assert.rejects(
    call(
      'campaign_admin_configurar_variedades_lote',
      ['uuid', 'uuid', 'uuid', 'uuid[]'],
      [T1, A, l.id, [otra.id]]
    ),
    /otra empresa/
  )
  await assert.rejects(
    call(
      'campaign_admin_configurar_variedades_lote',
      ['uuid', 'uuid', 'uuid', 'uuid[]'],
      [T1, A, l.id, []]
    ),
    /al menos/
  )
  await call(
    'campaign_admin_guardar_variedad',
    ['uuid', 'uuid', 'uuid', 'text', 'boolean'],
    [T1, A, variedad.id, 'Variedad editada', false]
  )
  // Una asociación inactiva nueva no puede reactivarse usando otra variedad activa como señuelo.
  await call(
    'campaign_admin_configurar_variedades_lote',
    ['uuid', 'uuid', 'uuid', 'uuid[]'],
    [T1, A, l.id, l.variedadIds]
  )
  await assert.rejects(
    call(
      'campaign_admin_configurar_variedades_lote',
      ['uuid', 'uuid', 'uuid', 'uuid[]'],
      [T1, A, l.id, [variedad.id, ...l.variedadIds]]
    ),
    /no disponible/
  )
})
test('alta de trabajador sin cuenta: DNI único dentro del Tenant y permitido en Tenant diferente', async () => {
  w = await crearW(T1, '77778888')
  wB = await crearW(T2, w.dni)
  await assert.rejects(crearW(T1, w.dni), /duplicate key/)
  assert.equal(
    (await call('workforce_admin_obtener', ['uuid', 'uuid'], [T1, w.id])).nombres,
    'Nueva'
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from identity_membresias where trabajador_id=$1',
        [w.id]
      )
    ).rows[0].n,
    0
  )
  const editado = await call(
    'workforce_admin_editar',
    ['uuid', 'uuid', 'text', 'text', 'text'],
    [T1, w.id, w.dni, 'Editada', 'Persona']
  )
  assert.equal(editado.nombres, 'Editada')
  await assert.rejects(
    call(
      'workforce_admin_editar',
      ['uuid', 'uuid', 'text', 'text', 'text'],
      [T1, w.id, OP, 'Duplicada', 'Persona']
    ),
    /duplicate key/
  )
  assert.equal(
    (
      await call(
        'workforce_admin_listar',
        ['uuid', 'text', 'boolean'],
        [T1, w.dni, true]
      )
    ).total,
    1
  )
  await assert.rejects(
    call('workforce_admin_obtener', ['uuid', 'uuid'], [T1, wB.id]),
    /no pertenece/
  )
  await assert.rejects(
    call(
      'workforce_admin_editar',
      ['uuid', 'uuid', 'text', 'text', 'text'],
      [T1, wB.id, w.dni, 'Ajena', 'Persona']
    ),
    /no pertenece/
  )
})
test('participación y roles laborales conservan UUID e historial; JABERO no se convierte en CRUD', async () => {
  let p = await rol(w.id, A, 'SUPERVISORA')
  assert.equal(p[0].rol, 'SUPERVISORA')
  const id = p[0].id
  await rol(w.id, A, 'COSECHADOR')
  p = await rol(w.id, A, 'SUPERVISORA', false)
  assert.equal(p.find((x) => x.id === id).activo, false)
  p = await rol(w.id, A, 'SUPERVISORA')
  assert.equal(p.find((x) => x.id === id).activo, true)
  await assert.rejects(rol(w.id, c.id), /deben estar activos/)
  await assert.rejects(rol(wB.id, A), /no pertenece/)
  await assert.rejects(rol(w.id, cB.id), /otra empresa/)
  await assert.rejects(rol(w.id, A, 'JABERO'), /asignación diaria/)
  assert.deepEqual((await call('workforce_admin_catalogo', ['uuid'], [T1])).roles, [
    'SUPERVISORA',
    'COSECHADOR'
  ])
})
test('activar/desactivar trabajador conserva participaciones y no modifica cuenta Identity ni otro Tenant', async () => {
  await db.query(
    'update identity_membresias set trabajador_id=$1 where usuario_id=$2 and tenant_id=$3',
    [w.id, cuentas.consulta.id, T1]
  )
  const antes = await call(
    'workforce_admin_participaciones',
    ['uuid', 'uuid'],
    [T1, w.id]
  )
  assert.equal(
    (await call('workforce_admin_desactivar', ['uuid', 'uuid'], [T1, w.id])).activo,
    false
  )
  assert.deepEqual(
    await call('workforce_admin_participaciones', ['uuid', 'uuid'], [T1, w.id]),
    antes
  )
  await assert.rejects(rol(w.id, A), /deben estar activos/)
  await login('consulta')
  assert.equal(
    (await call('iam_resolver_tenant_context', ['uuid'], [T1])).usuarioId,
    cuentas.consulta.id
  )
  await login('admin')
  assert.equal(
    (await call('workforce_admin_obtener', ['uuid', 'uuid'], [T2, wB.id])).activo,
    true
  )
  assert.equal(
    (await call('workforce_admin_activar', ['uuid', 'uuid'], [T1, w.id])).activo,
    true
  )
})
test('permisos separados: ni company/consulta ni workforce conceden gestión Campaign y viceversa', async () => {
  await login('workforce')
  assert.ok(await call('workforce_admin_catalogo', ['uuid'], [T1]))
  await assert.rejects(crearC(T1, 'DENEGADA'), /Permiso/)
  await login('campaign')
  assert.ok(await call('campaign_admin_cultivos', ['uuid'], [T1]))
  await assert.rejects(crearW(T1, '11112222'), /Permiso/)
  await login('consulta')
  await assert.rejects(call('campaign_admin_listar', ['uuid'], [T1]), /Permiso/)
  await assert.rejects(call('workforce_admin_listar', ['uuid'], [T1]), /Permiso/)
})
test('entitlements servidor impiden lecturas y escrituras aunque el usuario tenga permisos', async () => {
  await login('admin')
  for (const [modulo, lectura, escritura] of [
    [
      'CAMPAIGN',
      () => call('campaign_admin_listar', ['uuid'], [T2]),
      () => crearC(T2, 'NO-MODULO')
    ],
    [
      'WORKFORCE',
      () => call('workforce_admin_listar', ['uuid'], [T2]),
      () => crearW(T2, '11112222')
    ]
  ]) {
    await call(
      'platform_solicitar_cambio',
      ['uuid', 'uuid', 'text', 'jsonb', 'text'],
      [crypto.randomUUID(), T2, 'DESHABILITAR_MODULO', { modulo }, 'Prueba módulo']
    )
    await assert.rejects(lectura(), /Módulo no habilitado/)
    await assert.rejects(escritura(), /Módulo no habilitado/)
    await call(
      'platform_solicitar_cambio',
      ['uuid', 'uuid', 'text', 'jsonb', 'text'],
      [crypto.randomUUID(), T2, 'HABILITAR_MODULO', { modulo }, 'Restaurar prueba']
    )
  }
})
test('ACL de APIs públicas y helpers privados; migración idempotente y DNI legacy preservados', async () => {
  await db.exec('set role authenticated')
  try {
    assert.ok(await call('campaign_admin_listar', ['uuid'], [T1]))
    await assert.rejects(
      call('campaign_admin_dto', ['uuid', 'uuid'], [T1, A]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','workforce_admin_guardar_datos(uuid,uuid,text,text,text)','execute') p"
      )
    ).rows[0].p,
    false
  )
  const antes = await call('platform_estado_comercial', ['uuid'], [T1])
  await db.exec(read(M))
  assert.deepEqual(await call('platform_estado_comercial', ['uuid'], [T1]), antes)
  await login(null)
  assert.equal((await call('validar_operador_campanias', ['varchar'], [OP])).dni, OP)
  assert.ok(
    await call('obtener_cache_operativa_campania', ['uuid', 'varchar'], [A, OP])
  )
})
