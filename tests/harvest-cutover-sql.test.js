import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { openDB } from 'idb'
import {
  prepararHarvestSql,
  A,
  SUP,
  OP,
  COSECHADOR,
  JABERO
} from './helpers/harvestSql.js'
import { crearSupabaseBackend } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js'
import { crearCasosDeUso } from '@gesgrow/harvest-client-contracts/src/application/crearCasosDeUso.js'
import { crearAdaptadoresOffline } from '@gesgrow/harvest-client-contracts/src/infrastructure/offline/crearAdaptadoresOffline.js'
import { configurarBackend } from '@gesgrow/core/backend/backend.js'
import { sincronizarPendientes } from '@gesgrow/harvest-client-contracts/src/offline/sync.js'
import * as local from '@gesgrow/harvest-client-contracts/src/offline/db.js'
import { fechaOperativa } from '@gesgrow/core/contexts/identity-access/index.js'
import {
  EscrituraLegacyRetirada,
  CampaniaSinCutover
} from '@gesgrow/core/contexts/harvest/index.js'

const db = new PGlite()
const read = (nombre) =>
  readFileSync(new URL('../supabase/migrations/' + nombre, import.meta.url), 'utf8')
const llamadas = []
const rutas = {
  harvest_obtener_snapshot: [
    ['p_campania_id', 'p_dni_operador'],
    ['uuid', 'varchar']
  ],
  obtener_cache_operativa_campania: [
    ['p_campania_id', 'p_dni_operador'],
    ['uuid', 'varchar']
  ],
  obtener_resumen_campania_campania: [
    ['p_campania_id', 'p_dni_operador', 'p_zona_horaria'],
    ['uuid', 'varchar', 'text']
  ],
  obtener_produccion_diaria_campania: [
    ['p_campania_id', 'p_dni_operador', 'p_zona_horaria'],
    ['uuid', 'varchar', 'text']
  ],
  obtener_produccion_lotes_campania: [
    ['p_campania_id', 'p_dni_operador'],
    ['uuid', 'varchar']
  ],
  obtener_ranking_cosechadores_periodo_campania: [
    ['p_campania_id', 'p_dni_operador', 'p_periodo'],
    ['uuid', 'varchar', 'text']
  ]
}
for (const nombre of [
  'harvest_asignar_lote_tickets',
  'harvest_asignar_v4',
  'asignar_ticket_campania'
])
  rutas[nombre] = [
    [
      'p_campania_id',
      'p_dni_operador',
      'p_dni_cosechador',
      'p_codigo_ticket',
      'p_operacion_id'
    ],
    ['uuid', 'varchar', 'varchar', 'text', 'uuid']
  ]
for (const nombre of [
  'harvest_registrar_cosecha',
  'harvest_registrar_v4',
  'registrar_lectura_jaba_campania'
])
  rutas[nombre] = [
    [
      'p_campania_id',
      'p_dni_operador',
      'p_sesion_id',
      'p_codigo_ticket',
      'p_lectura_id',
      'p_fecha_hora',
      'p_operacion_id'
    ],
    ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid']
  ]
const remoto = crearSupabaseBackend({
  async rpc(nombre, parametros) {
    assert.ok(rutas[nombre], 'RPC no permitido en la fixture: ' + nombre)
    llamadas.push([nombre, parametros])
    const [claves, tipos] = rutas[nombre]
    try {
      const data = (
        await db.query(
          `select ${nombre}(${tipos.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) resultado`,
          claves.map((k) => parametros[k])
        )
      ).rows[0].resultado
      return { data }
    } catch (error) {
      return {
        error: { message: error.message, code: error.code, details: error.detail }
      }
    }
  }
})
const navAnterior = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true
})
let piloto
let comandoPiloto, reciboPiloto

before(async () => {
  await prepararHarvestSql(db)
  const sesion = (
    await db.query(
      'select s.id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1',
      [A]
    )
  ).rows[0].id
  const l = await tickets({ id: A }, 'PILOTO', true)
  comandoPiloto = {
    campaniaId: A,
    dniOperador: OP,
    sesionId: sesion,
    codigoTicket: l.codigo,
    lecturaId: crypto.randomUUID(),
    operacionId: crypto.randomUUID(),
    fechaHora: '2026-10-14T12:00:00Z'
  }
  piloto = (await remoto.registrarLecturaJaba(comandoPiloto)).registro.id
  reciboPiloto = (
    await db.query('select resultado from operaciones_pda_procesadas where id=$1', [
      comandoPiloto.operacionId
    ])
  ).rows[0].resultado
  // auth.uid es un contrato de Identity simulado; no demuestra autorización
  // JWT de producción. Los demás contratos operativos SQL son los reales.
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('scc.test.auth',true),'')::uuid $$;"
  )
  await db.query("select set_config('scc.test.auth',$1,false)", [SUP])
  await db.exec(read('202610140600_harvest_cutover.sql'))
  await db.exec(read('202610140610_harvest_proyecciones.sql'))
})
after(async () => {
  await db.close()
  if (navAnterior) Object.defineProperty(globalThis, 'navigator', navAnterior)
  else delete globalThis.navigator
})

async function campania() {
  const id = crypto.randomUUID(),
    cultivo = crypto.randomUUID(),
    variedad = crypto.randomUUID(),
    lote = crypto.randomUUID(),
    sesion = crypto.randomUUID()
  await db.query('insert into cultivos(id,codigo,nombre) values($1,$2,$3)', [
    cultivo,
    cultivo.slice(0, 30),
    'Cultivo prueba'
  ])
  await db.query(
    "insert into campanias(id,codigo,nombre,estado,cultivo_id,fecha_inicio) values($1,$2,'Campaña prueba','ACTIVA',$3,current_date-10)",
    [id, id, cultivo]
  )
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)",
    [SUP, id]
  )
  await db.query(
    "insert into variedades(id,nombre,cultivo_id) values($1,'Variedad prueba',$2)",
    [variedad, cultivo]
  )
  await db.query(
    "insert into lotes(id,codigo,nombre,campania_id,variedad_id) values($1,'L1','Norte',$2,$3)",
    [lote, id, variedad]
  )
  await db.query('insert into lote_variedades(lote_id,variedad_id) values($1,$2)', [
    lote,
    variedad
  ])
  await db.query(
    'select registrar_jabero_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid)',
    [id, OP, JABERO, crypto.randomUUID()]
  )
  await db.query(
    'select iniciar_sesion_lectura_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid,$6::uuid)',
    [id, OP, JABERO, lote, sesion, variedad]
  )
  return { id, lote, sesion, variedad }
}
async function corte(c) {
  return (
    await db.query('select admin_activar_harvest_campania($1::uuid,1) resultado', [
      c.id
    ])
  ).rows[0].resultado
}
async function tickets(c, prefijo = 'NUEVO', asignar = true) {
  const id = crypto.randomUUID(),
    codigo = prefijo + '-' + crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    id,
    c.id
  ])
  await db.query(
    'insert into harvest_tickets(codigo,lote_id,campania_id) values($1,$2,$3)',
    [codigo, id, c.id]
  )
  if (asignar)
    await remoto.asignarTicket({
      campaniaId: c.id,
      dniOperador: OP,
      dniCosechador: COSECHADOR,
      codigoTicket: codigo,
      operacionId: crypto.randomUUID()
    })
  return { id, codigo }
}
async function legacy(c, cantidad = 1, codigo = 'LEG-' + crypto.randomUUID()) {
  const a = {
    campaniaId: c.id,
    dniOperador: OP,
    dniCosechador: COSECHADOR,
    codigoTicket: codigo,
    operacionId: crypto.randomUUID(),
    modeloSolicitado: 'LEGACY'
  }
  await remoto.asignarTicket(a)
  const comandos = []
  for (let i = 0; i < cantidad; i++) {
    const fechaHora = (await db.query('select clock_timestamp()::text fecha')).rows[0]
      .fecha
    const comando = {
      campaniaId: c.id,
      dniOperador: OP,
      sesionId: c.sesion,
      codigoTicket: codigo,
      lecturaId: crypto.randomUUID(),
      fechaHora,
      operacionId: crypto.randomUUID(),
      modeloSolicitado: 'LEGACY'
    }
    await remoto.registrarLecturaJaba(comando)
    comandos.push(comando)
  }
  return { a, comandos, codigo }
}
async function registrar(c, t, fechaHora = new Date().toISOString(), cambios = {}) {
  return remoto.registrarLecturaJaba({
    campaniaId: c.id,
    dniOperador: OP,
    sesionId: c.sesion,
    codigoTicket: t.codigo,
    lecturaId: crypto.randomUUID(),
    operacionId: crypto.randomUUID(),
    fechaHora,
    ...cambios
  })
}
async function sinRecibo(id) {
  for (const tabla of ['operaciones_pda_campania', 'operaciones_pda_procesadas'])
    assert.equal(
      (await db.query(`select count(*)::int n from ${tabla} where id=$1`, [id])).rows[0]
        .n,
      0
    )
}
async function hechos(c) {
  return (
    await db.query(
      'select * from harvest_produccion_reportable where campania_id=$1 order by hecho_id',
      [c.id]
    )
  ).rows
}
async function resumen(c) {
  return remoto.obtenerResumenCampania({
    campaniaId: c.id,
    dniOperador: OP,
    zonaHoraria: 'America/Lima'
  })
}

test('aplicar F5.6 no activa ninguna campaña ni convierte los registros piloto anteriores', async () => {
  assert.equal(
    (await db.query('select count(*)::int n from harvest_cutovers')).rows[0].n,
    0
  )
  assert.equal(
    (
      await db.query(
        'select version_produccion from harvest_registros_cosecha where id=$1',
        [piloto]
      )
    ).rows[0].version_produccion,
    null
  )
  assert.equal((await remoto.obtenerSnapshotHarvest(OP, A)).cutover, null)
  assert.equal((await resumen({ id: A })).resumen.total_jabas, 0)
})

test('campaña sin migrar: producción legacy, repeticiones y rechazo de RegistroCosecha nuevo', async () => {
  const c = await campania()
  await legacy(c, 2)
  const t = await tickets(c)
  const op = crypto.randomUUID()
  await assert.rejects(
    registrar(c, t, undefined, { operacionId: op }),
    CampaniaSinCutover
  )
  await sinRecibo(op)
  assert.equal((await resumen(c)).resumen.total_jabas, 2)
  assert.equal((await hechos(c)).length, 2)
  assert.ok((await hechos(c)).every((f) => f.fuente === 'LEGACY'))
  assert.equal((await remoto.obtenerSnapshotHarvest(OP, c.id)).cutover, null)
})

test('recibo Harvest piloto perdido se confirma tras el corte sin convertirlo ni alterar el recibo', async () => {
  await corte({ id: A })
  const ack = await remoto.registrarLecturaJaba({
    ...comandoPiloto,
    compatibilidadV4: true
  })
  assert.equal(ack.registro.id, piloto)
  assert.equal(ack.registro.versionProduccion, null)
  assert.equal(ack.ticket.estado, 'UTILIZADO')
  assert.deepEqual(
    (
      await db.query('select resultado from operaciones_pda_procesadas where id=$1', [
        comandoPiloto.operacionId
      ])
    ).rows[0].resultado,
    reciboPiloto
  )
  assert.equal((await resumen({ id: A })).resumen.total_jabas, 0)
  assert.equal(
    (await remoto.obtenerSnapshotHarvest(OP, A)).registrosCosecha.find(
      (r) => r.id === piloto
    ).versionProduccion,
    null
  )
  await assert.rejects(
    db.query('update harvest_registros_cosecha set version_produccion=1 where id=$1', [
      piloto
    ]),
    /inmutable/
  )
})

test('última escritura anterior y primera posterior al corte usan fuentes y versiones disjuntas', async () => {
  const c = await campania()
  const anterior = await legacy(c)
  const antes = (await db.query('select clock_timestamp()::text fecha')).rows[0].fecha
  const policy = await corte(c)
  const t = await tickets(c)
  const despues = await registrar(c, t, policy.activadoEn)
  const fechaCreacion = (
    await db.query(
      'select r.version_produccion,r.creado_en>=c.activado_en coherente from harvest_registros_cosecha r join harvest_cutovers c on c.campania_id=r.campania_id where r.id=$1',
      [despues.registro.id]
    )
  ).rows[0]
  assert.equal(fechaCreacion.version_produccion, 1)
  assert.equal(despues.registro.versionProduccion, 1)
  assert.ok(Date.parse(antes) <= Date.parse(policy.activadoEn))
  assert.equal(fechaCreacion.coherente, true)
  const filas = await hechos(c)
  assert.equal(filas.length, 2)
  assert.equal(
    filas.find((f) => f.hecho_id === anterior.comandos[0].lecturaId).fuente,
    'LEGACY'
  )
  assert.equal(filas.find((f) => f.hecho_id === despues.registro.id).fuente, 'HARVEST')
  const nuevo = crypto.randomUUID()
  await assert.rejects(
    remoto.registrarLecturaJaba({
      ...anterior.comandos[0],
      operacionId: nuevo,
      lecturaId: crypto.randomUUID(),
      fechaHora: antes
    }),
    EscrituraLegacyRetirada
  )
  await sinRecibo(nuevo)
})

test('corte ya activado es idempotente, auditado y no puede moverse de instante/versión', async () => {
  const c = await campania()
  const primero = await corte(c)
  assert.deepEqual(await corte(c), primero)
  assert.equal(primero.activadoPor, SUP)
  await assert.rejects(
    db.query('select admin_activar_harvest_campania($1,2)', [c.id]),
    /no soportada/
  )
  await assert.rejects(
    db.query(
      "update harvest_cutovers set activado_en=activado_en-interval '1 day' where campania_id=$1",
      [c.id]
    ),
    /inmutable/
  )
  await assert.rejects(
    db.query('delete from harvest_cutovers where campania_id=$1', [c.id]),
    /inmutable/
  )
  assert.deepEqual(await corte(c), primero)
})

test('rollback del corte restaura política y tupla de campaña y permite continuar en legacy', async () => {
  const c = await campania()
  const antes = (await db.query('select updated_at from campanias where id=$1', [c.id]))
    .rows[0]
  await db.exec('begin')
  try {
    await corte(c)
    assert.equal((await remoto.obtenerSnapshotHarvest(OP, c.id)).cutover.version, 1)
  } finally {
    await db.exec('rollback')
  }
  assert.equal((await remoto.obtenerSnapshotHarvest(OP, c.id)).cutover, null)
  assert.deepEqual(
    (await db.query('select updated_at from campanias where id=$1', [c.id])).rows[0],
    antes
  )
  await legacy(c)
  assert.equal((await resumen(c)).resumen.total_jabas, 1)
})

test('RegistroCosecha productivo no permite modificar versión, borrar ni convertir registros previos', async () => {
  const c = await campania()
  await corte(c)
  const t = await tickets(c),
    r = await registrar(c, t)
  await assert.rejects(
    db.query(
      'update harvest_registros_cosecha set version_produccion=null where id=$1',
      [r.registro.id]
    ),
    /inmutable/
  )
  await assert.rejects(
    db.query(
      "update harvest_registros_cosecha set creado_en=now()-interval '1 year' where id=$1",
      [r.registro.id]
    ),
    /inmutable/
  )
  await assert.rejects(
    db.query('delete from harvest_registros_cosecha where id=$1', [r.registro.id]),
    /inmutable/
  )
  assert.equal((await resumen(c)).resumen.total_jabas, 1)
})

test('los cuatro reportes atraviesan el corte sin doble conteo y unifican la identidad del trabajador', async () => {
  const c = await campania()
  const historico = await legacy(c, 3)
  const antes = (
    await db.query('select * from lecturas_jaba where sesion_id=$1 order by id', [
      c.sesion
    ])
  ).rows
  const policy = await corte(c)
  const t1 = await tickets(c),
    t2 = await tickets(c)
  const fechaAntes = (
    await db.query("select ($1::timestamptz-interval '1 microsecond')::text fecha", [
      policy.activadoEn
    ])
  ).rows[0].fecha
  const fechaDespues = (
    await db.query("select ($1::timestamptz+interval '1 microsecond')::text fecha", [
      policy.activadoEn
    ])
  ).rows[0].fecha
  await registrar(c, t1, fechaAntes)
  await registrar(c, t2, fechaDespues)
  const r = await resumen(c)
  assert.equal(r.resumen.total_jabas, 5)
  assert.equal(r.resumen.total_cosechadores, 1)
  assert.equal(r.resumen.total_sesiones, 1)
  assert.equal(r.resumen.total_lotes, 1)
  const ranking = await remoto.obtenerRankingCosechadores({
    campaniaId: c.id,
    dniOperador: OP,
    periodo: 'CAMPANIA'
  })
  assert.equal(ranking.ranking.length, 1)
  assert.equal(ranking.ranking[0].total_jabas, 5)
  assert.equal(ranking.ranking[0].cosechador_dni, COSECHADOR)
  const diaria = await remoto.obtenerProduccionDiaria({
    campaniaId: c.id,
    dniOperador: OP,
    zonaHoraria: 'America/Lima'
  })
  assert.equal(
    diaria.produccion.reduce((n, d) => n + d.total_jabas, 0),
    5
  )
  const lotes = await remoto.obtenerProduccionLotes({
    campaniaId: c.id,
    dniOperador: OP
  })
  assert.equal(lotes.produccion.length, 1)
  assert.equal(lotes.produccion[0].total_jabas, 5)
  assert.equal(lotes.produccion[0].lote_id, c.lote)
  assert.equal(lotes.produccion[0].variedad_id, c.variedad)
  assert.notEqual(lotes.produccion[0].lote_id, t1.id)
  assert.deepEqual(
    (
      await db.query('select * from lecturas_jaba where sesion_id=$1 order by id', [
        c.sesion
      ])
    ).rows,
    antes
  )
  assert.equal(historico.comandos.length, 3)
  assert.equal(new Set((await hechos(c)).map((f) => f.hecho_id)).size, 5)
})

test('legado congelado rechaza DML directo y RPC anteriores, incluidos registros con fecha anterior al corte', async () => {
  const c = await campania()
  const h = await legacy(c)
  await corte(c)
  const asignada = (
    await db.query('select id from asignaciones_ticket where codigo_ticket=$1', [
      h.codigo
    ])
  ).rows[0].id
  for (const sql of [
    'update lecturas_jaba set fecha_hora=fecha_hora where id=$1',
    'delete from lecturas_jaba where id=$1'
  ])
    await assert.rejects(db.query(sql, [h.comandos[0].lecturaId]), /solo_lectura/)
  for (const sql of [
    'update asignaciones_ticket set codigo_ticket=codigo_ticket where id=$1',
    'delete from asignaciones_ticket where id=$1'
  ])
    await assert.rejects(db.query(sql, [asignada]), /solo_lectura/)
  await assert.rejects(
    db.query(
      "insert into lecturas_jaba(id,asignacion_ticket_id,sesion_id,fecha_hora) values($1,$2,$3,now()-interval '1 year')",
      [crypto.randomUUID(), asignada, c.sesion]
    ),
    /solo_lectura/
  )
  await assert.rejects(
    db.query(
      'insert into asignaciones_ticket(codigo_ticket,campania_id) values($1,$2)',
      ['NUEVA-' + crypto.randomUUID(), c.id]
    ),
    /solo_lectura/
  )
  await assert.rejects(
    db.query(
      'select asignar_ticket_campania($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::uuid)',
      [c.id, OP, COSECHADOR, 'DIRECTA-' + crypto.randomUUID(), crypto.randomUUID()]
    ),
    /solo_lectura/
  )
  for (const tabla of ['lecturas_jaba', 'asignaciones_ticket', 'harvest_cutovers'])
    await assert.rejects(db.exec('truncate ' + tabla + ' cascade'), /TRUNCATE/)
  assert.equal((await resumen(c)).resumen.total_jabas, 1)
})

test('compatibilidad antigua confirma recibos legacy anteriores sin escritura y rechaza pendientes legacy nuevos', async () => {
  const c = await campania()
  const h = await legacy(c, 2)
  await corte(c)
  const antes = await hechos(c)
  const args = { ...h.a, modeloSolicitado: undefined, compatibilidadV4: true }
  assert.equal((await remoto.asignarTicket(args)).legacy, true)
  for (const command of h.comandos)
    assert.equal(
      (
        await remoto.registrarLecturaJaba({
          ...command,
          modeloSolicitado: undefined,
          compatibilidadV4: true
        })
      ).legacy,
      true
    )
  const id = crypto.randomUUID()
  await assert.rejects(
    remoto.registrarLecturaJaba({
      ...h.comandos[0],
      modeloSolicitado: undefined,
      compatibilidadV4: true,
      operacionId: id,
      lecturaId: crypto.randomUUID()
    }),
    EscrituraLegacyRetirada
  )
  await sinRecibo(id)
  assert.deepEqual(await hechos(c), antes)
})

test('comandos antiguos con tickets Harvest funcionan después del corte y mantienen idempotencia', async () => {
  const c = await campania()
  await corte(c)
  const t = await tickets(c, 'V4', false)
  const a = {
    campaniaId: c.id,
    dniOperador: OP,
    dniCosechador: COSECHADOR,
    codigoTicket: t.codigo,
    operacionId: crypto.randomUUID(),
    compatibilidadV4: true
  }
  await remoto.asignarTicket(a)
  await remoto.asignarTicket(a)
  const command = {
    campaniaId: c.id,
    dniOperador: OP,
    sesionId: c.sesion,
    codigoTicket: t.codigo,
    lecturaId: crypto.randomUUID(),
    fechaHora: new Date().toISOString(),
    operacionId: crypto.randomUUID(),
    compatibilidadV4: true
  }
  const primero = await remoto.registrarLecturaJaba(command),
    segundo = await remoto.registrarLecturaJaba(command)
  assert.equal(primero.registro.id, segundo.registro.id)
  assert.equal((await hechos(c)).length, 1)
  assert.equal((await hechos(c))[0].fuente, 'HARVEST')
})

test('un hecho legacy no puede reutilizar su ID como RegistroCosecha productivo', async () => {
  const c = await campania()
  const h = await legacy(c)
  await corte(c)
  const t = await tickets(c)
  const op = crypto.randomUUID()
  await assert.rejects(
    registrar(c, t, undefined, { lecturaId: h.comandos[0].lecturaId, operacionId: op }),
    /identidad_de_hecho/
  )
  await sinRecibo(op)
  assert.equal((await hechos(c)).length, 1)
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1',
        [t.codigo]
      )
    ).rows[0].n,
    0
  )
})

test('corte por campaña no cierra escrituras ni mezcla reportes de otra campaña', async () => {
  const c = await campania(),
    otra = await campania()
  await legacy(c)
  await corte(c)
  const t = await tickets(c)
  await registrar(c, t)
  await legacy(otra, 3)
  assert.equal((await resumen(c)).resumen.total_jabas, 2)
  assert.equal((await resumen(otra)).resumen.total_jabas, 3)
  assert.equal((await remoto.obtenerSnapshotHarvest(OP, otra.id)).cutover, null)
})

test('activación exige el contrato administrativo y los reportes mantienen autorización/scoping', async () => {
  const c = await campania()
  await db.exec("set scc.test.integracion='false'")
  try {
    await assert.rejects(corte(c), /no autorizada/)
  } finally {
    await db.exec("set scc.test.integracion='true'")
  }
  assert.equal((await remoto.obtenerSnapshotHarvest(OP, c.id)).cutover, null)
  await assert.rejects(
    remoto.obtenerResumenCampania({
      campaniaId: c.id,
      dniOperador: '00000000',
      zonaHoraria: 'America/Lima'
    }),
    /no está autorizado/
  )
  await assert.rejects(
    remoto.obtenerProduccionDiaria({
      campaniaId: c.id,
      dniOperador: OP,
      zonaHoraria: 'INEXISTENTE'
    }),
    /Zona horaria/
  )
  const permisos = (
    await db.query(
      "select has_function_privilege('anon','admin_activar_harvest_campania(uuid,integer)','EXECUTE') anon,has_function_privilege('authenticated','admin_activar_harvest_campania(uuid,integer)','EXECUTE') authenticated,has_table_privilege('anon','harvest_produccion_reportable','SELECT') vista"
    )
  ).rows[0]
  assert.deepEqual(permisos, { anon: false, authenticated: true, vista: false })
})

test('reportes administrativos conservan comparaciones de ranking y acceso a campaña cerrada', async () => {
  const c = await campania()
  await legacy(c, 2)
  await corte(c)
  const t = await tickets(c)
  await registrar(c, t)
  await db.query("update campanias set estado='CERRADA' where id=$1", [c.id])
  await db.query(
    "select set_config('scc.campania_id',$1,false),set_config('scc.hoja_campania_id',$1,false)",
    [c.id]
  )
  try {
    const r = (
      await db.query(
        "select admin_obtener_ranking_cosechadores_periodo('CAMPANIA','America/Lima') r"
      )
    ).rows[0].r
    assert.equal(r.ranking[0].total_jabas, 3)
    assert.ok(Object.hasOwn(r, 'comparacion_disponible'))
    assert.ok(Object.hasOwn(r.ranking[0], 'posicion_anterior'))
    assert.equal(
      (await db.query("select admin_obtener_resumen_campania('America/Lima') r"))
        .rows[0].r.resumen.total_jabas,
      3
    )
    assert.equal(
      (
        await db.query("select admin_obtener_produccion_diaria('America/Lima') r")
      ).rows[0].r.produccion.reduce((n, d) => n + d.total_jabas, 0),
      3
    )
    assert.equal(
      (await db.query('select admin_obtener_produccion_lotes() r')).rows[0].r
        .produccion[0].total_jabas,
      3
    )
  } finally {
    await db.exec("set scc.campania_id=''; set scc.hoja_campania_id='';")
  }
})

test('PDA enruta por política, conserva pendientes antiguos y reconcilia su rechazo tras activar el corte', async () => {
  const c = await campania()
  const connection = await openDB('scc', 5)
  const tx = connection.transaction([...connection.objectStoreNames], 'readwrite')
  for (const nombre of connection.objectStoreNames) await tx.objectStore(nombre).clear()
  await tx.done
  connection.close()
  configurarBackend(remoto)
  await local.seleccionarCampaniaLocal(c.id)
  await local.guardarOperador({
    dni: OP,
    autorizado_para_fecha: fechaOperativa(),
    campanias: [{ id: c.id }]
  })
  await local.guardarCache(await remoto.obtenerCacheOperativa(OP, c.id))
  await local.guardarSesionLocal({
    id: c.sesion,
    sesion_id: c.sesion,
    estado: 'ACTIVA',
    dni_operador: OP,
    dni_jabero: JABERO,
    campania_id: c.id
  })
  const cases = crearCasosDeUso({
    backend: remoto,
    offline: crearAdaptadoresOffline(),
    generarId: () => crypto.randomUUID(),
    ahora: () => new Date().toISOString(),
    estaEnLinea: () => navigator.onLine,
    registrarError() {}
  })
  const operador = { dni: OP, campania: { id: c.id } },
    sesionLectura = { sesion_id: c.sesion, dni_jabero: JABERO }
  const codigo = 'PDA-LEGACY-' + crypto.randomUUID()
  const a = await cases.asignarTicket({
    operador,
    cosechador: { dni: COSECHADOR },
    codigoTicket: codigo
  })
  await a.sincronizar()
  navigator.onLine = false
  const c1 = await cases.registrarLecturaJaba({ operador, sesionLectura, codigo })
  const c2 = await cases.registrarLecturaJaba({ operador, sesionLectura, codigo })
  assert.equal(c2.total, 2)
  assert.equal(c1.operacion.modelo, 'LEGACY')
  const original = c1.operacion.payload
  await corte(c)
  await local.guardarCache(await remoto.obtenerCacheOperativa(OP, c.id))
  assert.deepEqual(
    (await local.obtenerColaCompleta()).find((o) => o.id === c1.operacion.id).payload,
    original
  )
  assert.equal(await local.contarLecturasSesion(c.sesion), 0)
  navigator.onLine = true
  await sincronizarPendientes()
  await sincronizarPendientes()
  const rechazadas = await local.obtenerColaCompleta()
  assert.equal(rechazadas.find((o) => o.id === c1.operacion.id).estado, 'ERROR')
  assert.equal(rechazadas.find((o) => o.id === c2.operacion.id).estado, 'ERROR')
  assert.equal(await local.contarLecturasSesion(c.sesion), 0)
  assert.equal((await local.obtenerLecturasSesionCompletas(c.sesion)).length, 2)
  assert.equal((await hechos(c)).length, 0)
  await assert.rejects(
    local.guardarAsignacionOffline({
      codigoTicket: 'PROHIBIDO',
      cosechadorDni: COSECHADOR,
      dniOperador: OP
    }),
    EscrituraLegacyRetirada
  )
  await assert.rejects(
    local.registrarLecturaOffline(
      {
        id: crypto.randomUUID(),
        sesion_id: c.sesion,
        codigo_ticket: codigo,
        fecha_hora: new Date().toISOString()
      },
      OP
    ),
    EscrituraLegacyRetirada
  )
  const nuevo = await tickets(c, 'PDA-NUEVO', false)
  await local.guardarCache(await remoto.obtenerCacheOperativa(OP, c.id))
  navigator.onLine = false
  const lote = await cases.asignarTicket({
    operador,
    cosechador: { dni: COSECHADOR },
    codigoTicket: nuevo.codigo
  })
  const cosecha = await cases.registrarLecturaJaba({
    operador,
    sesionLectura,
    codigo: nuevo.codigo
  })
  assert.equal(lote.operacion.modelo, 'HARVEST')
  assert.equal(cosecha.operacion.modelo, 'HARVEST')
  assert.equal(cosecha.total, 1)
  await assert.rejects(
    cases.registrarLecturaJaba({ operador, sesionLectura, codigo: nuevo.codigo }),
    /utilizado/
  )
  navigator.onLine = true
  await sincronizarPendientes()
  assert.equal(
    (await local.obtenerEstadoHarvest(nuevo.codigo)).estadoServidor,
    'UTILIZADO'
  )
  assert.equal(await local.contarLecturasSesion(c.sesion), 1)
  assert.equal((await resumen(c)).resumen.total_jabas, 1)
})
