import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const pureSource = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'ReportesPure.gs'),
  'utf8'
)
const reportesSource = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'Reportes.gs'),
  'utf8'
)
const menuSource = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'Menu.gs'),
  'utf8'
)
const codeSource = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'Code.gs'),
  'utf8'
)
const sql = fs.readFileSync(
  path.join(dirname, '..', 'supabase', 'migrations', '20260930_admin_reportes_sheets.sql'),
  'utf8'
)

const contexto = vm.createContext({
  Date,
  Error,
  Object,
  Array,
  String,
  Number,
  RegExp,
  Math,
  isNaN
})
vm.runInContext(pureSource, contexto)

const {
  convertirFechaCalendarioReporteParaHojaScc_,
  convertirTimestampReporteParaHojaScc_,
  crearPayloadProduccionDiariaReporteScc_,
  crearPayloadResumenReporteScc_,
  ejecutarActualizacionReportesScc_,
  esHojaReporteScc_,
  normalizarProduccionDiariaReporteScc_,
  normalizarProduccionLotesReporteScc_,
  normalizarRankingReporteScc_,
  normalizarResumenReporteScc_
} = contexto

const UUID_CAMPANIA = '11111111-1111-4111-8111-111111111111'
const UUID_LOTE = '22222222-2222-4222-8222-222222222222'

function respuestaResumen(overrides = {}) {
  return {
    ok: true,
    campania: {
      id: UUID_CAMPANIA,
      nombre: 'Arándanos 2026',
      fecha_inicio: '2026-08-01'
    },
    zona_horaria: 'America/Lima',
    resumen: {
      total_jabas: 8450,
      total_cosechadores: 120,
      total_lotes: 4,
      total_sesiones: 37,
      dias_con_produccion: 6,
      ultima_lectura: '2026-09-30T15:42:00Z'
    },
    ...overrides
  }
}

function metadatosRanking() {
  return {
    periodo: 'CAMPANIA', zona_horaria: 'America/Lima',
    fecha_desde: '2026-08-01', fecha_hasta: '2026-09-30',
    comparacion_disponible: true,
    fecha_anterior_desde: '2026-08-01', fecha_anterior_hasta: '2026-09-29'
  }
}

test('autorización SQL usa puede_consultar_reportes y auth.uid()', () => {
  const cuerpo = sql.match(
    /create or replace function public\.autorizar_integracion_reportes\(\)[\s\S]*?end;\s*\$\$;/i
  )?.[0]
  assert.ok(cuerpo)
  assert.match(cuerpo, /auth\.uid\(\)/)
  assert.match(cuerpo, /ia\.activo = true/)
  assert.match(cuerpo, /ia\.puede_consultar_reportes = true/)
  assert.match(cuerpo, /Integración no autorizada para consultar reportes/)
  assert.doesNotMatch(cuerpo, /puede_gestionar_maestros/)
})

test('migración agrega permiso de reportes con default false', () => {
  assert.match(
    sql,
    /add column if not exists puede_consultar_reportes boolean not null default false;/i
  )
  assert.doesNotMatch(sql, /update\s+public\.integraciones_api[\s\S]*puede_consultar_reportes\s*=\s*true/i)
})

test('las cuatro RPC administrativas exigen autorización de reportes', () => {
  const funciones = [
    'admin_obtener_resumen_campania',
    'admin_obtener_ranking_cosechadores',
    'admin_obtener_produccion_diaria',
    'admin_obtener_produccion_lotes'
  ]
  funciones.forEach((nombre) => {
    const inicio = sql.indexOf(`create or replace function public.${nombre}`)
    assert.ok(inicio >= 0, nombre)
    const siguiente = sql.indexOf('create or replace function public.', inicio + 1)
    const cuerpo = sql.slice(inicio, siguiente >= 0 ? siguiente : sql.length)
    assert.match(cuerpo, /perform public\.autorizar_integracion_reportes\(\);/, nombre)
    assert.match(cuerpo, /security definer/i, nombre)
    assert.match(cuerpo, /set search_path = public/i, nombre)
  })
})

test('RPCs administrativas no conceden EXECUTE a anon', () => {
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?\bto\s+anon\b/i)
  assert.equal((sql.match(/to authenticated;/gi) || []).length, 4)
  assert.match(sql, /from public, anon, authenticated;/i)
})

test('migración no concede SELECT directo sobre tablas', () => {
  assert.doesNotMatch(sql, /grant\s+select\s+on/i)
  assert.doesNotMatch(sql, /service_role/i)
})

test('resumen se normaliza con métricas y fecha de campaña', () => {
  const resultado = normalizarResumenReporteScc_(respuestaResumen())
  assert.equal(resultado.campania.nombre, 'Arándanos 2026')
  assert.equal(resultado.campania.fechaInicio, '2026-08-01')
  assert.equal(resultado.resumen.totalJabas, 8450)
  assert.equal(resultado.resumen.totalCosechadores, 120)
  assert.equal(resultado.resumen.ultimaLectura, '2026-09-30T15:42:00Z')
})

test('resumen acepta cero producción y última lectura nula', () => {
  const base = respuestaResumen()
  base.resumen = {
    total_jabas: 0,
    total_cosechadores: 0,
    total_lotes: 0,
    total_sesiones: 0,
    dias_con_produccion: 0,
    ultima_lectura: null
  }
  const resultado = normalizarResumenReporteScc_(base)
  assert.equal(resultado.resumen.totalJabas, 0)
  assert.equal(resultado.resumen.ultimaLectura, null)
})

test('ranking se normaliza y preserva posición enviada por servidor', () => {
  const resultado = normalizarRankingReporteScc_({
    ...metadatosRanking(),
    ok: true,
    campania: 'Arándanos 2026',
    ranking: [{
      posicion: 3,
      cosechador_dni: '71234567',
      cosechador: 'Ana Pérez',
      total_jabas: 50,
      ultima_lectura: '2026-09-30T15:42:00Z'
    }]
  })
  assert.equal(resultado.ranking[0].posicion, 3)
  assert.equal(resultado.ranking[0].totalJabas, 50)
})

test('ranking vacío es un estado válido', () => {
  const resultado = normalizarRankingReporteScc_({
    ...metadatosRanking(),
    ok: true,
    campania: 'Arándanos 2026',
    ranking: []
  })
  assert.deepEqual(Array.from(resultado.ranking), [])
})

function respuestaRankingProvisional() {
  return {
    ...metadatosRanking(),
    ok: true,
    campania: 'Arándanos 2026',
    ranking: [
      { posicion: 1, cosechador_dni: '71234567', cosechador: ' Ana Pérez ', total_jabas: 50, ultima_lectura: '2026-09-30T15:42:00Z' },
      ...['', '   ', null, undefined].map((nombre, indice) => ({
        posicion: 2,
        cosechador_dni: `0123456${indice}`,
        cosechador: nombre,
        total_jabas: 20,
        ultima_lectura: '2026-09-30T15:40:00Z'
      }))
    ]
  }
}

test('ranking mixto acepta provisionales sin nombre sin perder posiciones ni jabas', () => {
  const respuesta = respuestaRankingProvisional()
  const resultado = normalizarRankingReporteScc_(respuesta)
  assert.equal(resultado.ranking.length, respuesta.ranking.length)
  resultado.ranking.forEach((fila, indice) => {
    const original = respuesta.ranking[indice]
    assert.equal(fila.posicion, original.posicion)
    assert.equal(fila.cosechadorDni, original.cosechador_dni)
    assert.equal(fila.totalJabas, original.total_jabas)
    assert.equal(fila.ultimaLectura, original.ultima_lectura)
    assert.equal(fila.cosechador, indice === 0 ? 'Ana Pérez' : 'ASIGNAR NOMBRE')
    assert.equal(original.cosechador, indice === 0 ? ' Ana Pérez ' : ['', '   ', null, undefined][indice - 1])
  })
})

test('ranking provisional continúa validando DNI, posición, jabas y última lectura', () => {
  const invalidos = [
    { cosechador_dni: '' },
    { posicion: -1 },
    { total_jabas: 'incorrecto' },
    { ultima_lectura: 'incorrecto' }
  ]
  invalidos.forEach((cambios) => {
    const respuesta = respuestaRankingProvisional()
    Object.assign(respuesta.ranking[1], cambios)
    assert.throws(() => normalizarRankingReporteScc_(respuesta), /Respuesta inválida/)
  })
})

test('actualizar ranking escribe también provisionales y luego recupera el nombre oficial', () => {
  const escrituras = []
  const hoja = {
    getFilter: () => null,
    getMaxRows: () => 1000,
    getLastRow: () => 20,
    setConditionalFormatRules() {},
    getRange: (...rango) => ({
      setValues(valores) { escrituras.push({ rango, valores }); return this },
      setValue() { return this },
      clearContent() { return this },
      clearFormat() { return this },
      setFontWeight() { return this },
      setNumberFormat() { return this },
      setWrap() { return this },
      createFilter() { return this }
    })
  }
  const contextoEscritura = vm.createContext({ Date, SCC_CONFIG: { hojaRanking: 'RANKING' } })
  vm.runInContext(pureSource + '\n' + reportesSource, contextoEscritura)
  contextoEscritura.configurarHojaRanking_ = () => hoja
  contextoEscritura.SpreadsheetApp = {
    newConditionalFormatRule: () => {
      const regla = {
        whenFormulaSatisfied() { return this }, setBackground() { return this },
        setBold() { return this }, setRanges() { return this }, build() { return this },
        whenTextContains() { return this }, setFontColor() { return this }
      }
      return regla
    }
  }
  const respuesta = respuestaRankingProvisional()
  const actualizar = () => contextoEscritura.ejecutarActualizacionReportesScc_([{
    nombre: 'RANKING',
    consultar: () => respuesta,
    normalizar: contextoEscritura.normalizarRankingReporteScc_,
    escribir: contextoEscritura.escribirRankingReporte_
  }])
  assert.equal(actualizar()[0].ok, true)
  const filas = escrituras.find(({ rango }) => rango[0] === 12 && rango[3] === 6).valores
  assert.equal(filas.length, 5)
  assert.equal(filas[0][2], 'Ana Pérez')
  assert.deepEqual(Array.from(filas[1]).slice(0, 4), [2, '01234560', 'ASIGNAR NOMBRE', 20])
  assert.equal(filas[1][4].toISOString(), '2026-09-30T15:40:00.000Z')
  respuesta.ranking[1].cosechador = 'Fausto Rodríguez'
  escrituras.length = 0
  assert.equal(actualizar()[0].ok, true)
  const nuevas = escrituras.find(({ rango }) => rango[0] === 12 && rango[3] === 6).valores
  assert.equal(nuevas[1][2], 'Fausto Rodríguez')
  assert.equal(nuevas[1][3], 20)
})

test('producción diaria se normaliza sin reordenar filas', () => {
  const resultado = normalizarProduccionDiariaReporteScc_({
    ok: true,
    campania: { id: UUID_CAMPANIA, nombre: 'Arándanos 2026' },
    zona_horaria: 'America/Lima',
    produccion: [
      { fecha: '2026-09-30', total_jabas: 100, total_cosechadores: 8, total_sesiones: 2 },
      { fecha: '2026-09-29', total_jabas: 90, total_cosechadores: 7, total_sesiones: 2 }
    ]
  })
  assert.equal(resultado.produccion[0].fecha, '2026-09-30')
  assert.equal(resultado.produccion[1].fecha, '2026-09-29')
})

test('producción diaria vacía es válida', () => {
  const resultado = normalizarProduccionDiariaReporteScc_({
    ok: true,
    campania: { id: UUID_CAMPANIA, nombre: 'Arándanos 2026' },
    zona_horaria: 'America/Lima',
    produccion: []
  })
  assert.deepEqual(Array.from(resultado.produccion), [])
})

test('producción por lotes se normaliza', () => {
  const resultado = normalizarProduccionLotesReporteScc_({
    ok: true,
    campania: { id: UUID_CAMPANIA, nombre: 'Arándanos 2026' },
    produccion: [{
      lote_id: UUID_LOTE,
      lote_codigo: 'L-01',
      lote_nombre: 'Norte',
      variedad: 'Biloxi',
      total_jabas: 500,
      total_cosechadores: 20,
      total_sesiones: 4,
      ultima_lectura: '2026-09-30T15:42:00Z'
    }]
  })
  assert.equal(resultado.produccion[0].loteCodigo, 'L-01')
  assert.equal(resultado.produccion[0].totalJabas, 500)
})

test('producción por lotes vacía es válida', () => {
  const resultado = normalizarProduccionLotesReporteScc_({
    ok: true,
    campania: { id: UUID_CAMPANIA, nombre: 'Arándanos 2026' },
    produccion: []
  })
  assert.deepEqual(Array.from(resultado.produccion), [])
})

test('timezone del Spreadsheet se envía a resumen', () => {
  assert.deepEqual(
    { ...crearPayloadResumenReporteScc_('Pacific/Auckland') },
    { p_zona_horaria: 'Pacific/Auckland' }
  )
  assert.match(reportesSource, /getSpreadsheetTimeZone\(\)/)
})

test('timezone del Spreadsheet se envía a producción diaria', () => {
  assert.deepEqual(
    { ...crearPayloadProduccionDiariaReporteScc_('Europe/Madrid') },
    { p_zona_horaria: 'Europe/Madrid' }
  )
})

test('YYYY-MM-DD se convierte como fecha calendario sin pasar por UTC', () => {
  let argumentos = null
  const marcador = { fecha: 'local' }
  const resultado = convertirFechaCalendarioReporteParaHojaScc_(
    '2026-09-30',
    (texto, zona, formato) => {
      argumentos = { texto, zona, formato }
      return marcador
    },
    'Pacific/Kiritimati'
  )
  assert.equal(resultado, marcador)
  assert.deepEqual(argumentos, {
    texto: '2026-09-30',
    zona: 'Pacific/Kiritimati',
    formato: 'yyyy-MM-dd'
  })
})

test('timestamptz se convierte como instante real', () => {
  const resultado = convertirTimestampReporteParaHojaScc_(
    '2026-09-30T10:42:00-05:00',
    (texto) => new Date(texto)
  )
  assert.equal(resultado.toISOString(), '2026-09-30T15:42:00.000Z')
})

test('las cuatro hojas se reconocen como reportes y maestros no', () => {
  assert.equal(esHojaReporteScc_('RESUMEN'), true)
  assert.equal(esHojaReporteScc_('RANKING'), true)
  assert.equal(esHojaReporteScc_('PRODUCCION_DIARIA'), true)
  assert.equal(esHojaReporteScc_('PRODUCCION_LOTES'), true)
  assert.equal(esHojaReporteScc_('TRABAJADORES'), false)
})

test('onEdit corta antes de marcar PENDIENTE una hoja de reporte', () => {
  const corte = codeSource.indexOf('esHojaReporteScc_(e.range.getSheet().getName())')
  const trabajadores = codeSource.indexOf('marcarEdicionTrabajadores_(e)')
  assert.ok(corte >= 0)
  assert.ok(trabajadores > corte)
})

test('código de reportes no contiene estado PENDIENTE', () => {
  assert.doesNotMatch(reportesSource + pureSource, /PENDIENTE/)
})

test('error en RESUMEN no impide ejecutar los otros reportes', () => {
  const ejecutados = []
  const resultados = ejecutarActualizacionReportesScc_([
    {
      nombre: 'RESUMEN',
      consultar: () => { throw new Error('falló resumen') },
      normalizar: (valor) => valor,
      escribir: () => ejecutados.push('RESUMEN')
    },
    ...['RANKING', 'PRODUCCION_DIARIA', 'PRODUCCION_LOTES'].map((nombre) => ({
      nombre,
      consultar: () => ({ ok: true }),
      normalizar: (valor) => valor,
      escribir: () => ejecutados.push(nombre)
    }))
  ])
  assert.equal(resultados[0].ok, false)
  assert.deepEqual(ejecutados, ['RANKING', 'PRODUCCION_DIARIA', 'PRODUCCION_LOTES'])
})

test('error en RANKING no impide ejecutar producción diaria ni lotes', () => {
  const ejecutados = []
  const resultados = ejecutarActualizacionReportesScc_([
    {
      nombre: 'RESUMEN',
      consultar: () => 1,
      normalizar: (valor) => valor,
      escribir: () => ejecutados.push('RESUMEN')
    },
    {
      nombre: 'RANKING',
      consultar: () => { throw new Error('falló ranking') },
      normalizar: (valor) => valor,
      escribir: () => ejecutados.push('RANKING')
    },
    ...['PRODUCCION_DIARIA', 'PRODUCCION_LOTES'].map((nombre) => ({
      nombre,
      consultar: () => 1,
      normalizar: (valor) => valor,
      escribir: () => ejecutados.push(nombre)
    }))
  ])
  assert.equal(resultados[1].ok, false)
  assert.deepEqual(ejecutados, ['RESUMEN', 'PRODUCCION_DIARIA', 'PRODUCCION_LOTES'])
})

test('si fetch falla no se llama al escritor y el reporte visible se conserva', () => {
  const visible = ['reporte anterior']
  ejecutarActualizacionReportesScc_([{
    nombre: 'RESUMEN',
    consultar: () => { throw new Error('sin red') },
    normalizar: (valor) => valor,
    escribir: () => visible.splice(0, visible.length, 'nuevo reporte')
  }])
  assert.deepEqual(visible, ['reporte anterior'])
})

test('refresh exitoso normaliza y luego escribe el nuevo reporte', () => {
  const pasos = []
  let visible = 'anterior'
  const [resultado] = ejecutarActualizacionReportesScc_([{
    nombre: 'RANKING',
    consultar: () => { pasos.push('consultar'); return { valor: 7 } },
    normalizar: (respuesta) => { pasos.push('normalizar'); return respuesta.valor },
    escribir: (valor) => { pasos.push('escribir'); visible = valor }
  }])
  assert.equal(resultado.ok, true)
  assert.deepEqual(pasos, ['consultar', 'normalizar', 'escribir'])
  assert.equal(visible, 7)
})

test('Actualizar desde sistema detecta hojas de reporte con mensaje útil', () => {
  assert.match(menuSource, /else if \(esHojaReporteScc_\(nombre\)\)/)
  assert.match(menuSource, /Esta hoja es un reporte\. Usa SCC → Actualizar reportes\./)
})

test('Sincronizar datos sigue procesando únicamente los cuatro maestros', () => {
  const inicio = menuSource.indexOf('function menuSincronizarDatos()')
  const fin = menuSource.indexOf('function menuActualizarDesdeSistema()', inicio)
  const cuerpo = menuSource.slice(inicio, fin)
  assert.match(cuerpo, /sincronizarTrabajadores_/)
  assert.match(cuerpo, /sincronizarCampanias_/)
  assert.match(cuerpo, /sincronizarVariedades_/)
  assert.match(cuerpo, /sincronizarLotes_/)
  assert.doesNotMatch(cuerpo, /actualizarReportes_/)
})

test('SQL mantiene una lectura_jaba como una jaba en los cuatro reportes', () => {
  assert.equal((sql.match(/count\s*\(\s*lj\.id\s*\)/gi) || []).length, 4)
  assert.doesNotMatch(sql, /count\s*\(\s*distinct\s+(?:lj|at)\.[^)]*ticket/i)
})

test('ranking SQL mantiene DENSE_RANK por total_jabas DESC', () => {
  assert.match(
    sql,
    /dense_rank\(\) over \(\s*order by a\.total_jabas desc\s*\)/i
  )
})

test('producción diaria SQL agrupa usando timezone y valida pg_timezone_names', () => {
  assert.match(sql, /pg_catalog\.pg_timezone_names/)
  assert.match(
    sql,
    /\(lj\.fecha_hora at time zone v_zona_horaria\)::date/i
  )
})

test('menú expone Actualizar reportes', () => {
  assert.match(menuSource, /addItem\('Actualizar reportes', 'menuActualizarReportes'\)/)
  assert.match(menuSource, /actualizarReportes_\(\)/)
})
