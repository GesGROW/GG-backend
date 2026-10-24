import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, OP, COSECHADOR } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'
import { crearGenerarLotesDeTickets } from '@gesgrow/core/contexts/harvest/index.js'
const db = new PGlite(),
  T2 = crypto.randomUUID(),
  C2 = crypto.randomUUID(),
  cuentas = {},
  M = '202610141300_portal_harvest_admin.sql'
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
const generar = (
  tenant = T1,
  camp = A,
  cantidad = 43,
  tamanio = 10,
  id = crypto.randomUUID()
) =>
  call(
    'harvest_admin_generar',
    ['uuid', 'uuid', 'uuid', 'integer', 'integer'],
    [tenant, camp, id, cantidad, tamanio]
  )
const listar = (
  tipo,
  tenant = T1,
  camp = null,
  q = '',
  lote = null,
  trabajador = null,
  estado = '',
  offset = 0
) =>
  call(
    'harvest_admin_listar',
    ['uuid', 'text', 'uuid', 'text', 'uuid', 'uuid', 'text', 'integer'],
    [tenant, tipo, camp, q, lote, trabajador, estado, offset]
  )
const obtener = (tipo, clave, tenant = T1) =>
  call('harvest_admin_obtener', ['uuid', 'text', 'text'], [tenant, tipo, clave])
let generacion, gB, codigo, codigoDisponible, asignacion, registro, sesion
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
    '202610141200_portal_campaign_workforce.sql',
    M,
    '202610141400_portal_reportes.sql',
    '202610141500_portal_suscripcion.sql',
    '202610221100_harvest_listados_lotes.sql'
  ])
    await db.exec(read(n))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa B','F74-B')",
    [T2]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'F74-B','Campaña B','ACTIVA')",
    [C2, T2]
  )
  for (const n of ['admin', 'view', 'campo']) {
    cuentas[n] = { sujeto: crypto.randomUUID() }
    await login(n)
    cuentas[n].id = (await call('iam_obtener_identidad')).usuario.id
    for (const t of n === 'admin' ? [T1, T2] : [T1])
      await db.query(
        `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r
      where r.tenant_id=$1 and r.codigo=$3`,
        [
          t,
          cuentas[n].id,
          n === 'admin' ? 'ADMIN_EMPRESA' : n === 'view' ? 'CONSULTA' : 'OPERADOR_CAMPO'
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
      'Piloto prueba'
    ]
  )
  sesion = (
    await db.query(
      'select s.id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1 limit 1',
      [A]
    )
  ).rows[0].id
})
after(() => db.close())
test('generación servidor normal e incompleta, unicidad global y recibo idempotente con actor', async () => {
  generacion = await generar()
  assert.deepEqual(
    generacion.lotes.map((l) => l.cantidadTickets),
    [10, 10, 10, 10, 3]
  )
  let secuencia = 0
  const referencia = await crearGenerarLotesDeTickets({
    generarIdLote: () => String(++secuencia),
    generadorCodigoTicket: { generar: ({ indice }) => 'REF-' + indice },
    repositorioTickets: { guardarLotesConTickets: async () => {} }
  })({ campaniaId: A, cantidadTickets: 43, tamanioLote: 10 })
  assert.deepEqual(
    generacion.lotes.map((l) => l.cantidadTickets),
    referencia.lotes.map(
      (l) => referencia.tickets.filter((t) => t.loteId === l.id).length
    )
  )
  assert.equal(generacion.actorUsuarioId, cuentas.admin.id)
  assert.deepEqual(await generar(T1, A, 43, 10, generacion.operacionId), generacion)
  await assert.rejects(generar(T1, A, 44, 10, generacion.operacionId), /reutilizado/)
  assert.equal(
    (
      await db.query(
        'select count(*)::int n,count(distinct codigo)::int u from harvest_tickets'
      )
    ).rows[0].n,
    43
  )
  assert.equal(
    (await db.query('select count(distinct codigo)::int u from harvest_tickets'))
      .rows[0].u,
    43
  )
  const normal = await generar(T1, A, 20, 10)
  assert.deepEqual(
    normal.lotes.map((l) => l.cantidadTickets),
    [10, 10]
  )
  const uno = await generar(T1, A, 3, 8)
  assert.deepEqual(
    uno.lotes.map((l) => l.cantidadTickets),
    [3]
  )
  await assert.rejects(generar(T1, A, 0, 10), /cantidades/)
  await assert.rejects(generar(T1, null, 1, 1), /ID y cantidades/)
  assert.equal(
    (await call('harvest_admin_campanias', ['uuid'], [T1])).find((c) => c.id === A)
      .cutover,
    null
  )
})
test('fallo después del primer lote revierte tickets, lotes y recibo de toda la generación', async () => {
  const antes = (await db.query('select count(*)::int n from harvest_lotes_tickets'))
      .rows[0].n,
    id = crypto.randomUUID()
  await db.exec(`create function public.f74_fallo_prueba() returns trigger language plpgsql as $$ begin
    if (select count(*) from public.harvest_lotes_tickets)>${antes} then raise exception 'Fallo de prueba'; end if; return new; end $$;
    create trigger f74_fallo before insert on harvest_lotes_tickets for each row execute function f74_fallo_prueba();`)
  await assert.rejects(generar(T1, A, 20, 10, id), /Fallo de prueba/)
  assert.equal(
    (await db.query('select count(*)::int n from harvest_lotes_tickets')).rows[0].n,
    antes
  )
  assert.equal(
    (
      await db.query('select count(*)::int n from harvest_generaciones where id=$1', [
        id
      ])
    ).rows[0].n,
    0
  )
  await db.exec(
    'drop trigger f74_fallo on harvest_lotes_tickets; drop function f74_fallo_prueba();'
  )
})
test('consulta lotes con progreso derivado y búsqueda de ticket disponible', async () => {
  const lote = generacion.lotes[0]
  assert.equal((await listar('lotes', T1, A, '', lote.id)).filas[0].cantidadTickets, 10)
  codigo = (
    await db.query(
      'select codigo from harvest_tickets where lote_id=$1 order by codigo limit 1',
      [lote.id]
    )
  ).rows[0].codigo
  codigoDisponible = (
    await db.query(
      'select codigo from harvest_tickets where lote_id=$1 and codigo<>$2 limit 1',
      [lote.id, codigo]
    )
  ).rows[0].codigo
  const t = await obtener('tickets', codigo)
  assert.equal(t.estado, 'DISPONIBLE')
  assert.equal(t.lote.id, lote.id)
  assert.equal(t.registro, null)
  assert.equal((await listar('tickets', T1, A, codigo)).total, 1)
  assert.equal(
    (await listar('tickets', T1, A, '', lote.id, null, 'DISPONIBLE')).total,
    10
  )
})
test('la PWA asigna y Portal consulta Ticket → lote → trabajador; reasignación arbitraria rechazada por F5', async () => {
  await login(null)
  asignacion = await call(
    'harvest_asignar_lote_tickets',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [A, OP, COSECHADOR, codigo, crypto.randomUUID()]
  )
  await assert.rejects(
    call(
      'harvest_asignar_lote_tickets',
      ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
      [A, OP, '87659999', codigo, crypto.randomUUID()]
    ),
    /harvest_lote_ya_asignado/
  )
  await login('view')
  const t = await obtener('tickets', codigo)
  assert.equal(t.lote.asignacion.trabajador.dni, COSECHADOR)
  assert.equal((await listar('asignaciones', T1, A)).total, 1)
  const fila = (await listar('asignaciones', T1, A)).filas[0]
  const reciboFecha = (
    await db.query('select creado_en from operaciones_pda_procesadas where id=$1', [
      fila.operacionId
    ])
  ).rows[0].creado_en
  assert.equal(Date.parse(fila.asignadoEn), new Date(reciboFecha).getTime())
  const indiceFecha = (
    await db.query(
      "select fecha from public.harvest_admin_indice($1::uuid,'asignaciones') where clave=$2",
      [T1, fila.id]
    )
  ).rows[0].fecha
  assert.equal(new Date(indiceFecha).getTime(), new Date(reciboFecha).getTime())
  assert.equal((await obtener('asignaciones', fila.id)).asignadoEn, fila.asignadoEn)
  const dtoAntes = await db.query(
    "select pg_get_functiondef('public.harvest_admin_dto(uuid,text,text)'::regprocedure) as def"
  )
  await db.exec(read('202610221100_harvest_listados_lotes.sql'))
  assert.equal(
    (
      await db.query(
        "select pg_get_functiondef('public.harvest_admin_dto(uuid,text,text)'::regprocedure) as def"
      )
    ).rows[0].def,
    dtoAntes.rows[0].def
  )
  assert.equal(
    (await listar('tickets', T1, A, '', null, t.lote.asignacion.trabajador.id)).total,
    10
  )
  assert.equal(
    (await call('harvest_admin_filtros', ['uuid', 'uuid'], [T1, A])).trabajadores[0]
      .dni,
    COSECHADOR
  )
})
test('cutover F5.6 sigue siendo autoridad; consumo de campo y RegistroCosecha de sólo consulta', async () => {
  await login(null)
  const registrar = () =>
    call(
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
  await assert.rejects(registrar(), /harvest_campania_sin_cutover/)
  await login('admin')
  await call('iam_activar_harvest', ['uuid'], [A])
  await login(null)
  await registrar()
  await assert.rejects(registrar(), /harvest_ticket_ya_utilizado/)
  await login('view')
  const t = await obtener('tickets', codigo)
  registro = t.registro
  assert.equal(t.estado, 'UTILIZADO')
  assert.equal(registro.versionProduccion, 1)
  assert.equal(registro.trabajador.dni, COSECHADOR)
  assert.equal((await obtener('tickets', codigoDisponible)).estado, 'DISPONIBLE')
  assert.equal((await obtener('lotes', t.lote.id)).utilizados, 1)
  assert.deepEqual(await obtener('registros', registro.id), registro)
  assert.equal((await listar('registros', T1, A, codigo)).total, 1)
  await assert.rejects(
    db.query(
      'update harvest_registros_cosecha set trabajador_id=gen_random_uuid() where id=$1',
      [registro.id]
    ),
    /inmutable/
  )
})
test('harvest.view/operate no conceden harvest.manage; generación exige permiso efectivo', async () => {
  for (const n of ['view', 'campo']) {
    await login(n)
    assert.ok(await listar('lotes'))
    await assert.rejects(generar(), /Permiso/)
  }
  await login('admin')
  assert.ok(
    (await call('iam_permisos_efectivos', ['uuid'], [T1])).includes('harvest.manage')
  )
})
test('permiso efectivo de gestión autoriza con cualquier nombre de rol y no concede operar en campo', async () => {
  cuentas.gestion = { sujeto: crypto.randomUUID() }
  await login('gestion')
  cuentas.gestion.id = (await call('iam_obtener_identidad')).usuario.id
  const rol = (
    await db.query(
      "insert into identity_roles(tenant_id,codigo) values($1,'PRUEBA_PERMISO_EFECTIVO') returning id",
      [T1]
    )
  ).rows[0].id
  await db.query(
    "insert into identity_rol_permisos(tenant_id,rol_id,permiso) values($1,$2,'harvest.manage')",
    [T1, rol]
  )
  const m = (
    await db.query(
      'insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id',
      [T1, cuentas.gestion.id]
    )
  ).rows[0].id
  await db.query(
    'insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) values($1,$2,$3)',
    [T1, m, rol]
  )
  assert.equal((await generar(T1, A, 1, 1)).cantidadTickets, 1)
  assert.ok(await obtener('tickets', codigo))
  await assert.rejects(
    call(
      'iam_asignar_lote',
      ['uuid', 'uuid', 'text', 'uuid'],
      [A, registro.trabajador.id, codigoDisponible, crypto.randomUUID()]
    ),
    /Permiso/
  )
  await login('admin')
})
test('cross-tenant: campaña, lotes, tickets, trabajador y recibos se contrastan en servidor', async () => {
  gB = await generar(T2, C2, 2, 1)
  const codeB = (
    await db.query('select codigo from harvest_tickets where lote_id=$1', [
      gB.lotes[0].id
    ])
  ).rows[0].codigo
  await assert.rejects(generar(T1, C2), /otra empresa/)
  await assert.rejects(obtener('tickets', codeB), /otra empresa/)
  await assert.rejects(obtener('lotes', gB.lotes[0].id), /otra empresa/)
  await assert.rejects(
    listar('tickets', T1, null, '', gB.lotes[0].id),
    /otra campaña o empresa/
  )
  await assert.rejects(listar('lotes', T1, C2), /otra empresa/)
  await assert.rejects(generar(T2, C2, 43, 10, generacion.operacionId), /reutilizado/)
  assert.equal(
    (await listar('tickets', T1)).filas.some((t) => t.codigo === codeB),
    false
  )
  const workerB = (
    await db.query(
      "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'77779999','Ajeno','B',true) returning id",
      [T2]
    )
  ).rows[0].id
  await assert.rejects(listar('tickets', T1, null, '', null, workerB), /otra empresa/)
})
test('HARVEST deshabilitado bloquea todas las nuevas consultas y generación con permisos presentes', async () => {
  await call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text'],
    [
      crypto.randomUUID(),
      T2,
      'DESHABILITAR_MODULO',
      { modulo: 'HARVEST' },
      'Prueba bloqueo'
    ]
  )
  await assert.rejects(generar(T2, C2), /Módulo no habilitado/)
  await assert.rejects(listar('tickets', T2), /Módulo no habilitado/)
  await assert.rejects(obtener('lotes', gB.lotes[0].id, T2), /Módulo no habilitado/)
  await call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text'],
    [
      crypto.randomUUID(),
      T2,
      'HABILITAR_MODULO',
      { modulo: 'HARVEST' },
      'Restaurar prueba'
    ]
  )
})
test('ACL/RLS no exponen mutaciones de hechos ni recibos; reejecución preserva generación y SCC', async () => {
  await db.exec('set role authenticated')
  try {
    assert.ok(await listar('registros'))
    await assert.rejects(
      call('harvest_admin_dto', ['uuid', 'text', 'text'], [T1, 'tickets', codigo]),
      /permission denied/
    )
    await assert.rejects(
      db.query('update harvest_asignaciones_lote set trabajador_id=gen_random_uuid()'),
      /permission denied/
    )
    await assert.rejects(
      db.query('delete from harvest_registros_cosecha'),
      /permission denied/
    )
    await assert.rejects(
      db.query('select * from harvest_generaciones'),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  await assert.rejects(
    db.query('update harvest_generaciones set cantidad_tickets=1 where id=$1', [
      generacion.operacionId
    ]),
    /inmutable/
  )
  const antes = await call('platform_estado_comercial', ['uuid'], [T1])
  await db.exec(read(M))
  assert.deepEqual(await call('platform_estado_comercial', ['uuid'], [T1]), antes)
  assert.deepEqual(await generar(T1, A, 43, 10, generacion.operacionId), generacion)
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role','harvest_admin_generar(uuid,uuid,uuid,integer,integer)','execute') p"
      )
    ).rows[0].p,
    false
  )
})
