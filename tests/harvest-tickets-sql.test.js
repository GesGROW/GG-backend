import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, beforeEach, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import {
  CatalogoDeTickets,
  ErrorPersistenciaTickets,
  LoteYaAsignado,
  TicketDuplicado,
  TicketNoEncontrado,
  TicketYaUtilizado
} from '@gesgrow/core/contexts/harvest/index.js'
import { crearTicketsHarvest } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/crearTicketsHarvest.js'

const read = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const db = new PGlite()
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_A = '10000000-0000-4000-8000-000000000001'
const USER_BOTH = '10000000-0000-4000-8000-000000000002'
const WORKER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const login = (id) =>
  db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
const crear = (campania, lotes) =>
  db.query('select public.harvest_crear_lotes_tickets($1::uuid,$2::jsonb)', [
    campania,
    JSON.stringify(lotes)
  ])
const resolver = async (campania, codigo) =>
  (
    await db.query(
      'select public.harvest_resolver_ticket($1::uuid,$2::text) resultado',
      [campania, codigo]
    )
  ).rows[0].resultado
const conteos = async () =>
  (
    await db.query(`select
  (select count(*)::int from harvest_lotes_tickets) lotes,
  (select count(*)::int from harvest_tickets) tickets`)
  ).rows[0]

// Transporte RPC local sobre SQL real; conserva nombres y argumentos del adapter.
// No simula el guardado ni sus constraints/transacciones.
const llamadas = []
const supabase = {
  async rpc(nombre, parametros) {
    llamadas.push([nombre, parametros])
    try {
      if (nombre === 'harvest_crear_lotes_tickets') {
        await crear(parametros.p_campania_id, parametros.p_lotes)
        return { data: null, error: null }
      }
      assert.equal(nombre, 'harvest_resolver_ticket')
      return {
        data: await resolver(parametros.p_campania_id, parametros.p_codigo),
        error: null
      }
    } catch (error) {
      return {
        data: null,
        error: { code: error.code, message: error.message, details: error.detail }
      }
    }
  }
}
function servicios(prefijo) {
  return crearTicketsHarvest({
    supabase,
    generadorCodigoTicket: { generar: ({ indice }) => `${prefijo}-${indice}` }
  })
}

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  await db.exec(`create schema auth;
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table integraciones_api(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique,
      activo boolean default true,acceso_global boolean default false,
      puede_gestionar_maestros boolean default false,puede_consultar_reportes boolean default false);
    create table integracion_campania(integracion_id uuid references integraciones_api(id),
      campania_id uuid references campanias(id),activo boolean default true,primary key(integracion_id,campania_id));`)
  // Usa las funciones de autorización reales vigentes, sin cambiar Sheets.
  const autorizacion = read(
    '../supabase/migrations/202610110500_sheets_por_campania.sql'
  )
  await db.exec(
    autorizacion.slice(
      autorizacion.indexOf('create function public.integracion_puede_campania'),
      autorizacion.indexOf('-- Los RPC antiguos')
    )
  )
  await db.query(
    "insert into campanias(id,codigo,nombre,estado) values($1,'B','Campaña B','ACTIVA')",
    [B]
  )
  for (const [usuario, campanias] of [
    [USER_A, [A]],
    [USER_BOTH, [A, B]]
  ]) {
    await db.query(
      'insert into integraciones_api(auth_user_id,puede_gestionar_maestros) values($1,true)',
      [usuario]
    )
    for (const campania of campanias)
      await db.query(
        'insert into integracion_campania(integracion_id,campania_id) select id,$1 from integraciones_api where auth_user_id=$2',
        [campania, usuario]
      )
  }
  await db.exec(read('../supabase/migrations/202610140100_harvest_tickets.sql'))
})
beforeEach(async () => {
  await login(USER_BOTH)
  llamadas.length = 0
})
after(() => db.close())

test('caso + adapter + SQL: 40 tickets en 4 lotes se confirman juntos y se reconstruyen', async () => {
  const api = servicios('CUENTA')
  const resultado = await api.generarLotesDeTickets({
    campaniaId: A,
    cantidadTickets: 40,
    tamanioLote: 10
  })
  assert.equal(resultado.lotes.length, 4)
  assert.equal(resultado.tickets.length, 40)
  assert.equal(llamadas.length, 1)
  const filas = (
    await db.query(
      'select lote_id,count(*)::int n from harvest_tickets where codigo like $1 group by lote_id',
      ['CUENTA-%']
    )
  ).rows
  assert.equal(filas.length, 4)
  assert.ok(filas.every((fila) => fila.n === 10))
  const catalogo = await api.resolverCatalogoDeTickets({
    campaniaId: A,
    codigoTicket: 'CUENTA-39'
  })
  assert.ok(catalogo instanceof CatalogoDeTickets)
  assert.equal(catalogo.identificarLote('CUENTA-39').id, resultado.lotes[3].id)
  assert.equal(catalogo.obtenerTicket('CUENTA-39').estado, 'DISPONIBLE')
  // La consulta no trae otros tickets: el catálogo se construye con el resultado puntual.
  assert.throws(() => catalogo.obtenerTicket('CUENTA-38'), TicketNoEncontrado)
  assert.equal(llamadas.length, 2)
})

test('SQL persiste tamaño configurable y lote final incompleto', async () => {
  const api = servicios('FINAL')
  const resultado = await api.generarLotesDeTickets({
    campaniaId: B,
    cantidadTickets: 11,
    tamanioLote: 4
  })
  const tamanios = []
  for (const lote of resultado.lotes)
    tamanios.push(
      (
        await db.query('select count(*)::int n from harvest_tickets where lote_id=$1', [
          lote.id
        ])
      ).rows[0].n
    )
  assert.deepEqual(tamanios, [4, 4, 3])
  assert.ok(resultado.lotes.every((lote) => lote.campaniaId === B))
})

test('un ticket inválido tardío revierte todos los tickets y lotes de la solicitud', async () => {
  const antes = await conteos()
  for (const invalido of ['', ' ESPACIOS ', '\tTICKET\t', '\nTICKET\n', null, 123]) {
    await assert.rejects(
      crear(A, [
        { id: crypto.randomUUID(), tickets: ['ROLLBACK-PRIMERO', 'ROLLBACK-SEGUNDO'] },
        { id: crypto.randomUUID(), tickets: ['ROLLBACK-TERCERO', invalido] }
      ])
    )
    assert.deepEqual(await conteos(), antes)
    assert.equal(await resolver(A, 'ROLLBACK-PRIMERO'), null)
  }
})

test('un código repetido dentro de un lote o entre lotes revierte la creación completa', async () => {
  const antes = await conteos()
  for (const lotes of [
    [{ id: crypto.randomUUID(), tickets: ['DUP-INTERNO', 'DUP-INTERNO'] }],
    [
      { id: crypto.randomUUID(), tickets: ['DUP-INTERNO'] },
      { id: crypto.randomUUID(), tickets: ['DUP-INTERNO'] }
    ]
  ]) {
    await assert.rejects(
      crear(A, lotes),
      (error) => error.code === '23505' && error.detail === 'DUP-INTERNO'
    )
    assert.deepEqual(await conteos(), antes)
  }
})

test('solicitudes concurrentes con los mismos códigos: una confirma y otra revierte por constraint', async () => {
  const antes = await conteos()
  const opciones = { campaniaId: A, cantidadTickets: 2, tamanioLote: 2 }
  // Dos aplicaciones generan independientemente antes de intentar guardar.
  const resultados = await Promise.allSettled([
    servicios('CARRERA').generarLotesDeTickets(opciones),
    servicios('CARRERA').generarLotesDeTickets(opciones)
  ])
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1)
  const rechazado = resultados.find((r) => r.status === 'rejected')
  assert.ok(rechazado.reason instanceof TicketDuplicado)
  assert.equal(rechazado.reason.codigoTicket, 'CARRERA-0')
  assert.deepEqual(await conteos(), {
    lotes: antes.lotes + 1,
    tickets: antes.tickets + 2
  })
  assert.equal(
    llamadas.filter(([nombre]) => nombre === 'harvest_crear_lotes_tickets').length,
    2
  )
})

test('el código es único globalmente en PostgreSQL, también entre campañas y sin comprobación JS', async () => {
  await servicios('GLOBAL').generarLotesDeTickets({
    campaniaId: A,
    cantidadTickets: 1,
    tamanioLote: 1
  })
  const antes = await conteos()
  await assert.rejects(
    servicios('GLOBAL').generarLotesDeTickets({
      campaniaId: B,
      cantidadTickets: 1,
      tamanioLote: 1
    }),
    TicketDuplicado
  )
  assert.deepEqual(await conteos(), antes)
  const original = await resolver(A, 'GLOBAL-0')
  await assert.rejects(
    db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
      ['GLOBAL-0', original.lote.id, A]
    ),
    (error) => error.code === '23505'
  )
  assert.equal(await resolver(B, 'GLOBAL-0'), null)
})

test('la FK compuesta impide asociar un ticket a un lote de otra campaña', async () => {
  await servicios('FK-PROPIO').generarLotesDeTickets({
    campaniaId: A,
    cantidadTickets: 1,
    tamanioLote: 1
  })
  const original = await resolver(A, 'FK-PROPIO-0')
  await assert.rejects(
    db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
      ['CRUZADO', original.lote.id, B]
    ),
    (error) => error.code === '23503'
  )
  assert.equal(await resolver(B, 'CRUZADO'), null)
})

test('la autorización y las consultas se aíslan por campaña sin filtrar tickets ajenos', async () => {
  await servicios('ALCANCE').generarLotesDeTickets({
    campaniaId: B,
    cantidadTickets: 1,
    tamanioLote: 1
  })
  const antes = await conteos()
  const api = servicios('PERMISOS')
  await login(USER_A)
  await assert.rejects(
    api.generarLotesDeTickets({ campaniaId: B, cantidadTickets: 2, tamanioLote: 1 }),
    ErrorPersistenciaTickets
  )
  await assert.rejects(
    api.resolverCatalogoDeTickets({ campaniaId: B, codigoTicket: 'ALCANCE-0' }),
    ErrorPersistenciaTickets
  )
  await assert.rejects(
    api.resolverCatalogoDeTickets({ campaniaId: A, codigoTicket: 'ALCANCE-0' }),
    TicketNoEncontrado
  )
  assert.deepEqual(await conteos(), antes)
  await login(null)
  await assert.rejects(
    crear(A, [{ id: crypto.randomUUID(), tickets: ['SIN-IDENTIDAD'] }]),
    /no tiene permiso/
  )
})

test('RLS y grants impiden SQL directo y RPC anónimo, pero permiten el RPC autorizado', async () => {
  await servicios('RLS').generarLotesDeTickets({
    campaniaId: A,
    cantidadTickets: 1,
    tamanioLote: 1
  })
  for (const tabla of [
    'harvest_lotes_tickets',
    'harvest_tickets',
    'harvest_asignaciones_lote',
    'harvest_registros_cosecha'
  ]) {
    assert.equal(
      (
        await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [
          tabla
        ])
      ).rows[0].relrowsecurity,
      true
    )
  }
  await db.exec('set role authenticated')
  try {
    await assert.rejects(db.query('select * from harvest_tickets'), /permission denied/)
    await assert.rejects(
      db.query(
        'insert into harvest_lotes_tickets(id,campania_id) values(gen_random_uuid(),$1)',
        [A]
      ),
      /permission denied/
    )
    assert.ok(await resolver(A, 'RLS-0'))
    await crear(A, [{ id: crypto.randomUUID(), tickets: ['RPC-AUTORIZADO'] }])
  } finally {
    await db.exec('reset role')
  }
  await db.exec('set role anon')
  try {
    await assert.rejects(resolver(A, 'RLS-0'), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
})

test('reconstituye estados asignados y utilizados desde SQL con sus invariantes', async () => {
  const api = servicios('ESTADO')
  const {
    lotes: [lote]
  } = await api.generarLotesDeTickets({
    campaniaId: A,
    cantidadTickets: 1,
    tamanioLote: 1
  })
  const operacionId = crypto.randomUUID()
  await db.query(
    'insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id) values($1,$2,$3,$4)',
    [lote.id, A, WORKER, operacionId]
  )
  const asignado = await api.resolverCatalogoDeTickets({
    campaniaId: A,
    codigoTicket: 'ESTADO-0'
  })
  const loteAsignado = asignado.identificarLote('ESTADO-0')
  assert.equal(loteAsignado.estado, 'ASIGNADO')
  assert.equal(loteAsignado.asignacion.trabajadorId, WORKER)
  assert.strictEqual(
    loteAsignado.asignar({ trabajadorId: WORKER, operacionId }),
    loteAsignado.asignacion
  )
  assert.throws(
    () => loteAsignado.asignar({ trabajadorId: 'OTRO', operacionId }),
    LoteYaAsignado
  )
  await assert.rejects(
    db.query(
      'insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id) values($1,$2,$3,$4)',
      [lote.id, A, WORKER, crypto.randomUUID()]
    ),
    (error) => error.code === '23505'
  )
  const registroId = crypto.randomUUID()
  const args = [
    registroId,
    'ESTADO-0',
    lote.id,
    A,
    WORKER,
    operacionId,
    '2026-10-14T12:00:00Z'
  ]
  const sql =
    'insert into harvest_registros_cosecha(id,codigo_ticket,lote_id,campania_id,trabajador_id,asignacion_operacion_id,fecha_hora) values($1,$2,$3,$4,$5,$6,$7)'
  await assert.rejects(
    db.query(sql, [
      registroId,
      'ESTADO-0',
      lote.id,
      A,
      WORKER,
      crypto.randomUUID(),
      args[6]
    ]),
    (error) => error.code === '23503'
  )
  await db.query(sql, args)
  await assert.rejects(
    db.query(sql, [crypto.randomUUID(), ...args.slice(1)]),
    (error) => error.code === '23505'
  )
  const utilizado = await api.resolverCatalogoDeTickets({
    campaniaId: A,
    codigoTicket: 'ESTADO-0'
  })
  const ticket = utilizado.obtenerTicket('ESTADO-0')
  assert.equal(ticket.estado, 'UTILIZADO')
  assert.equal(ticket.registroCosecha.id, registroId)
  assert.equal(ticket.registroCosecha.trabajadorId, WORKER)
  assert.equal(ticket.registroCosecha.asignacionOperacionId, operacionId)
  assert.throws(
    () =>
      utilizado.registrarCosechaDesdeTicket({
        codigoTicket: 'ESTADO-0',
        id: crypto.randomUUID(),
        fechaHora: '2026-10-15'
      }),
    TicketYaUtilizado
  )
})

test('solicitudes inválidas y campañas cerradas no dejan lotes vacíos', async () => {
  await servicios('LECTURA-CERRADA').generarLotesDeTickets({
    campaniaId: B,
    cantidadTickets: 1,
    tamanioLote: 1
  })
  const antes = await conteos()
  for (const payload of [null, [], {}, [{ id: crypto.randomUUID(), tickets: [] }]])
    await assert.rejects(crear(A, payload))
  await db.query("update campanias set estado='CERRADA' where id=$1", [B])
  try {
    await assert.rejects(
      crear(B, [{ id: crypto.randomUUID(), tickets: ['CERRADA'] }]),
      /debe estar activa/
    )
    assert.ok(await resolver(B, 'LECTURA-CERRADA-0'))
    assert.deepEqual(await conteos(), antes)
  } finally {
    await db.query("update campanias set estado='ACTIVA' where id=$1", [B])
  }
})
