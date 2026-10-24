import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { openDB } from 'idb'
import {
  CampaniaTicketIncorrecta,
  LoteSinAsignar,
  TicketNoEncontrado,
  TicketYaUtilizado,
  SesionCosechaInvalida
} from '@gesgrow/core/contexts/harvest/index.js'
import { crearTicketsHarvest } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/crearTicketsHarvest.js'
import { crearSupabaseBackend } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js'
import { configurarBackend } from '@gesgrow/core/backend/backend.js'
import { sincronizarPendientes } from '@gesgrow/harvest-client-contracts/src/offline/sync.js'
import * as local from '@gesgrow/harvest-client-contracts/src/offline/db.js'
import { crearCasosDeUso } from '@gesgrow/harvest-client-contracts/src/application/crearCasosDeUso.js'
import { crearAdaptadoresOffline } from '@gesgrow/harvest-client-contracts/src/infrastructure/offline/crearAdaptadoresOffline.js'
import { fechaOperativa } from '@gesgrow/core/contexts/identity-access/index.js'

const db = new PGlite()
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OP = '47480378'
const COSECHADOR = '81990410'
const JABERO = '81990400'
const LA = '22222222-2222-4222-8222-222222222222'
const LB = '22222222-2222-4222-8222-000000000002'
const VB = '11111111-1111-4111-8111-000000000002'
const S = crypto.randomUUID()
const SB = crypto.randomUUID()
const FECHA = '2026-10-14T12:00:00Z'
const read = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const navigatorOriginal = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true
})
let perderRespuesta = false
const llamadas = []
const supabase = {
  async rpc(nombre, p) {
    llamadas.push([nombre, p])
    try {
      let data
      if (nombre === 'obtener_cache_operativa_campania')
        data = (
          await db.query(
            'select obtener_cache_operativa_campania($1::uuid,$2::varchar) r',
            [p.p_campania_id, p.p_dni_operador]
          )
        ).rows[0].r
      else if (nombre === 'harvest_obtener_snapshot')
        data = (
          await db.query('select harvest_obtener_snapshot($1::uuid,$2::varchar) r', [
            p.p_campania_id,
            p.p_dni_operador
          ])
        ).rows[0].r
      else if (['harvest_asignar_lote_tickets', 'harvest_asignar_v4'].includes(nombre))
        data = (
          await db.query(
            `select ${nombre}($1::uuid,$2::varchar,$3::varchar,$4::text,$5::uuid) r`,
            [
              p.p_campania_id,
              p.p_dni_operador,
              p.p_dni_cosechador,
              p.p_codigo_ticket,
              p.p_operacion_id
            ]
          )
        ).rows[0].r
      else {
        assert.ok(
          ['harvest_registrar_cosecha', 'harvest_registrar_v4'].includes(nombre)
        )
        data = (
          await db.query(
            `select ${nombre}($1::uuid,$2::varchar,$3::uuid,$4::text,$5::uuid,$6::text,$7::uuid) r`,
            [
              p.p_campania_id,
              p.p_dni_operador,
              p.p_sesion_id,
              p.p_codigo_ticket,
              p.p_lectura_id,
              p.p_fecha_hora,
              p.p_operacion_id
            ]
          )
        ).rows[0].r
        if (perderRespuesta) {
          perderRespuesta = false
          return { error: { message: 'Failed to fetch' } }
        }
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
async function nuevoLote(prefijo, { campania = A, asignado = true } = {}) {
  const id = crypto.randomUUID()
  const codigos = [0, 1].map((i) => `${prefijo}-${i}`)
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    id,
    campania
  ])
  for (const codigo of codigos)
    await db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
      [codigo, id, campania]
    )
  let asignacion
  if (asignado)
    asignacion = (
      await api.asignarLoteDeTickets({
        codigoTicket: codigos[0],
        campania: { id: campania },
        operador: { dni: OP },
        cosechador: { dni: COSECHADOR },
        operacionId: crypto.randomUUID()
      })
    ).asignacion
  return { id, codigos, asignacion }
}
function solicitud(codigoTicket, cambios = {}) {
  return {
    codigoTicket,
    operador: { dni: OP, campania: { id: A } },
    sesionId: S,
    registroId: crypto.randomUUID(),
    fechaHora: FECHA,
    operacionId: crypto.randomUUID(),
    ...cambios
  }
}
const registrar = (codigo, cambios = {}) =>
  api.registrarCosecha(solicitud(codigo, cambios))
async function disponible(codigo) {
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1',
        [codigo]
      )
    ).rows[0].n,
    0
  )
}
async function sinOperacion(id) {
  for (const tabla of ['operaciones_pda_campania', 'operaciones_pda_procesadas'])
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
    [SUP, B]
  )
  await db.query(
    "insert into variedades(id,nombre,cultivo_id) values($1,'Variedad B','a1000000-0000-4000-8000-000000000002')",
    [VB]
  )
  await db.query(
    "insert into lotes(id,codigo,nombre,campania_id,variedad_id) values($1,'LB','Sur',$2,$3)",
    [LB, B, VB]
  )
  await db.query('insert into lote_variedades(lote_id,variedad_id) values($1,$2)', [
    LB,
    VB
  ])
  for (const [campania, lote, sesion, variedad] of [
    [A, LA, S, '11111111-1111-4111-8111-111111111111'],
    [B, LB, SB, VB]
  ]) {
    await db.query(
      'select registrar_jabero_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid)',
      [campania, OP, JABERO, crypto.randomUUID()]
    )
    await db.query(
      'select iniciar_sesion_lectura_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid,$6::uuid)',
      [campania, OP, JABERO, lote, sesion, variedad]
    )
  }
  for (const nombre of [
    '202610140100_harvest_tickets.sql',
    '202610140200_harvest_asignar_lote.sql',
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

test('registro exitoso: consumo y registro son una sola persistencia con atribución derivada del lote', async () => {
  const lote = await nuevoLote('EXITO')
  const args = solicitud(lote.codigos[0], {
    trabajadorId: 'CLIENTE-FALSO',
    cosechador: { dni: '00000000' }
  })
  const resultado = await api.registrarCosecha(args)
  assert.equal(resultado.ticket.estado, 'UTILIZADO')
  assert.strictEqual(resultado.registro, resultado.ticket.registroCosecha)
  assert.equal(resultado.registro.trabajadorId, lote.asignacion.trabajadorId)
  assert.equal(resultado.registro.id, args.registroId)
  assert.equal(resultado.registro.operacionId, args.operacionId)
  assert.equal(resultado.registro.sesionId, S)
  const fila = (
    await db.query('select * from harvest_registros_cosecha where codigo_ticket=$1', [
      lote.codigos[0]
    ])
  ).rows[0]
  assert.equal(fila.trabajador_id, lote.asignacion.trabajadorId)
  assert.equal(fila.asignacion_operacion_id, lote.asignacion.operacionId)
  assert.ok(fila.creado_en)
  await disponible(lote.codigos[1])
})

test('ticket sin asignación, inexistente y de campaña incorrecta se rechazan sin estado parcial', async () => {
  const sinAsignar = await nuevoLote('SIN-ASIGNAR', { asignado: false })
  const ajeno = await nuevoLote('AJENO', { campania: B })
  for (const [codigo, Tipo] of [
    [sinAsignar.codigos[0], LoteSinAsignar],
    ['NO-EXISTE', TicketNoEncontrado],
    [ajeno.codigos[0], CampaniaTicketIncorrecta]
  ]) {
    const op = crypto.randomUUID()
    await assert.rejects(registrar(codigo, { operacionId: op }), Tipo)
    await disponible(codigo)
    await sinOperacion(op)
  }
})

test('misma operación devuelve exactamente el registro original, incluso con nuevo ID/fecha propuestos', async () => {
  const lote = await nuevoLote('IDEMPOTENCIA')
  const args = solicitud(lote.codigos[0])
  const primero = await api.registrarCosecha(args)
  for (const cambios of [
    {},
    { registroId: crypto.randomUUID(), fechaHora: '2026-10-15T09:00:00Z' }
  ]) {
    const repetido = await api.registrarCosecha({ ...args, ...cambios })
    assert.deepEqual(repetido.registro, primero.registro)
  }
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1',
        [lote.codigos[0]]
      )
    ).rows[0].n,
    1
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from operaciones_pda_procesadas where id=$1',
        [args.operacionId]
      )
    ).rows[0].n,
    1
  )
})

test('una operación nueva para ticket utilizado devuelve TicketYaUtilizado y no guarda recibo', async () => {
  const lote = await nuevoLote('UTILIZADO')
  const original = await registrar(lote.codigos[0])
  const op = crypto.randomUUID()
  await assert.rejects(
    registrar(lote.codigos[0], { operacionId: op }),
    TicketYaUtilizado
  )
  await sinOperacion(op)
  assert.equal(
    (
      await db.query(
        'select id from harvest_registros_cosecha where codigo_ticket=$1',
        [lote.codigos[0]]
      )
    ).rows[0].id,
    original.registro.id
  )
})

test('la identidad de operación no puede trasladarse a un ticket hermano ni a otra sesión', async () => {
  const lote = await nuevoLote('OP-CONTEXTO')
  const args = solicitud(lote.codigos[0])
  await api.registrarCosecha(args)
  await assert.rejects(
    api.registrarCosecha({ ...args, codigoTicket: lote.codigos[1] }),
    /reutilizado/
  )
  await assert.rejects(api.registrarCosecha({ ...args, sesionId: SB }), /reutilizado/)
  await disponible(lote.codigos[1])
})

test('sesión inexistente, ajena a la campaña, cerrada o de otro operador no consume', async () => {
  const lote = await nuevoLote('SESION')
  for (const sesionId of [crypto.randomUUID(), SB]) {
    const op = crypto.randomUUID()
    await assert.rejects(
      registrar(lote.codigos[0], { sesionId, operacionId: op }),
      SesionCosechaInvalida
    )
    await sinOperacion(op)
  }
  await db.query("update sesiones_lectura set estado='CERRADA' where id=$1", [S])
  try {
    await assert.rejects(registrar(lote.codigos[0]), SesionCosechaInvalida)
  } finally {
    await db.query("update sesiones_lectura set estado='ACTIVA' where id=$1", [S])
  }
  const anterior = (
    await db.query('select iniciada_por_usuario_id from sesiones_lectura where id=$1', [
      S
    ])
  ).rows[0].iniciada_por_usuario_id
  const otro = (
    await db.query(
      "insert into trabajadores(dni,nombres,apellidos,activo) values('81990420','Otro','Operador',true) returning id"
    )
  ).rows[0].id
  const otroUsuario = (
    await db.query(
      'insert into usuarios_app(trabajador_id,activo) values($1,true) returning id',
      [otro]
    )
  ).rows[0].id
  await db.query('update sesiones_lectura set iniciada_por_usuario_id=$1 where id=$2', [
    otroUsuario,
    S
  ])
  try {
    await assert.rejects(registrar(lote.codigos[0]), SesionCosechaInvalida)
  } finally {
    await db.query(
      'update sesiones_lectura set iniciada_por_usuario_id=$1 where id=$2',
      [anterior, S]
    )
  }
  await disponible(lote.codigos[0])
})

test('Workforce valida el jabero de la sesión mediante su contrato SQL', async () => {
  const lote = await nuevoLote('JABERO')
  const rol = (
    await db.query('select jabero_rol_id from sesiones_lectura where id=$1', [S])
  ).rows[0].jabero_rol_id
  await db.query('update trabajador_campania_rol set activo=false where id=$1', [rol])
  try {
    await assert.rejects(registrar(lote.codigos[0]), /jabero activo/)
  } finally {
    await db.query('update trabajador_campania_rol set activo=true where id=$1', [rol])
  }
  await disponible(lote.codigos[0])
})

test('operador inválido o revocado se rechaza, también antes de devolver un recibo anterior', async () => {
  const lote = await nuevoLote('OPERADOR')
  const op = crypto.randomUUID()
  await assert.rejects(
    registrar(lote.codigos[0], {
      operador: { dni: '00000000', campania: { id: A } },
      operacionId: op
    }),
    /no está autorizado/
  )
  await sinOperacion(op)
  const args = solicitud(lote.codigos[0])
  await api.registrarCosecha(args)
  await db.query('update usuarios_app set activo=false where trabajador_id=$1', [SUP])
  try {
    await assert.rejects(api.registrarCosecha(args), /no está autorizado/)
  } finally {
    await db.query('update usuarios_app set activo=true where trabajador_id=$1', [SUP])
  }
})

test('el reintento válido confirma una respuesta perdida incluso después de cerrar la sesión', async () => {
  const lote = await nuevoLote('CIERRE')
  const args = solicitud(lote.codigos[0])
  const original = await api.registrarCosecha(args)
  await db.query("update sesiones_lectura set estado='CERRADA' where id=$1", [S])
  try {
    assert.deepEqual((await api.registrarCosecha(args)).registro, original.registro)
    await assert.rejects(registrar(lote.codigos[1]), SesionCosechaInvalida)
  } finally {
    await db.query("update sesiones_lectura set estado='ACTIVA' where id=$1", [S])
  }
})

test('rollback tardío revierte registro/consumo y ambos recibos; luego se puede reintentar', async () => {
  const lote = await nuevoLote('ROLLBACK')
  const args = solicitud(lote.codigos[0])
  await db.exec(`create function harvest_fallo_cosecha_prueba() returns trigger language plpgsql as $$ begin raise exception 'Fallo de recibo cosecha'; end $$;
    create trigger harvest_fallo_cosecha before insert on operaciones_pda_procesadas for each row execute function harvest_fallo_cosecha_prueba();`)
  try {
    await assert.rejects(api.registrarCosecha(args), /Fallo de recibo cosecha/)
    await disponible(lote.codigos[0])
    await sinOperacion(args.operacionId)
    assert.ok(
      (
        await db.query('select 1 from harvest_asignaciones_lote where lote_id=$1', [
          lote.id
        ])
      ).rows.length
    )
  } finally {
    await db.exec(
      'drop trigger harvest_fallo_cosecha on operaciones_pda_procesadas; drop function harvest_fallo_cosecha_prueba();'
    )
  }
  assert.equal(
    (await api.registrarCosecha(args)).registro.operacionId,
    args.operacionId
  )
})

test('un fallo de inserción por ID duplicado o fecha inválida tampoco deja ticket consumido', async () => {
  const lote = await nuevoLote('FALLO-INSERT')
  const anterior = await registrar(lote.codigos[0])
  for (const cambio of [
    { registroId: anterior.registro.id },
    { fechaHora: 'NO-ES-FECHA' }
  ]) {
    const args = solicitud(lote.codigos[1], cambio)
    await assert.rejects(api.registrarCosecha(args))
    await disponible(lote.codigos[1])
    await sinOperacion(args.operacionId)
  }
})

test('constraint UNIQUE por código/identidad de ticket impide doble registro aun eludiendo RPC', async () => {
  const lote = await nuevoLote('UNIQUE')
  await registrar(lote.codigos[0])
  await assert.rejects(
    db.query(
      'insert into harvest_registros_cosecha(id,codigo_ticket,lote_id,campania_id,trabajador_id,asignacion_operacion_id,fecha_hora) values($1,$2,$3,$4,$5,$6,$7)',
      [
        crypto.randomUUID(),
        lote.codigos[0],
        lote.id,
        A,
        lote.asignacion.trabajadorId,
        lote.asignacion.operacionId,
        FECHA
      ]
    ),
    (error) =>
      error.code === '23505' && error.constraint === 'harvest_registro_ticket_unico'
  )
})

test('solicitudes competidoras serializadas por PGlite confirman una cosecha y rechazan la otra', async () => {
  const lote = await nuevoLote('COMPETIDORES')
  const resultados = await Promise.allSettled([
    registrar(lote.codigos[0]),
    registrar(lote.codigos[0])
  ])
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1)
  assert.ok(
    resultados.find((r) => r.status === 'rejected').reason instanceof TicketYaUtilizado
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1',
        [lote.codigos[0]]
      )
    ).rows[0].n,
    1
  )
  // No afirma concurrencia entre conexiones: PGlite serializa las sentencias.
})

test('el histórico legacy admite repeticiones y no se convierte ni recibe nuevas cosechas', async () => {
  const codigo = 'HISTORICO'
  await db.query(
    'select asignar_ticket_campania($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::uuid)',
    [A, OP, COSECHADOR, codigo, crypto.randomUUID()]
  )
  for (let i = 0; i < 2; i++)
    await db.query(
      'select registrar_lectura_jaba_campania($1::uuid,$2::varchar,$3::uuid,$4::varchar,$5::uuid,$6::text,$7::uuid)',
      [A, OP, S, codigo, crypto.randomUUID(), FECHA, crypto.randomUUID()]
    )
  const antes = (await db.query('select * from lecturas_jaba order by id')).rows
  assert.equal(antes.length, 2)
  await assert.rejects(registrar(codigo), TicketNoEncontrado)
  const nuevo = await nuevoLote('SIN-MEZCLA')
  await registrar(nuevo.codigos[0])
  assert.deepEqual(
    (await db.query('select * from lecturas_jaba order by id')).rows,
    antes
  )
})

test('un recibo legacy no se reinterpreta como resultado de cosecha Harvest', async () => {
  const lote = await nuevoLote('RECIBO-LEGACY')
  const args = solicitud(lote.codigos[0])
  await db.query('select fijar_campania_operacion($1,$2,$3,$4)', [
    args.operacionId,
    A,
    OP,
    'REGISTRAR_JABA'
  ])
  await db.query(
    "insert into operaciones_pda_procesadas(id,tipo,argumentos_md5,resultado) values($1,'REGISTRAR_JABA',md5(jsonb_build_array($2::uuid,$3::text,$4::uuid,$5::text)::text),'{\"ok\":true}'::jsonb)",
    [args.operacionId, A, OP, S, lote.codigos[0]]
  )
  await assert.rejects(api.registrarCosecha(args), /no corresponde a un registro/)
  await disponible(lote.codigos[0])
})

test('REGISTRAR_JABA de v4 mantiene payload en IndexedDB v5 y reintenta una respuesta perdida con el mismo UUID', async () => {
  const lote = await nuevoLote('COLA')
  await local.seleccionarCampaniaLocal(A)
  await local.guardarSesionLocal({
    id: S,
    sesion_id: S,
    campania_id: A,
    estado: 'ACTIVA'
  })
  const lecturaId = crypto.randomUUID()
  const op = await local.registrarLecturaOffline(
    {
      id: lecturaId,
      sesion_id: S,
      codigo_ticket: lote.codigos[0],
      fecha_hora: FECHA,
      estado_sync: 'PENDIENTE'
    },
    OP
  )
  assert.equal(op.tipo, 'REGISTRAR_JABA')
  assert.deepEqual(op.payload, {
    dniOperador: OP,
    sesionId: S,
    codigoTicket: lote.codigos[0],
    lecturaId,
    fechaHora: FECHA,
    campaniaId: A
  })
  configurarBackend(crearSupabaseBackend(supabase))
  perderRespuesta = true
  await sincronizarPendientes()
  assert.equal(
    (await local.obtenerColaCompleta()).find((o) => o.id === op.id).estado,
    'PENDIENTE'
  )
  await sincronizarPendientes()
  assert.equal(
    (await local.obtenerColaCompleta()).find((o) => o.id === op.id).estado,
    'SINCRONIZADA'
  )
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1',
        [lote.codigos[0]]
      )
    ).rows[0].n,
    1
  )
  const intentos = llamadas.filter(([, p]) => p.p_operacion_id === op.id)
  assert.equal(intentos.length, 2)
  assert.ok(intentos.every(([nombre]) => nombre === 'harvest_registrar_v4'))
  const repetida = await local.registrarLecturaOffline(
    {
      id: crypto.randomUUID(),
      sesion_id: S,
      codigo_ticket: lote.codigos[0],
      fecha_hora: FECHA,
      estado_sync: 'PENDIENTE'
    },
    OP
  )
  await sincronizarPendientes()
  assert.equal(
    (await local.obtenerColaCompleta()).find((o) => o.id === repetida.id).estado,
    'ERROR'
  )
  // La proyección/conteo local sigue legacy. F5.5 debe reconciliar este rechazo.
  assert.equal(await local.contarLecturasSesion(S), 1)
  assert.equal((await local.obtenerLecturasSesionCompletas(S)).length, 2)
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

test('snapshot SQL publica el contrato de dominio coherente y autorizado por campaña', async () => {
  const lote = await nuevoLote('SNAPSHOT')
  const r = await registrar(lote.codigos[0])
  const remoto = crearSupabaseBackend(supabase)
  const snapshot = await remoto.obtenerSnapshotHarvest(OP, A)
  assert.equal(snapshot.versionContrato, 1)
  assert.equal(snapshot.completo, true)
  assert.equal(snapshot.campaniaId, A)
  assert.ok(snapshot.snapshotId && snapshot.obtenidoEn)
  assert.ok(snapshot.tickets.every((t) => t.campaniaId === A))
  assert.ok(snapshot.lotesDeTickets.every((l) => l.campaniaId === A))
  const registro = snapshot.registrosCosecha.find(
    (registro) => registro.id === r.registro.id
  )
  assert.equal(registro.trabajadorId, lote.asignacion.trabajadorId)
  assert.equal(registro.asignacionOperacionId, lote.asignacion.operacionId)
  assert.equal(
    snapshot.tickets.find((t) => t.codigo === lote.codigos[0]).estado,
    'UTILIZADO'
  )
  assert.equal(
    snapshot.tickets.find((t) => t.codigo === lote.codigos[1]).estado,
    'DISPONIBLE'
  )
  const otra = await remoto.obtenerSnapshotHarvest(OP, B)
  assert.ok(otra.tickets.every((t) => t.campaniaId === B))
  assert.ok(!otra.tickets.some((t) => t.codigo === lote.codigos[0]))
  await assert.rejects(remoto.obtenerSnapshotHarvest('00000000', A))
  await local.guardarSnapshotHarvest(snapshot)
  assert.equal(
    (await local.obtenerEstadoHarvest(lote.codigos[0], A)).estadoServidor,
    'UTILIZADO'
  )
  assert.equal(
    (await local.obtenerEstadoHarvest(lote.codigos[1], A)).proyeccion.cosechador_dni,
    COSECHADOR
  )
})

test('compatibilidad v4: el servidor mantiene asignación y lecturas repetidas legacy sin convertirlas', async () => {
  const remoto = crearSupabaseBackend(supabase)
  const codigoTicket = 'V4-LEGACY'
  const asignacion = {
    campaniaId: A,
    dniOperador: OP,
    dniCosechador: COSECHADOR,
    codigoTicket,
    operacionId: crypto.randomUUID(),
    compatibilidadV4: true
  }
  const resultado = await remoto.asignarTicket(asignacion)
  assert.equal(resultado.legacy, true)
  assert.deepEqual(await remoto.asignarTicket(asignacion), resultado)
  for (let i = 0; i < 2; i++) {
    const comando = {
      campaniaId: A,
      dniOperador: OP,
      sesionId: S,
      codigoTicket,
      lecturaId: crypto.randomUUID(),
      fechaHora: FECHA,
      operacionId: crypto.randomUUID(),
      compatibilidadV4: true
    }
    const original = await remoto.registrarLecturaJaba(comando)
    assert.equal(original.legacy, true)
    assert.deepEqual(await remoto.registrarLecturaJaba(comando), original)
  }
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from lecturas_jaba l join asignaciones_ticket a on a.id=l.asignacion_ticket_id where a.codigo_ticket=$1',
        [codigoTicket]
      )
    ).rows[0].n,
    2
  )
  assert.equal(
    (
      await db.query('select count(*)::int n from harvest_tickets where codigo=$1', [
        codigoTicket
      ])
    ).rows[0].n,
    0
  )
  const snapshot = await remoto.obtenerSnapshotHarvest(OP, A)
  assert.ok(snapshot.codigosLegacy.includes(codigoTicket))
  assert.ok(!snapshot.tickets.some((t) => t.codigo === codigoTicket))
})

test('compatibilidad v4: código ambiguo se rechaza; un recibo previo conserva su modelo original', async () => {
  const remoto = crearSupabaseBackend(supabase)
  const lote = await nuevoLote('V4-AMBIGUO', { asignado: false })
  const codigoTicket = lote.codigos[0]
  const operacionId = crypto.randomUUID()
  await db.query(
    'select asignar_ticket_campania($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::uuid)',
    [A, OP, COSECHADOR, codigoTicket, operacionId]
  )
  const args = {
    campaniaId: A,
    dniOperador: OP,
    dniCosechador: COSECHADOR,
    codigoTicket,
    compatibilidadV4: true
  }
  const nueva = crypto.randomUUID()
  await assert.rejects(remoto.asignarTicket({ ...args, operacionId: nueva }), /ambiguo/)
  await sinOperacion(nueva)
  assert.equal((await remoto.asignarTicket({ ...args, operacionId })).legacy, true)
  const r = crypto.randomUUID()
  await assert.rejects(
    remoto.registrarLecturaJaba({
      ...args,
      operacionId: r,
      sesionId: S,
      lecturaId: crypto.randomUUID(),
      fechaHora: FECHA
    }),
    /ambiguo/
  )
  await sinOperacion(r)
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
    (
      await db.query(
        'select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1',
        [codigoTicket]
      )
    ).rows[0].n,
    0
  )
})

test('PDA F5.5: Application → reservas IndexedDB v5 → cola → SQL → confirmación sin consumo duplicado', async () => {
  // La composición actual exige conocer la política F5.6. La fixture activa
  // explícitamente el corte, después de las caracterizaciones de F5.4/F5.5.
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql as $$ select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid $$;"
  )
  await db.exec(read('../supabase/migrations/202610140600_harvest_cutover.sql'))
  await db.exec(read('../supabase/migrations/202610140610_harvest_proyecciones.sql'))
  await db.query('select admin_activar_harvest_campania($1::uuid,1)', [A])
  const lote = await nuevoLote('PDA-OFFLINE', { asignado: false })
  const conexion = await openDB('scc', 5)
  const tx = conexion.transaction([...conexion.objectStoreNames], 'readwrite')
  for (const nombre of conexion.objectStoreNames) await tx.objectStore(nombre).clear()
  await tx.done
  conexion.close()
  const remoto = crearSupabaseBackend(supabase)
  configurarBackend(remoto)
  await local.seleccionarCampaniaLocal(A)
  await local.guardarOperador({
    dni: OP,
    autorizado_para_fecha: fechaOperativa(),
    campanias: [{ id: A }]
  })
  const cache = await remoto.obtenerCacheOperativa(OP, A)
  assert.equal(cache.harvest.versionContrato, 1)
  await local.guardarCache(cache)
  await local.guardarSesionLocal({
    id: S,
    sesion_id: S,
    campania_id: A,
    estado: 'ACTIVA',
    dni_operador: OP,
    dni_jabero: JABERO
  })
  const cases = crearCasosDeUso({
    offline: crearAdaptadoresOffline(),
    backend: remoto,
    estaEnLinea: () => navigator.onLine,
    generarId: () => crypto.randomUUID(),
    ahora: () => FECHA,
    registrarError() {}
  })
  const operador = { dni: OP, campania: { id: A } }
  navigator.onLine = false
  const a = await cases.asignarTicket({
    operador,
    cosechador: { dni: COSECHADOR },
    codigoTicket: lote.codigos[0]
  })
  const args = {
    operador,
    sesionLectura: { sesion_id: S, dni_jabero: JABERO },
    codigo: lote.codigos[1]
  }
  const c = await cases.registrarLecturaJaba(args)
  assert.equal(a.estado, 'PENDIENTE')
  assert.equal(c.ticket.cosechador_dni, COSECHADOR)
  assert.equal(c.total, 1)
  assert.equal(await c.sincronizar(), false)
  await assert.rejects(cases.registrarLecturaJaba(args), TicketYaUtilizado)
  const inicio = llamadas.length
  navigator.onLine = true
  await sincronizarPendientes()
  assert.deepEqual(
    llamadas.slice(inicio).map(([n]) => n),
    ['harvest_asignar_lote_tickets', 'harvest_registrar_cosecha']
  )
  assert.equal(
    (await local.obtenerEstadoHarvest(lote.codigos[1], A)).estadoServidor,
    'UTILIZADO'
  )
  assert.equal(
    (await local.obtenerColaCompleta()).filter((o) => o.estado === 'SINCRONIZADA')
      .length,
    2
  )
  const registros = (
    await db.query('select * from harvest_registros_cosecha where codigo_ticket=$1', [
      lote.codigos[1]
    ])
  ).rows
  assert.equal(registros.length, 1)
  assert.equal(registros[0].operacion_id, c.operacion.id)
  assert.equal(
    registros[0].trabajador_id,
    (await local.obtenerTrabajador(COSECHADOR)).id
  )
  assert.equal(await local.contarLecturasSesion(S), 1)
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','workforce_identidades_campania(uuid)','EXECUTE') as permiso"
      )
    ).rows[0].permiso,
    false
  )
})
