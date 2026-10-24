import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const db = new PGlite()
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_A = '10000000-0000-4000-8000-000000000001'
const USER_B = '10000000-0000-4000-8000-000000000002'
const USER_REPORT = '10000000-0000-4000-8000-000000000003'
const USER_BOTH = '10000000-0000-4000-8000-000000000004'
const USER_COMERCIAL = '10000000-0000-4000-8000-000000000064'
const shared = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TENANT_B = '00000000-0000-4000-8000-000000000012'
const CAMPANIA_TENANT_B = '00000000-0000-4000-8000-000000000013'
const VA = '11111111-1111-4111-8111-111111111111'
let VB, LB, workerA, workerB, roleB
const call = async (name, args = []) => {
  const types = args.map(([, type], i) => `$${i + 1}::${type}`).join(',')
  return (
    await db.query(
      `select public.${name}(${types}) resultado`,
      args.map(([value]) => value)
    )
  ).rows[0].resultado
}
const list = (name, campania) => call(name + '_hoja', [[campania, 'uuid']])
const login = (id) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
const worker = (
  campania,
  dni,
  nombres = 'Ana',
  apellidos = 'Pérez',
  activo = true,
  id = null
) =>
  call('admin_guardar_trabajador_hoja', [
    [campania, 'uuid'],
    [id, 'uuid'],
    [dni, 'varchar'],
    [nombres, 'varchar'],
    [apellidos, 'varchar'],
    [activo, 'boolean']
  ])
const variety = (campania, nombre, id = null) =>
  call('admin_guardar_variedad_hoja', [
    [campania, 'uuid'],
    [id, 'uuid'],
    [nombre, 'varchar'],
    [true, 'boolean']
  ])

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  await db.exec(`create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table integraciones_api(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique,nombre text,
      activo boolean default true,puede_gestionar_maestros boolean default false,puede_consultar_reportes boolean default false);`)
  // Los RPC de trabajadores no tienen dependencia de auth.users.
  const trabajadores = read('../supabase/migrations/20260930_admin_trabajadores.sql')
  await db.exec(
    trabajadores.slice(
      trabajadores.indexOf(
        'create or replace function public.admin_guardar_trabajador('
      )
    )
  )
  for (const name of [
    '20260930_admin_campanias.sql',
    '20261001_admin_roles_campania.sql',
    '20261001_consistencia_acceso_app.sql',
    '202610030100_acceso_diario_jaberos.sql'
  ])
    await db.exec(read('../supabase/migrations/' + name))
  await db.exec(read('./fixtures/multicultivo.sql'))
  for (const name of [
    '20260930_admin_variedades.sql',
    '20260928_iniciar_sesion_lectura_pda.sql',
    '20260929_idempotencia_cola_pda.sql',
    '202610020100_jabero_provisional.sql',
    '202610010230_cosechador_provisional_asignar_ticket.sql',
    '20260930_admin_lotes.sql',
    '20260930_resumen_campania.sql',
    '202610020200_restaurar_produccion_diaria.sql',
    '202610030200_ranking_por_periodo.sql',
    '20260930_admin_reportes_sheets.sql',
    '202610030300_admin_ranking_por_periodo.sql',
    '202610110100_lotes_variedades.sql',
    '202610110200_produccion_lote_variedad.sql',
    '202610110300_cultivos_campanias.sql',
    '202610110400_rpc_por_campania.sql'
  ])
    await db.exec(read('../supabase/migrations/' + name))
  await db.query(
    "insert into campanias(id,codigo,nombre,fecha_inicio,estado,cultivo_id) values($1,'MAND-2026','Mandarina',current_date,'ACTIVA','a1000000-0000-4000-8000-000000000002')",
    [B]
  )
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)",
    [shared, B]
  )
  await db.exec(read('../supabase/migrations/202610110500_sheets_por_campania.sql'))
  // Los mismos flujos de archivos/Apps Script se verifican después de F6.1.
  for (const name of [
    '202610140100_harvest_tickets.sql',
    '202610140200_harvest_asignar_lote.sql',
    '202610140250_workforce_jabero_campania.sql',
    '202610140300_harvest_registrar_cosecha.sql',
    '202610140400_harvest_snapshot.sql',
    '202610140500_harvest_compatibilidad_v4.sql',
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql'
  ])
    await db.exec(read('../supabase/migrations/' + name))
  for (const [id, maestros, reportes, campañas] of [
    [USER_A, true, true, [A]],
    [USER_B, true, true, [B]],
    [USER_REPORT, false, true, [A]],
    [USER_BOTH, true, true, [A, B]]
  ]) {
    await db.query(
      'insert into integraciones_api(auth_user_id,nombre,puede_gestionar_maestros,puede_consultar_reportes) values($1,$2,$3,$4)',
      [id, id, maestros, reportes]
    )
    for (const campania of campañas)
      await db.query(
        'insert into integracion_campania(integracion_id,campania_id) select id,$1 from integraciones_api where auth_user_id=$2',
        [campania, id]
      )
  }
  await login(USER_A)
  // Datos existentes provisionados en F6.3, preservados por el baseline F6.4.
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa B','EMPRESA-B')",
    [TENANT_B]
  )
  await db.query(
    "select platform_crear_suscripcion($1,'00000000-0000-4000-8000-000000000063','ACTIVA',statement_timestamp(),null)",
    [TENANT_B]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'EMPRESA-B-C','Empresa B','ACTIVA')",
    [CAMPANIA_TENANT_B, TENANT_B]
  )
  await db.exec(read('../supabase/migrations/202610141000_platform_ciclo_vida.sql'))
  await db.exec(read('../supabase/migrations/202610141100_portal_identity_admin.sql'))
  await db.exec(
    read('../supabase/migrations/202610141200_portal_campaign_workforce.sql')
  )
  await db.exec(read('../supabase/migrations/202610141300_portal_harvest_admin.sql'))
  await db.exec(read('../supabase/migrations/202610141400_portal_reportes.sql'))
  await db.exec(read('../supabase/migrations/202610141500_portal_suscripcion.sql'))
  await db.exec(
    read('../supabase/migrations/202610141600_portal_cutover_administrativo.sql')
  )
  await login(USER_COMERCIAL)
  await db.exec(read('../supabase/migrations/202610141700_farm_structure.sql'))
  const perfil = await call('iam_obtener_identidad')
  const tenant = '00000000-0000-4000-8000-000000000001'
  await db.query(
    `with m as (insert into identity_membresias(usuario_id,tenant_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $2,m.id,r.id from m cross join identity_roles r where r.tenant_id=$2 and r.codigo='ADMIN_EMPRESA'`,
    [perfil.usuario.id, tenant]
  )
  await db.query(
    'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
    [tenant, perfil.usuario.id]
  )
  await login(USER_A)
})

test('Sheets aísla empresas incluso con acceso_global y el mismo DNI', async () => {
  await db.query(
    'update integraciones_api set acceso_global=true where auth_user_id=$1',
    [USER_A]
  )
  await login(USER_A)
  await assert.rejects(
    list('admin_listar_trabajadores', CAMPANIA_TENANT_B),
    /no tiene permiso/
  )
  const user = crypto.randomUUID()
  await db.query(
    "insert into integraciones_api(tenant_id,auth_user_id,nombre,activo,puede_gestionar_maestros,puede_consultar_reportes,acceso_global) values($1,$2,'Empresa B',true,true,true,true)",
    [TENANT_B, user]
  )
  await login(user)
  const otro = await worker(CAMPANIA_TENANT_B, '47480378', 'Deysi de B')
  assert.notEqual(otro.trabajador.id, shared)
  const listado = await list('admin_listar_trabajadores', CAMPANIA_TENANT_B)
  assert.deepEqual(
    listado.trabajadores.map((w) => w.id),
    [otro.trabajador.id]
  )
  await assert.rejects(list('admin_listar_trabajadores', A), /no tiene permiso/)
  await db.query(
    'update integraciones_api set acceso_global=false where auth_user_id=$1',
    [USER_A]
  )
  await login(USER_A)
})
after(() => db.close())

test('la integración solo ve su campaña y no puede usar los RPC globales para saltar el alcance', async () => {
  assert.deepEqual(
    (await list('admin_listar_campanias', A)).campanias.map((c) => c.id),
    [A]
  )
  await assert.rejects(list('admin_listar_campanias', B), /no tiene permiso/)
  await assert.rejects(call('admin_listar_campanias'), /requiere contexto/)
  await assert.rejects(call('admin_listar_trabajadores'), /requiere contexto/)
  await assert.rejects(call('admin_obtener_produccion_lotes'), /requiere contexto/)
  assert.equal(
    (await list('admin_contexto_archivo', A)).campania.cultivo_nombre,
    'Arándanos'
  )
})

test('el archivo modifica su campaña fija y rechaza actualizar o crear otra campaña', async () => {
  const params = (id, codigo) => [
    [A, 'uuid'],
    [id, 'uuid'],
    [codigo, 'varchar'],
    ['Arándanos 2026', 'varchar'],
    ['2026-10-01', 'date'],
    [null, 'date'],
    ['ACTIVA', 'estado_campania']
  ]
  await assert.rejects(
    call('admin_guardar_campania_hoja', params(B, 'MAND-2026')),
    /otra campaña/
  )
  await assert.rejects(
    call('admin_guardar_campania_hoja', params(null, 'NUEVA')),
    /solo administra/
  )
  assert.equal(
    (await call('admin_guardar_campania_hoja', params(A, 'CAMP-ARA-2026'))).campania.id,
    A
  )
})

test('variedades con el mismo nombre pertenecen a cultivos distintos y los maestros se filtran', async () => {
  await login(USER_B)
  VB = (await variety(B, 'Ventura')).variedad.id
  assert.notEqual(VB, VA)
  assert.equal((await variety(B, 'Ventura')).variedad.id, VB)
  assert.deepEqual(
    (await list('admin_listar_variedades', B)).variedades.map((v) => v.id),
    [VB]
  )
  await assert.rejects(variety(B, 'Otra', VA), /no pertenece al cultivo/)
  const lote = await call('admin_guardar_lote_variedades_hoja', [
    [B, 'uuid'],
    [null, 'uuid'],
    ['L1', 'varchar'],
    ['Sur', 'varchar'],
    [B, 'uuid'],
    [[VB], 'uuid[]'],
    [true, 'boolean']
  ])
  LB = lote.lote.id
  assert.deepEqual(
    (await list('admin_listar_lotes', B)).lotes.map((l) => l.id),
    [LB]
  )
  await assert.rejects(
    call('admin_guardar_lote_variedades_hoja', [
      [B, 'uuid'],
      [LB, 'uuid'],
      ['L1', 'varchar'],
      ['Sur', 'varchar'],
      [A, 'uuid'],
      [[VA], 'uuid[]'],
      [true, 'boolean']
    ]),
    /no pertenece/
  )
})

test('los trabajadores recién importados se conservan en su campaña antes de asignar roles', async () => {
  workerB = (await worker(B, '82000002')).trabajador.id
  await login(USER_A)
  workerA = (await worker(A, '82000001')).trabajador.id
  assert.deepEqual(
    (await list('admin_listar_trabajadores', A)).trabajadores.map((t) => t.id).sort(),
    [shared, workerA].sort()
  )
  await login(USER_B)
  assert.deepEqual(
    (await list('admin_listar_trabajadores', B)).trabajadores.map((t) => t.id).sort(),
    [shared, workerB].sort()
  )
  await assert.rejects(
    worker(B, '82000001', 'Ana', 'Pérez', true, workerA),
    /no pertenece/
  )
})

test('el supervisor compartido mantiene su UUID y una cuenta de campaña no desactiva su acceso en la otra', async () => {
  const importar = await worker(B, '47480378', 'Deysi', 'Regalado')
  assert.equal(importar.trabajador.id, shared)
  await assert.rejects(
    worker(B, '47480378', 'Deysi', 'Regalado', false, shared),
    /trabajador es compartido/
  )
  await assert.rejects(
    worker(B, '47480378', 'Otro', 'Regalado', true, shared),
    /trabajador es compartido/
  )
  assert.equal(
    (await db.query('select activo from usuarios_app where trabajador_id=$1', [shared]))
      .rows[0].activo,
    true
  )
})

test('los roles solo se guardan sobre trabajadores y registros de la campaña del archivo', async () => {
  const args = (id, trabajador, campaña) => [
    [B, 'uuid'],
    [id, 'uuid'],
    [trabajador, 'uuid'],
    [campaña, 'uuid'],
    ['COSECHADOR', 'rol_trabajador'],
    [true, 'boolean']
  ]
  roleB = (await call('admin_guardar_rol_campania_hoja', args(null, workerB, B)))
    .rol_campania.id
  await assert.rejects(
    call('admin_guardar_rol_campania_hoja', args(null, workerA, B)),
    /Agregue primero/
  )
  await assert.rejects(
    call('admin_guardar_rol_campania_hoja', args(roleB, workerB, A)),
    /no pertenece/
  )
  assert.ok(
    (await list('admin_listar_roles_campania', B)).roles.every(
      (r) => r.campania_id === B
    )
  )
})

test('retirar el rol del supervisor de una campaña mantiene su acceso en la otra', async () => {
  const rol = (
    await db.query(
      "select id from trabajador_campania_rol where trabajador_id=$1 and campania_id=$2 and rol='SUPERVISORA'",
      [shared, A]
    )
  ).rows[0].id
  await login(USER_A)
  const params = (activo) => [
    [A, 'uuid'],
    [rol, 'uuid'],
    [shared, 'uuid'],
    [A, 'uuid'],
    ['SUPERVISORA', 'rol_trabajador'],
    [activo, 'boolean']
  ]
  await call('admin_guardar_rol_campania_hoja', params(false))
  const operador = await call('validar_operador_campanias', [['47480378', 'varchar']])
  assert.deepEqual(
    operador.campanias.map((c) => c.id),
    [B]
  )
  await call('admin_guardar_rol_campania_hoja', params(true))
  await login(USER_B)
})

test('cada archivo obtiene producción de su campaña y conserva los reportes al cerrarla', async () => {
  const at = crypto.randomUUID(),
    sesion = crypto.randomUUID()
  await db.query(
    'insert into asignaciones_ticket(id,codigo_ticket,campania_id,cosechador_rol_id) values($1,$2,$3,$4)',
    [at, 'MAND-1', B, roleB]
  )
  await db.query(
    'insert into sesiones_lectura(id,lote_id,variedad_id,jabero_rol_id) select $1,$2,$3,id from trabajador_campania_rol where trabajador_id=$4 and campania_id=$5',
    [sesion, LB, VB, shared, B]
  )
  await db.query(
    'insert into lecturas_jaba(id,asignacion_ticket_id,sesion_id,fecha_hora) values($1,$2,$3,now())',
    [crypto.randomUUID(), at, sesion]
  )
  for (const name of [
    'admin_obtener_resumen_campania',
    'admin_obtener_produccion_diaria',
    'admin_obtener_produccion_lotes',
    'admin_obtener_ranking_cosechadores_periodo'
  ]) {
    const params = [[B, 'uuid']]
    if (name.endsWith('periodo')) params.push(['CAMPANIA', 'text'])
    if (!name.endsWith('lotes')) params.push(['America/Lima', 'text'])
    const resultado = await call(name + '_hoja', params)
    assert.equal(resultado.ok, true)
    assert.equal(
      name.endsWith('periodo')
        ? resultado.ranking[0].total_jabas
        : name.includes('resumen')
          ? resultado.resumen.total_jabas
          : resultado.produccion[0].total_jabas,
      1
    )
    await login(USER_A)
    await assert.rejects(call(name + '_hoja', params), /no tiene permiso/)
    await login(USER_B)
  }
  await db.query("update campanias set estado='CERRADA' where id=$1", [B])
  assert.equal(
    (await list('admin_obtener_produccion_lotes', B)).produccion[0].total_jabas,
    1
  )
})

test('lectura y gestión son permisos independientes, la revocación se aplica y no quedan contextos residuales', async () => {
  await login(USER_REPORT)
  assert.equal((await list('admin_obtener_produccion_lotes', A)).ok, true)
  await assert.rejects(list('admin_listar_trabajadores', A), /no tiene permiso/)
  assert.equal((await list('admin_contexto_archivo', A)).ok, true)
  await db.query(
    'update integracion_campania set activo=false where integracion_id=(select id from integraciones_api where auth_user_id=$1)',
    [USER_REPORT]
  )
  await assert.rejects(list('admin_obtener_produccion_lotes', A), /no tiene permiso/)
  const { rows } = await db.query(
    "select nullif(current_setting('scc.campania_id',true),'') campaña, nullif(current_setting('scc.hoja_campania_id',true),'') hoja, has_function_privilege('anon','admin_listar_lotes_hoja(uuid)','EXECUTE') anon, has_function_privilege('authenticated','autorizar_integracion_hoja(uuid,boolean)','EXECUTE') helper"
  )
  assert.deepEqual(rows[0], { campaña: null, hoja: null, anon: false, helper: false })
})

test('una identidad autorizada en ambas campañas puede consultar ambas sin duplicar el supervisor', async () => {
  await login(USER_BOTH)
  for (const campaña of [A, B])
    assert.ok(
      (await list('admin_listar_trabajadores', campaña)).trabajadores.some(
        (t) => t.id === shared
      )
    )
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from trabajadores where dni='47480378' and tenant_id='00000000-0000-4000-8000-000000000001'"
      )
    ).rows[0].n,
    1
  )
})

test('los permisos SQL reales conceden adaptadores a authenticated y rechazan anon', async () => {
  await login(USER_A)
  await db.exec('set role authenticated')
  try {
    assert.deepEqual(
      (await list('admin_listar_campanias', A)).campanias.map((c) => c.id),
      [A]
    )
    await assert.rejects(list('admin_listar_campanias', B), /no tiene permiso/)
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  try {
    await assert.rejects(list('admin_listar_campanias', A), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
})

test('Sheets conserva autorización propia y también exige el módulo, incluso en RPC de roles y maestros', async () => {
  await login(USER_A)
  const tenant = '00000000-0000-4000-8000-000000000001'
  const cambiarModulo = async (modulo, habilitado) => {
    await login(USER_COMERCIAL)
    try {
      await call('platform_solicitar_cambio', [
        [crypto.randomUUID(), 'uuid'],
        [tenant, 'uuid'],
        [habilitado ? 'HABILITAR_MODULO' : 'DESHABILITAR_MODULO', 'text'],
        [habilitado ? { modulo, origen: 'EXCEPCION' } : { modulo }, 'jsonb'],
        ['Cambio comercial de prueba', 'text'],
        [null, 'timestamptz']
      ])
    } finally {
      await login(USER_A)
    }
  }
  for (const [modulo, names] of [
    ['WORKFORCE', ['admin_listar_trabajadores', 'admin_listar_roles_campania']],
    [
      'CAMPAIGN',
      ['admin_listar_campanias', 'admin_listar_lotes', 'admin_listar_variedades']
    ],
    ['HARVEST', ['admin_obtener_produccion_lotes']]
  ]) {
    await cambiarModulo(modulo, false)
    try {
      for (const name of names)
        await assert.rejects(list(name, A), /Módulo no habilitado/)
    } finally {
      await cambiarModulo(modulo, true)
    }
    for (const name of names) assert.ok(await list(name, A))
  }
  assert.deepEqual(
    (
      await db.query(
        "select nullif(current_setting('scc.campania_id',true),'') campania,nullif(current_setting('scc.hoja_campania_id',true),'') hoja"
      )
    ).rows[0],
    { campania: null, hoja: null }
  )
})

const SCC = '00000000-0000-4000-8000-000000000001'
const cutoverId = crypto.randomUUID()
const corte = (campania = A, tenant = SCC, id = cutoverId, revisados = true) =>
  call('platform_cutover_admin_activar', [
    [tenant, 'uuid'],
    [campania, 'uuid'],
    [id, 'uuid'],
    ['Pendientes conciliados; paridad verificada', 'text'],
    [revisados, 'boolean']
  ])
const consultarCorte = (campania = A, tenant = SCC) =>
  call('platform_cutover_admin_consultar', [
    [tenant, 'uuid'],
    [campania, 'uuid']
  ])
let corteA, estadoAntesCorte
test('F7.7 cierra gaps: alta/edición/estado de lote operativo, pertenencia e historial; jornada JABERO semántica', async () => {
  await login(USER_COMERCIAL)
  await db.query("update campanias set estado='ACTIVA' where id=$1", [A])
  const datos = [
    [SCC, 'uuid'],
    [A, 'uuid'],
    [null, 'uuid'],
    ['F77-OP', 'text'],
    ['Operativo portal', 'text'],
    [true, 'boolean'],
    [[VA], 'uuid[]']
  ]
  const lote = await call('campaign_admin_guardar_lote', datos)
  assert.equal(lote.codigo, 'F77-OP')
  assert.deepEqual(lote.variedadIds, [VA])
  datos[2] = [lote.id, 'uuid']
  datos[4] = ['Editado', 'text']
  datos[5] = [false, 'boolean']
  assert.equal((await call('campaign_admin_guardar_lote', datos)).activo, false)
  datos[1] = [B, 'uuid']
  await assert.rejects(call('campaign_admin_guardar_lote', datos), /otra campaña/)
  datos[2] = [null, 'uuid']
  datos[1] = [A, 'uuid']
  datos[6] = [[VB], 'uuid[]']
  await assert.rejects(
    call('campaign_admin_guardar_lote', datos),
    /otra empresa\/cultivo/
  )
  const workerId = (
    await db.query(
      "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'71717777','Jornada','Portal',true) returning id",
      [SCC]
    )
  ).rows[0].id
  const jornada = (activo, camp = A, tenant = SCC) =>
    call('workforce_admin_jornada_jabero', [
      [tenant, 'uuid'],
      [workerId, 'uuid'],
      [camp, 'uuid'],
      [activo, 'boolean']
    ])
  let r = await jornada(true)
  const id = r.find((p) => p.rol === 'JABERO').id
  assert.equal(
    r.find((p) => p.rol === 'JABERO').fechaJabero,
    (
      await db.query(
        "select (clock_timestamp() at time zone 'America/Lima')::date::text f"
      )
    ).rows[0].f
  )
  r = await jornada(false)
  assert.equal(r.find((p) => p.rol === 'JABERO').activo, false)
  r = await jornada(true)
  assert.equal(r.find((p) => p.rol === 'JABERO').id, id)
  await assert.rejects(jornada(true, CAMPANIA_TENANT_B), /otra empresa/)
})
test('F7.7 campaña sin migrar admite escrituras Sheets; cutover requiere revisión, permisos y contexto autorizado', async () => {
  await login(USER_A)
  assert.equal((await worker(A, '71710001', 'Antes', 'Corte')).ok, true)
  await assert.rejects(corte(), /Sesión|Empresa no autorizada|membresía/)
  await login(USER_COMERCIAL)
  assert.equal((await consultarCorte()).autoridad, 'TRANSICION_SHEETS')
  await assert.rejects(corte(A, SCC, cutoverId, false), /revisión/)
  await assert.rejects(corte(CAMPANIA_TENANT_B), /otra empresa/)
  estadoAntesCorte = (
    await db.query(
      `select jsonb_build_object('trabajadores',(select count(*) from trabajadores),'roles',(select count(*) from trabajador_campania_rol),
    'lecturas',(select count(*) from lecturas_jaba),'tickets',(select count(*) from asignaciones_ticket),
    'recibos',(select count(*) from operaciones_pda_procesadas),'comercial',platform_estado_comercial($1)) r`,
      [SCC]
    )
  ).rows[0].r
  corteA = await corte()
  assert.equal(corteA.autoridad, 'PORTAL')
  assert.equal(corteA.corte.operacion_id, cutoverId)
})
test('F7.7 Sheets rechaza todos los maestros migrados, conserva lectura e integraciones por campaña', async () => {
  await login(USER_A)
  await db.exec('set role authenticated')
  try {
    await assert.rejects(worker(A, '71710002'), /migrada al Portal/)
    await assert.rejects(variety(A, 'Después de corte'), /migrada al Portal/)
    await assert.rejects(
      call('admin_guardar_campania_hoja', [
        [A, 'uuid'],
        [A, 'uuid'],
        ['SCC-2026', 'varchar'],
        ['Mutar', 'varchar'],
        ['2026-01-01', 'date'],
        [null, 'date'],
        ['ACTIVA', 'estado_campania']
      ]),
      /migrada al Portal/
    )
    await assert.rejects(
      call('admin_guardar_lote_variedades_hoja', [
        [A, 'uuid'],
        [null, 'uuid'],
        ['INVADIR', 'varchar'],
        ['No', 'varchar'],
        [A, 'uuid'],
        [[VA], 'uuid[]'],
        [true, 'boolean']
      ]),
      /migrada al Portal/
    )
    await assert.rejects(
      call('admin_guardar_rol_campania_hoja', [
        [A, 'uuid'],
        [null, 'uuid'],
        [shared, 'uuid'],
        [A, 'uuid'],
        ['SUPERVISORA', 'rol_trabajador'],
        [true, 'boolean']
      ]),
      /migrada al Portal/
    )
    assert.ok((await list('admin_listar_trabajadores', A)).trabajadores.length)
    assert.equal((await list('admin_obtener_produccion_lotes', A)).ok, true)
  } finally {
    await db.exec('reset role')
  }
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from integracion_campania where campania_id=$1 and escritura_habilitada',
        [A]
      )
    ).rows[0].n,
    0
  )
  await login(USER_B)
  assert.equal((await worker(B, '71710003', 'Otra', 'Campaña')).ok, true)
  assert.equal(
    (
      await db.query(
        'select bool_and(escritura_habilitada) v from integracion_campania where campania_id=$1',
        [B]
      )
    ).rows[0].v,
    true
  )
})
test('F7.7 credencial global antigua, flags reactivados y contexto falso no saltan protección de filas compartidas', async () => {
  await login(USER_BOTH)
  await db.query(
    'update integraciones_api set acceso_global=true where auth_user_id=$1',
    [USER_BOTH]
  )
  await db.query(
    'update integracion_campania set escritura_habilitada=true where campania_id=$1 and integracion_id=(select id from integraciones_api where auth_user_id=$2)',
    [A, USER_BOTH]
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from integracion_campania where campania_id=$1 and escritura_habilitada',
        [A]
      )
    ).rows[0].n,
    0
  )
  await assert.rejects(worker(A, '71710004'), /migrada al Portal/)
  await assert.rejects(
    call('admin_guardar_campania', [
      [A, 'uuid'],
      ['MUTAR', 'varchar'],
      ['Mutar', 'varchar'],
      ['2026-01-01', 'date'],
      [null, 'date'],
      ['ACTIVA', 'estado_campania']
    ]),
    /migrada al Portal/
  )
  await db.query("select set_config('scc.hoja_campania_id',$1,false)", [B])
  try {
    await assert.rejects(
      call('admin_guardar_trabajador', [
        [shared, 'uuid'],
        ['47480378', 'varchar'],
        ['Cambio indirecto', 'varchar'],
        ['No', 'varchar'],
        [true, 'boolean']
      ]),
      /migrada al Portal/
    )
    await assert.rejects(
      call('admin_guardar_variedad', [
        [VA, 'uuid'],
        ['Cambio indirecto', 'varchar'],
        [true, 'boolean']
      ]),
      /migrada al Portal/
    )
  } finally {
    await db.query("select set_config('scc.hoja_campania_id','',false)")
  }
  // Aun si una identidad técnica recibiera por error una membresía de gestión,
  // llamar los endpoints Portal no vuelve a darle autoridad sobre el corte.
  const u = (await call('iam_obtener_identidad')).usuario.id
  await db.query(
    `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA'`,
    [SCC, u]
  )
  await assert.rejects(
    call('campaign_admin_cerrar', [
      [SCC, 'uuid'],
      [A, 'uuid']
    ]),
    /migrada al Portal/
  )
  await assert.rejects(corte(B, SCC, crypto.randomUUID()), /integración técnica/)
})
test('F7.7 Portal escribe tras el corte y los UUID de otro Tenant se rechazan; PWA conserva jornada/acceso', async () => {
  await login(USER_COMERCIAL)
  const a = await call('campaign_admin_obtener', [
    [SCC, 'uuid'],
    [A, 'uuid']
  ])
  const r = await call('campaign_admin_editar', [
    [SCC, 'uuid'],
    [A, 'uuid'],
    [a.codigo, 'text'],
    ['Administración Portal', 'text'],
    [a.cultivoId, 'uuid'],
    [a.fechaInicio, 'date'],
    [a.fechaFin, 'date']
  ])
  assert.equal(r.nombre, 'Administración Portal')
  await assert.rejects(consultarCorte(A, TENANT_B), /Empresa|membresía/)
  await login(USER_B)
  await assert.rejects(worker(CAMPANIA_TENANT_B, '71710005'), /otra empresa/)
  const tecnicoB = (
    await db.query(
      'select auth_user_id from integraciones_api where tenant_id=$1 limit 1',
      [TENANT_B]
    )
  ).rows[0].auth_user_id
  await login(tecnicoB)
  assert.equal(
    (await worker(CAMPANIA_TENANT_B, '71710006', 'Sigue', 'En su empresa')).ok,
    true
  )
  await login(USER_COMERCIAL)
  await call('workforce_admin_asignar_rol', [
    [SCC, 'uuid'],
    [shared, 'uuid'],
    [A, 'uuid'],
    ['SUPERVISORA', 'rol_trabajador']
  ])
  await login('')
  assert.ok(
    (
      await call('validar_operador_campanias', [['47480378', 'varchar']])
    ).campanias.some((c) => c.id === A)
  )
  const op = crypto.randomUUID(),
    args = [
      [A, 'uuid'],
      ['47480378', 'varchar'],
      ['71717777', 'varchar'],
      [op, 'uuid']
    ]
  const pwa = await call('registrar_jabero_campania', args)
  assert.equal(pwa.ok, true)
  assert.deepEqual(await call('registrar_jabero_campania', args), pwa)
})
test('F7.7 histórico/recibos/auditoría conservados; cutover idempotente, inmutable y sin activaciones por migración', async () => {
  await login(USER_COMERCIAL)
  assert.deepEqual(await corte(), corteA)
  await assert.rejects(corte(A, SCC, crypto.randomUUID()), /Cutover existente/)
  const ahora = (
    await db.query(
      `select jsonb_build_object('trabajadores',(select count(*) from trabajadores),'roles',(select count(*) from trabajador_campania_rol),
    'lecturas',(select count(*) from lecturas_jaba),'tickets',(select count(*) from asignaciones_ticket),
    'recibos',(select count(*) from operaciones_pda_procesadas),'comercial',platform_estado_comercial($1)) r`,
      [SCC]
    )
  ).rows[0].r
  assert.equal(ahora.lecturas, estadoAntesCorte.lecturas)
  assert.equal(ahora.tickets, estadoAntesCorte.tickets)
  assert.equal(ahora.recibos, estadoAntesCorte.recibos + 1)
  assert.deepEqual(ahora.comercial, estadoAntesCorte.comercial)
  await assert.rejects(
    db.query('delete from platform_cutovers_administrativos'),
    /inmutable/
  )
  await assert.rejects(
    db.query("update platform_cutovers_administrativos set motivo='oculto'"),
    /inmutable/
  )
  await assert.rejects(
    db.query('truncate platform_cutovers_administrativos'),
    /inmutable/
  )
  await db.exec(
    read('../supabase/migrations/202610141600_portal_cutover_administrativo.sql')
  )
  assert.deepEqual(await consultarCorte(), corteA)
  assert.equal((await consultarCorte(B)).autoridad, 'TRANSICION_SHEETS')
  await db.exec('set role authenticated')
  try {
    await assert.rejects(
      db.query('select * from platform_cutovers_administrativos'),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
})
