import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = ['ReportesPure.gs', 'Reportes.gs'].map((file) =>
  fs.readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8')).join('\n')

function spreadsheet() {
  const cells = new Map()
  const read = (r, c) => cells.get(`${r},${c}`) ?? ''
  const write = (r, c, value) => cells.set(`${r},${c}`, value)
  const formats = []
  let maxRows = 20
  const protection = {
    canDomainEdit: () => false,
    setUnprotectedRanges(ranges) { this.editable = ranges }
  }
  const sheet = {
    getName: () => 'RANKING',
    getMaxRows: () => maxRows,
    getLastRow: () => Math.max(1, ...Array.from(cells.keys(), (key) => Number(key.split(',')[0]))),
    getFilter() { return this.filter },
    getProtections: () => [{ ...protection, getDescription: () => 'SCC - reporte generado - RANKING',
      setUnprotectedRanges: (ranges) => { protection.editable = ranges } }],
    setColumnWidth() {},
    setRowHeights() {},
    setFrozenRows(rows) { this.frozen = rows },
    setConditionalFormatRules(rules) { this.rules = rules },
    insertRowsBefore(row, count) {
      const old = Array.from(cells.entries())
      cells.clear()
      for (const [key, value] of old) {
        const [r, c] = key.split(',').map(Number)
        write(r >= row ? r + count : r, c, value)
      }
      maxRows += count
    },
    insertRowsAfter(row, count) { maxRows += count },
    getRange(row, col, height = 1, width = 1) {
      if (typeof row === 'string') {
        const match = row.match(/^([A-Z])(\d+)(?::([A-Z])(\d+))?$/)
        col = match[1].charCodeAt(0) - 64
        row = Number(match[2])
        height = Number(match[4] || row) - row + 1
        width = (match[3] ? match[3].charCodeAt(0) - 64 : col) - col + 1
      }
      assert.ok(row + height - 1 <= maxRows, 'rango dentro del tamaño de hoja')
      const range = {
        row, col, height, width,
        getValue: () => read(row, col),
        setValue(value) { write(row, col, value); return this },
        setValues(values) {
          assert.equal(values.length, height)
          values.forEach((line, i) => {
            assert.equal(line.length, width)
            line.forEach((value, j) => {
              // setValues interpreta '=' como fórmula, incluso en formato texto.
              assert.ok(typeof value !== 'string' || !value.startsWith('='),
                'los valores visibles no deben convertirse en fórmulas')
              write(row + i, col + j,
                typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value)
            })
          })
          return this
        },
        clearContent() {
          for (let i = 0; i < height; i++) for (let j = 0; j < width; j++) cells.delete(`${row + i},${col + j}`)
          return this
        },
        clearFormat() { return this },
        setNumberFormat(format) { formats.push({ row, col, format }); return this },
        setDataValidation(validation) { sheet.validation = validation; return this },
        createFilter() { sheet.filter = { remove() { sheet.filter = null } }; return this }
      }
      for (const method of ['setFontWeight', 'setFontSize', 'setBackground', 'setFontColor', 'setWrap', 'setVerticalAlignment']) {
        range[method] = () => range
      }
      return range
    }
  }
  function builder() {
    const b = { build: () => b }
    for (const name of ['requireValueInList', 'setAllowInvalid', 'whenFormulaSatisfied',
      'whenTextContains', 'setBackground', 'setBold', 'setRanges', 'setFontColor']) {
      b[name] = (...args) => { b[name + 'Args'] = args; return b }
    }
    return b
  }
  const context = vm.createContext({ Date, SCC_CONFIG: { hojaRanking: 'RANKING' },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
      getActive: () => ({ getSpreadsheetTimeZone: () => 'America/Lima' }),
      ProtectionType: { SHEET: 'SHEET' }, newDataValidation: builder, newConditionalFormatRule: builder
    }
  })
  vm.runInContext(source, context)
  return { context, sheet, read, write, cells, formats, protection }
}

function respuesta(ranking = []) {
  return {
    ok: true, campania: 'Arándanos 2026', periodo: 'HOY', zona_horaria: 'America/Lima',
    fecha_desde: '2026-10-03', fecha_hasta: '2026-10-03',
    comparacion_disponible: true, fecha_anterior_desde: '2026-10-02', fecha_anterior_hasta: '2026-10-02',
    ranking
  }
}
function fila(posicion, anterior, dni = '01234567', jabas = 10) {
  return {
    posicion, posicion_anterior: anterior, cambio_posicion: anterior == null ? null : anterior - posicion,
    cosechador_dni: dni, cosechador: 'Ana Pérez', total_jabas: jabas, ultima_lectura: null
  }
}

test('abrir migra filas existentes, conserva el selector y deja solo B2 editable', () => {
  const { context, sheet, write, read, protection } = spreadsheet()
  write(1, 1, 'Posición')
  write(2, 1, 1)
  write(2, 2, '01234567')
  context.configurarHojaRanking_()
  assert.equal(read(12, 2), '01234567')
  assert.equal(read(11, 6), 'Cambio')
  assert.equal(read(2, 2), 'Campaña')
  assert.equal(protection.editable.length, 1)
  assert.equal(protection.editable[0].row, 2)
  assert.equal(protection.editable[0].col, 2)
  assert.equal(sheet.frozen, 11)
  write(2, 2, 'Semana')
  context.configurarHojaRanking_()
  assert.equal(read(2, 2), 'Semana')
  assert.equal(read(12, 2), '01234567')
})

test('actualización usa período seleccionado, resume y limpia filas y estilos al quedar vacío', () => {
  const { context, sheet, write, read, formats } = spreadsheet()
  context.configurarHojaRanking_()
  write(2, 2, 'Hoy')
  let response = respuesta([fila(1, 3), fila(1, null, '01234568'), fila(2, 1, '01234569'), fila(3, 3, '01234570')])
  context.llamarRpcSupabase_ = (name, payload) => {
    assert.equal(name, 'admin_obtener_ranking_cosechadores_periodo')
    assert.deepEqual({ ...payload }, { p_periodo: 'HOY', p_zona_horaria: 'America/Lima' })
    return response
  }
  assert.equal(context.actualizarRankingReporte_()[0].ok, true)
  assert.equal(read(2, 2), 'Hoy')
  assert.equal(read(4, 2), 'Hoy: 03/10/2026')
  assert.equal(read(5, 2), '02/10/2026')
  assert.equal(read(6, 2), 40)
  assert.equal(read(6, 5), 4)
  assert.deepEqual([read(12, 6), read(13, 6), read(14, 6), read(15, 6)], ['↑ 2', 'Nuevo', '↓ 1', '='])
  assert.equal(read(12, 2), '01234567')
  assert.ok(formats.some((f) => f.row === 12 && f.col === 2 && f.format === '@'))
  assert.deepEqual(Array.from(sheet.rules.slice(0, 3), (r) => r.whenFormulaSatisfiedArgs[0]),
    ['=$A12=1', '=$A12=2', '=$A12=3'])
  response = respuesta()
  assert.equal(context.actualizarRankingReporte_()[0].ok, true)
  assert.equal(read(6, 2), 0)
  assert.equal(read(6, 5), 0)
  assert.equal(read(12, 1), 'Sin producción registrada en este período')
  assert.equal(read(15, 2), '')
  assert.equal(sheet.rules.length, 0)
  assert.equal(sheet.getFilter(), null)
})

test('Campaña muestra posiciones sin cambio como texto y reemplaza errores anteriores', () => {
  const { context, write, read } = spreadsheet()
  write(2, 2, 'Campaña')
  for (let i = 0; i < 4; i++) write(12 + i, 6, '#ERROR!')
  context.llamarRpcSupabase_ = (name, payload) => {
    assert.equal(payload.p_periodo, 'CAMPANIA')
    return {
      ...respuesta([fila(1, 1), fila(2, 2), fila(3, 3), fila(4, 4)]),
      periodo: 'CAMPANIA', fecha_desde: '2026-10-02'
    }
  }
  assert.equal(context.actualizarRankingReporte_()[0].ok, true)
  assert.equal(read(4, 2), 'Campaña: 02/10/2026 al 03/10/2026')
  assert.deepEqual([read(12, 6), read(13, 6), read(14, 6), read(15, 6)], ['=', '=', '=', '='])
})

test('fallo de RPC o comparación inválida conserva todo el reporte, incluido resumen', () => {
  const { context, cells, write, read } = spreadsheet()
  context.configurarHojaRanking_()
  context.escribirRankingReporte_(context.normalizarRankingReporteScc_(respuesta([fila(1, 2)])))
  write(2, 2, 'Mes')
  const anterior = Array.from(cells.entries())
  context.llamarRpcSupabase_ = () => { throw new Error('sin conexión') }
  assert.equal(context.actualizarRankingReporte_()[0].ok, false)
  assert.deepEqual(Array.from(cells.entries()), anterior)
  context.llamarRpcSupabase_ = () => respuesta([{ ...fila(1, 2), cambio_posicion: -8 }])
  assert.equal(context.actualizarRankingReporte_()[0].ok, false)
  assert.deepEqual(Array.from(cells.entries()), anterior)
  assert.equal(read(4, 2), 'Hoy: 03/10/2026')
})

test('sin período anterior usa Sin comparación y valida rangos y fechas antes de escribir', () => {
  const { context } = spreadsheet()
  const base = { ...respuesta([fila(1, null)]), comparacion_disponible: false,
    fecha_anterior_desde: null, fecha_anterior_hasta: null }
  const reporte = context.normalizarRankingReporteScc_(base)
  assert.equal(context.formatearCambioPosicionRankingScc_(reporte.ranking[0], false), 'Sin comparación')
  for (const cambios of [
    { fecha_desde: '2026-10-04' }, { fecha_hasta: '2026-02-30' },
    { comparacion_disponible: 'false' }, { fecha_anterior_desde: '2026-10-02' }
  ]) {
    assert.throws(() => context.normalizarRankingReporteScc_({ ...base, ...cambios }), /Respuesta inválida/)
  }
  assert.equal(context.crearPayloadRankingReporteScc_(' Campaña ', 'America/Lima').p_periodo, 'CAMPANIA')
  assert.throws(() => context.crearPayloadRankingReporteScc_('Otro', 'America/Lima'), /Período de ranking inválido/)
})
