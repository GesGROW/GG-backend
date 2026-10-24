import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  formatearFechaInicioCampania,
  formatearNumeroResumen,
  formatearUltimaActividad,
  normalizarResumenCampania,
  obtenerResumenCampania,
  reemplazarResumenCampania
} from '@gesgrow/core/contexts/harvest/application/reports/resumenCampania.js'

const respuestaBase = {
  ok: true,
  campania: {
    id: '00000000-0000-0000-0000-000000000001',
    nombre: ' Campaña 2026 ',
    fecha_inicio: '2026-08-01'
  },
  zona_horaria: 'America/Lima',
  resumen: {
    total_jabas: '8450',
    total_cosechadores: '120',
    total_lotes: '4',
    total_sesiones: '37',
    dias_con_produccion: '6',
    ultima_lectura: '2026-09-30T15:42:00Z'
  }
}

test('normaliza la respuesta del resumen de campaña', () => {
  const resultado = normalizarResumenCampania(respuestaBase)

  assert.deepEqual(resultado, {
    ok: true,
    campania: {
      id: '00000000-0000-0000-0000-000000000001',
      nombre: 'Campaña 2026',
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
    }
  })
})

test('normaliza total_jabas', () => {
  assert.equal(normalizarResumenCampania(respuestaBase).resumen.total_jabas, 8450)
})

test('normaliza total_cosechadores', () => {
  assert.equal(normalizarResumenCampania(respuestaBase).resumen.total_cosechadores, 120)
})

test('normaliza total_lotes', () => {
  assert.equal(normalizarResumenCampania(respuestaBase).resumen.total_lotes, 4)
})

test('normaliza total_sesiones', () => {
  assert.equal(normalizarResumenCampania(respuestaBase).resumen.total_sesiones, 37)
})

test('normaliza dias_con_produccion', () => {
  assert.equal(normalizarResumenCampania(respuestaBase).resumen.dias_con_produccion, 6)
})

test('normaliza ultima_lectura', () => {
  assert.equal(
    normalizarResumenCampania(respuestaBase).resumen.ultima_lectura,
    '2026-09-30T15:42:00Z'
  )
})

test('estado sin producción conserva contadores en cero y última lectura nula', () => {
  const resultado = normalizarResumenCampania({
    ...respuestaBase,
    resumen: {
      total_jabas: 0,
      total_cosechadores: 0,
      total_lotes: 0,
      total_sesiones: 0,
      dias_con_produccion: 0,
      ultima_lectura: null
    }
  })

  assert.deepEqual(resultado.resumen, {
    total_jabas: 0,
    total_cosechadores: 0,
    total_lotes: 0,
    total_sesiones: 0,
    dias_con_produccion: 0,
    ultima_lectura: null
  })
})

test('formatea fecha_inicio como fecha calendario sin Date', () => {
  assert.equal(formatearFechaInicioCampania('2026-08-01'), '01/08/2026')
})

test('formatea la última actividad con hora local del dispositivo', () => {
  const ahora = new Date(2026, 8, 30, 11, 0)
  const hoy = new Date(2026, 8, 30, 10, 42).toISOString()
  const anterior = new Date(2026, 8, 29, 16, 18).toISOString()

  assert.equal(formatearUltimaActividad(hoy, ahora), 'Hoy 10:42')
  assert.equal(formatearUltimaActividad(anterior, ahora), '29/09 16:18')
  assert.equal(formatearUltimaActividad(null, ahora), 'Sin actividad registrada')
})

test('formatea números grandes con Intl.NumberFormat', () => {
  assert.equal(formatearNumeroResumen(8450, 'en-US'), '8,450')
})

test('envía la timezone del dispositivo a la RPC', async () => {
  let llamada
  const consultar = async (parametros) => {
    llamada = parametros
    return respuestaBase
  }

  await obtenerResumenCampania('12345678', consultar, () => 'America/Lima')

  assert.deepEqual(llamada, {
    dniOperador: '12345678',
    zonaHoraria: 'America/Lima'
  })
})

test('actualizar reemplaza el resumen y no acumula métricas', () => {
  const actual = normalizarResumenCampania(respuestaBase)
  const siguiente = normalizarResumenCampania({
    ...respuestaBase,
    resumen: {
      ...respuestaBase.resumen,
      total_jabas: 9000,
      total_cosechadores: 125
    }
  })

  const reemplazado = reemplazarResumenCampania(actual, siguiente)

  assert.equal(reemplazado.resumen.total_jabas, 9000)
  assert.equal(reemplazado.resumen.total_cosechadores, 125)
  assert.notEqual(reemplazado, siguiente)
  assert.notEqual(reemplazado.resumen, siguiente.resumen)
})

test('propaga el error de la consulta', async () => {
  const consultar = async () => {
    throw new Error('RPC no disponible')
  }

  await assert.rejects(
    obtenerResumenCampania('12345678', consultar, () => 'America/Lima'),
    /RPC no disponible/
  )
})

test('la migración conserva las reglas exactas del resumen', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260930_resumen_campania.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /count\(lj\.id\)::bigint/i)
  assert.match(sql, /count\(distinct at\.cosechador_rol_id\)::bigint/i)
  assert.match(sql, /count\(distinct sl\.lote_id\)::bigint/i)
  assert.match(sql, /count\(distinct lj\.sesion_id\)::bigint/i)
  assert.match(
    sql,
    /count\(\s*distinct \(lj\.fecha_hora at time zone v_zona_horaria\)::date\s*\)::bigint/i
  )
  assert.match(sql, /max\(lj\.fecha_hora\)/i)
  assert.match(sql, /where at\.campania_id = v_campania_id/i)
  assert.match(sql, /and l\.campania_id = v_campania_id/i)
  assert.match(sql, /pg_catalog\.pg_timezone_names/i)
  assert.match(sql, /where c\.estado = 'ACTIVA'/i)
  assert.match(sql, /c\.fecha_inicio/i)
  assert.match(sql, /'fecha_inicio',\s*v_campania_fecha_inicio/i)
  assert.doesNotMatch(sql, /count\(distinct\s+lj\.asignacion_ticket_id\)/i)
  assert.doesNotMatch(sql, /count\(distinct\s+codigo_ticket\)/i)
})

test('el resumen no se construye sumando reportes secundarios ni IndexedDB', async () => {
  const modulo = await readFile(
    new URL(import.meta.resolve('@gesgrow/core/contexts/harvest/application/reports/resumenCampania.js')),
    'utf8'
  )

  assert.doesNotMatch(modulo, /produccionDiaria|produccionLotes|rankingCosechadores/i)
  assert.doesNotMatch(modulo, /indexeddb|\.\/offline\//i)
})
