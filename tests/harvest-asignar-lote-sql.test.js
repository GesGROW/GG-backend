import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { openDB } from 'idb'
import {
  CampaniaTicketIncorrecta,
  LoteYaAsignado,
  TicketNoEncontrado
} from '@gesgrow/core/contexts/harvest/index.js'
import { crearTicketsHarvest } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/crearTicketsHarvest.js'
import { crearSupabaseBackend } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js'
import { crearCasosDeUso } from '@gesgrow/harvest-client-contracts/src/application/crearCasosDeUso.js'
import { crearAdaptadoresOffline } from '@gesgrow/harvest-client-contracts/src/infrastructure/offline/crearAdaptadoresOffline.js'
import { configurarBackend, backend } from '@gesgrow/core/backend/backend.js'
import * as local from '@gesgrow/harvest-client-contracts/src/offline/db.js'

const db = new PGlite()
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OPERADOR = '47480378'
const SUPERVISOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DNI = '81990001'
const read = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const navigatorOriginal = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true
})
const llamadas = []
let perderRespuesta = false
const supabase = {
  async rpc(nombre, parametros) {
    llamadas.push([nombre, parametros])
    assert.ok(['harvest_asignar_lote_tickets', 'harvest_asignar_v4'].includes(nombre))
    try {
      const data = (
        await db.query(
          `select public.${nombre}($1::uuid,$2::varchar,$3::varchar,$4::text,$5::uuid) resultado`,
          [
            parametros.p_campania_id,
            parametros.p_dni_operador,
            parametros.p_dni_cosechador,
            parametros.p_codigo_ticket,
            parametros.p_operacion_id
          ]
        )
      ).rows[0].resultado
      if (perderRespuesta) {
        perderRespuesta = false
        return { error: { message: 'Failed to fetch' } }
      }
      return { data }
    } catch (error) {
      return {
        error: { code: error.code, message: error.message, details: error.detail }
      }
    }
  }
}
const api = crearTicketsHarvest({ supabase })
async function nuevoLote(prefijo, campaniaId = A) {
  const id = crypto.randomUUID()
  const codigos = [0, 1, 2].map((numero) => `${prefijo}-${numero}`)
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    id,
    campaniaId
  ])
  for (const codigo of codigos)
    await db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
      [codigo, id, campaniaId]
    )
  return { id, codigos }
}
const asignar = (codigoTicket, operacionId = crypto.randomUUID(), cambios = {}) =>
  api.asignarLoteDeTickets({
    codigoTicket,
    operacionId,
    operador: { dni: OPERADOR, campania: { id: A } },
    cosechador: { dni: DNI },
    ...cambios
  })
async function sinOperacion(id) {
  for (const tabla of ['operaciones_pda_procesadas', 'operaciones_pda_campania'])
    assert.equal(
      (await db.query(`select count(*)::int n from ${tabla} where id=$1`, [id])).rows[0]
        .n,
      0
    )
}

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  for (const nombre of [
    '20260930_admin_campanias.sql',
    '20261001_consistencia_acceso_app.sql',
    '202610030100_acceso_diario_jaberos.sql'
  ])
    await db.exec(read('../supabase/migrations/' + nombre))
  await db.exec(read('./fixtures/multicultivo.sql'))
  for (const nombre of [
    '20260930_admin_variedades.sql',
    '20260928_iniciar_sesion_lectura_pda.sql',
    '20260929_idempotencia_cola_pda.sql',
    '202610020100_jabero_provisional.sql',
    '202610010230_cosechador_provisional_asignar_ticket.sql',
    '20260930_admin_lotes.sql',
    '20260930_resumen_campania.sql',
    '202610020200_restaurar_produccion_diaria.sql',
    '202610030200_ranking_por_periodo.sql',
    '202610110100_lotes_variedades.sql',
    '202610110300_cultivos_campanias.sql'
  ])
    await db.exec(read('../supabase/migrations/' + nombre))
  await db.exec(
    'create function autorizar_integracion_reportes() returns void language plpgsql as $$ begin perform autorizar_integracion_gestion_maestros(); end $$;'
  )
  await db.exec(
    read('../supabase/migrations/202610110200_produccion_lote_variedad.sql')
  )
  await db.exec(read('../supabase/migrations/202610110400_rpc_por_campania.sql'))
  await db.query(
    "insert into campanias(id,codigo,nombre,estado,cultivo_id) values($1,'B','Campaña B','ACTIVA','a1000000-0000-4000-8000-000000000002')",
    [B]
  )
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)",
    [SUPERVISOR_ID, B]
  )
  await db.exec(read('../supabase/migrations/202610140100_harvest_tickets.sql'))
  await db.exec(read('../supabase/migrations/202610140200_harvest_asignar_lote.sql'))
  for (const nombre of [
    '202610140250_workforce_jabero_campania.sql',
    '202610140300_harvest_registrar_cosecha.sql',
    '202610140400_harvest_snapshot.sql',
    '202610140500_harvest_compatibilidad_v4.sql'
  ])
    await db.exec(read('../supabase/migrations/' + nombre))
})
after(async () => {
  await db.close()
  if (navigatorOriginal)
    Object.defineProperty(globalThis, 'navigator', navigatorOriginal)
  else delete globalThis.navigator
})

test('asigna el lote desde cualquier ticket y todos quedan asociados indirectamente sin consumir ni escribir legacy', async () => {
  for (const representante of [0, 1, 2]) {
    const lote = await nuevoLote(`EXITO-${representante}`)
    const resultado = await asignar(lote.codigos[representante])
    assert.equal(resultado.lote.id, lote.id)
    assert.equal(resultado.lote.estado, 'ASIGNADO')
    assert.equal(resultado.ticket.estado, 'DISPONIBLE')
    const filas = (
      await db.query(
        'select t.codigo,a.trabajador_id from harvest_tickets t join harvest_asignaciones_lote a on a.lote_id=t.lote_id where t.lote_id=$1',
        [lote.id]
      )
    ).rows
    assert.equal(filas.length, 3)
    assert.ok(
      filas.every((fila) => fila.trabajador_id === resultado.asignacion.trabajadorId)
    )
    assert.equal(
      (
        await db.query(
          'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
          [lote.id]
        )
      ).rows[0].n,
      1
    )
  }
  for (const tabla of [
    'asignaciones_ticket',
    'lecturas_jaba',
    'harvest_registros_cosecha'
  ])
    assert.equal((await db.query(`select count(*)::int n from ${tabla}`)).rows[0].n, 0)
})

test('misma operación desde ticket original o hermano conserva una única asignación y recibo', async () => {
  const lote = await nuevoLote('REINTENTO')
  const op = crypto.randomUUID()
  const primera = await asignar(lote.codigos[0], op)
  for (const codigo of [lote.codigos[0], lote.codigos[2]]) {
    const repetida = await asignar(codigo, op)
    assert.deepEqual(repetida.asignacion, primera.asignacion)
    assert.equal(repetida.ticket.codigo, codigo)
  }
  for (const tabla of ['operaciones_pda_procesadas', 'operaciones_pda_campania'])
    assert.equal(
      (await db.query(`select count(*)::int n from ${tabla} where id=$1`, [op])).rows[0]
        .n,
      1
    )
})

test('otra operación para el mismo trabajador se rechaza y no crea otra asignación', async () => {
  const lote = await nuevoLote('MISMO-TRABAJADOR')
  const original = await asignar(lote.codigos[0])
  const op = crypto.randomUUID()
  await assert.rejects(asignar(lote.codigos[1], op), LoteYaAsignado)
  await sinOperacion(op)
  assert.equal(
    (
      await db.query(
        'select operacion_id from harvest_asignaciones_lote where lote_id=$1',
        [lote.id]
      )
    ).rows[0].operacion_id,
    original.asignacion.operacionId
  )
})

test('otro trabajador no obtiene el lote ni alta provisional al perder el conflicto', async () => {
  const lote = await nuevoLote('OTRO-TRABAJADOR')
  const original = await asignar(lote.codigos[0])
  const op = crypto.randomUUID()
  await assert.rejects(
    asignar(lote.codigos[1], op, { cosechador: { dni: '81990109' } }),
    LoteYaAsignado
  )
  await sinOperacion(op)
  assert.equal(
    (await db.query("select count(*)::int n from trabajadores where dni='81990109'"))
      .rows[0].n,
    0
  )
  assert.equal(
    (
      await db.query(
        'select trabajador_id from harvest_asignaciones_lote where lote_id=$1',
        [lote.id]
      )
    ).rows[0].trabajador_id,
    original.asignacion.trabajadorId
  )
})

test('ticket inexistente o de otra campaña no genera asignación, trabajador ni operación', async () => {
  const ajeno = await nuevoLote('AJENO', B)
  for (const [codigo, Tipo] of [
    ['NO-EXISTE', TicketNoEncontrado],
    [ajeno.codigos[1], CampaniaTicketIncorrecta]
  ]) {
    const op = crypto.randomUUID()
    await assert.rejects(asignar(codigo, op, { cosechador: { dni: '81990110' } }), Tipo)
    await sinOperacion(op)
  }
  assert.equal(
    (await db.query("select count(*)::int n from trabajadores where dni='81990110'"))
      .rows[0].n,
    0
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
        [ajeno.id]
      )
    ).rows[0].n,
    0
  )
})

test('operador rechazado utiliza la autorización vigente de Identity/Campaign antes de escribir', async () => {
  const lote = await nuevoLote('OPERADOR')
  const op = crypto.randomUUID()
  await assert.rejects(
    asignar(lote.codigos[0], op, {
      operador: { dni: '00000000', campania: { id: A } }
    }),
    /no está autorizado/
  )
  await sinOperacion(op)
  await db.query("update campanias set estado='CERRADA' where id=$1", [B])
  try {
    const cerrado = await nuevoLote('CERRADO', B)
    await assert.rejects(
      asignar(cerrado.codigos[0], op, { campania: { id: B } }),
      /no está autorizado/
    )
    await sinOperacion(op)
  } finally {
    await db.query("update campanias set estado='ACTIVA' where id=$1", [B])
  }
})

test('un reintento vuelve a autorizar al operador y no devuelve éxito si se revocó su acceso', async () => {
  const lote = await nuevoLote('REVOCACION')
  const op = crypto.randomUUID()
  await asignar(lote.codigos[0], op)
  await db.query('update usuarios_app set activo=false where trabajador_id=$1', [
    SUPERVISOR_ID
  ])
  try {
    await assert.rejects(asignar(lote.codigos[1], op), /no está autorizado/)
    assert.equal(
      (
        await db.query(
          'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
          [lote.id]
        )
      ).rows[0].n,
      1
    )
  } finally {
    await db.query('update usuarios_app set activo=true where trabajador_id=$1', [
      SUPERVISOR_ID
    ])
  }
  assert.equal((await asignar(lote.codigos[1], op)).asignacion.operacionId, op)
})

test('Workforce rechaza al trabajador inactivo y revierte la operación', async () => {
  await db.query(
    "insert into trabajadores(dni,nombres,apellidos,activo) values('81990111','Ana','Inactiva',false)"
  )
  const lote = await nuevoLote('INACTIVO')
  const op = crypto.randomUUID()
  await assert.rejects(
    asignar(lote.codigos[0], op, { cosechador: { dni: '81990111' } }),
    /trabajador está inactivo/
  )
  await sinOperacion(op)
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
        [lote.id]
      )
    ).rows[0].n,
    0
  )
})

test('la identidad de operación no puede reutilizarse con otro lote, trabajador, operador o campaña', async () => {
  const original = await nuevoLote('IDENTIDAD')
  const diferente = await nuevoLote('IDENTIDAD-OTRO')
  const ajeno = await nuevoLote('IDENTIDAD-B', B)
  const op = crypto.randomUUID()
  await asignar(original.codigos[0], op)
  await assert.rejects(asignar(diferente.codigos[0], op), /reutilizado/)
  await assert.rejects(
    asignar(original.codigos[1], op, { cosechador: { dni: '81990112' } }),
    /reutilizado/
  )
  await assert.rejects(
    asignar(ajeno.codigos[0], op, { campania: { id: B } }),
    /reutilizado/
  )
  const otroOperador = crypto.randomUUID()
  await db.query(
    "insert into trabajadores(id,dni,nombres,apellidos,activo) values($1,'81990113','Otro','Operador',true)",
    [otroOperador]
  )
  await db.query('insert into usuarios_app(trabajador_id,activo) values($1,true)', [
    otroOperador
  ])
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)",
    [otroOperador, A]
  )
  await assert.rejects(
    asignar(original.codigos[0], op, {
      operador: { dni: '81990113', campania: { id: A } }
    }),
    /reutilizado/
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_asignaciones_lote where lote_id in ($1,$2)',
        [diferente.id, ajeno.id]
      )
    ).rows[0].n,
    0
  )
})

test('fallo posterior a la asignación revierte lote, alta Workforce y ambos recibos', async () => {
  const lote = await nuevoLote('ROLLBACK')
  const op = crypto.randomUUID()
  await db.exec(`create function harvest_fallar_recibo_prueba() returns trigger language plpgsql as $$
    begin raise exception 'Fallo de recibo provocado'; end $$;
    create trigger harvest_fallo_prueba before insert on operaciones_pda_procesadas
      for each row execute function harvest_fallar_recibo_prueba();`)
  try {
    await assert.rejects(
      asignar(lote.codigos[0], op, { cosechador: { dni: '81990114' } }),
      /Fallo de recibo/
    )
    await sinOperacion(op)
    assert.equal(
      (
        await db.query(
          'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
          [lote.id]
        )
      ).rows[0].n,
      0
    )
    assert.equal(
      (await db.query("select count(*)::int n from trabajadores where dni='81990114'"))
        .rows[0].n,
      0
    )
    assert.equal(
      (
        await db.query('select count(*)::int n from harvest_tickets where lote_id=$1', [
          lote.id
        ])
      ).rows[0].n,
      3
    )
  } finally {
    await db.exec(
      'drop trigger harvest_fallo_prueba on operaciones_pda_procesadas; drop function harvest_fallar_recibo_prueba();'
    )
  }
  assert.equal(
    (await asignar(lote.codigos[0], op, { cosechador: { dni: '81990114' } })).asignacion
      .operacionId,
    op
  )
})

test('constraints respaldan exclusividad por lote, operación única y aislamiento por campaña', async () => {
  const lote = await nuevoLote('CONSTRAINTS')
  const otro = await nuevoLote('CONSTRAINTS-OTRO')
  const asignacion = (await asignar(lote.codigos[0])).asignacion
  const insert = (id, campania, operacion) =>
    db.query(
      'insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id) values($1,$2,$3,$4)',
      [id, campania, asignacion.trabajadorId, operacion]
    )
  await assert.rejects(
    insert(lote.id, A, crypto.randomUUID()),
    (error) => error.code === '23505'
  )
  await assert.rejects(
    insert(otro.id, A, asignacion.operacionId),
    (error) => error.code === '23505'
  )
  await assert.rejects(
    insert(otro.id, B, crypto.randomUUID()),
    (error) => error.code === '23503'
  )
  await assert.rejects(
    db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
      ['SIN-LOTE', crypto.randomUUID(), A]
    ),
    (error) => error.code === '23503'
  )
})

test('solicitudes competidoras serializadas por PGlite: una asignación y un rechazo, sin demostrar concurrencia entre conexiones', async () => {
  const lote = await nuevoLote('COMPETIDORES')
  const ids = [crypto.randomUUID(), crypto.randomUUID()]
  const resultados = await Promise.allSettled([
    asignar(lote.codigos[0], ids[0]),
    asignar(lote.codigos[1], ids[1], { cosechador: { dni: '81990115' } })
  ])
  assert.equal(
    resultados.filter((resultado) => resultado.status === 'fulfilled').length,
    1
  )
  assert.ok(
    resultados.find((resultado) => resultado.status === 'rejected').reason instanceof
      LoteYaAsignado
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
        [lote.id]
      )
    ).rows[0].n,
    1
  )
})

test('RPC PDA accesible bajo contrato existente, sin acceso directo a tablas', async () => {
  const lote = await nuevoLote('PERMISOS')
  await db.exec('set role anon')
  try {
    await assert.rejects(
      db.query('select * from harvest_asignaciones_lote'),
      /permission denied/
    )
    const resultado = await asignar(lote.codigos[0])
    assert.equal(resultado.lote.estado, 'ASIGNADO')
    await assert.rejects(
      asignar(lote.codigos[0], crypto.randomUUID(), {
        operador: { dni: '00000000', campania: { id: A } }
      }),
      /no está autorizado/
    )
  } finally {
    await db.exec('reset role')
  }
})

test('ASIGNAR_TICKET de v4 → IndexedDB v5 → caso nuevo → SQL: respuesta perdida conserva UUID y reintento idempotente', async () => {
  const lote = await nuevoLote('PDA')
  await local.seleccionarCampaniaLocal(A)
  await local.guardarCache({
    campania: { id: A, estado: 'ACTIVA' },
    trabajadores: [],
    tickets: [],
    lotes: []
  })
  configurarBackend(crearSupabaseBackend(supabase))
  const casos = crearCasosDeUso({
    backend,
    offline: crearAdaptadoresOffline({ legacy: true }),
    estaEnLinea: () => navigator.onLine,
    generarId: () => crypto.randomUUID(),
    ahora: () => new Date().toISOString(),
    registrarError: () => {}
  })
  navigator.onLine = false
  const pendiente = await casos.asignarTicket({
    operador: { dni: OPERADOR, campania: { id: A } },
    cosechador: { dni: DNI, nombre: 'Ana' },
    codigoTicket: lote.codigos[1]
  })
  assert.equal(await pendiente.sincronizar(), false)
  const op = pendiente.operacion
  assert.equal(op.tipo, 'ASIGNAR_TICKET')
  assert.deepEqual(op.payload, {
    dniOperador: OPERADOR,
    dniCosechador: DNI,
    codigoTicket: lote.codigos[1],
    campaniaId: A
  })
  navigator.onLine = true
  perderRespuesta = true
  await pendiente.sincronizar()
  assert.equal(
    (await local.obtenerColaCompleta()).find((fila) => fila.id === op.id).estado,
    'PENDIENTE'
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_asignaciones_lote where lote_id=$1',
        [lote.id]
      )
    ).rows[0].n,
    1
  )
  await pendiente.sincronizar()
  assert.equal(
    (await local.obtenerColaCompleta()).find((fila) => fila.id === op.id).estado,
    'SINCRONIZADA'
  )
  assert.equal((await local.obtenerTicket(lote.codigos[1])).estado_sync, 'SINCRONIZADO')
  const intentos = llamadas.filter(([, args]) => args.p_operacion_id === op.id)
  assert.equal(intentos.length, 2)
  assert.ok(intentos.every(([nombre]) => nombre === 'harvest_asignar_v4'))
  const conexion = await openDB('scc', 5)
  assert.equal(conexion.version, 5)
  assert.deepEqual(
    [...conexion.objectStoreNames],
    [
      'cola',
      'harvestAsignaciones',
      'harvestLotes',
      'harvestRegistros',
      'harvestReservas',
      'harvestTickets',
      'lecturas',
      'lotes',
      'meta',
      'operadores',
      'sesiones',
      'tickets',
      'trabajadores'
    ]
  )
  conexion.close()
})
