import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  ORDEN_PRODUCCION_LOTES,
  buscarProduccionLotes,
  formatearUltimaLecturaLote,
  normalizarProduccionLotes,
  obtenerProduccionLotes,
  ordenarProduccionLotes,
  reemplazarProduccionLotes,
  resumirProduccionLotes
} from '@gesgrow/core/contexts/harvest/application/reports/produccionLotes.js'

const respuestaBase = {
  ok: true,
  campania: {
    id: '00000000-0000-0000-0000-000000000001',
    nombre: 'Campaña 2026'
  },
  produccion: [
    {
      lote_id: '00000000-0000-0000-0000-000000000002',
      lote_codigo: ' LOTE-002 ',
      lote_nombre: ' Sector Norte ',
      variedad: ' Hass ',
      total_jabas: '355',
      total_cosechadores: '31',
      total_sesiones: '7',
      ultima_lectura: '2026-09-30T15:31:00Z'
    },
    {
      lote_id: '00000000-0000-0000-0000-000000000001',
      lote_codigo: 'LOTE-001',
      lote_nombre: 'Sector Sur',
      variedad: 'Ventura',
      total_jabas: 420,
      total_cosechadores: 36,
      total_sesiones: 8,
      ultima_lectura: '2026-09-30T15:42:00Z'
    }
  ]
}

test('normaliza la respuesta de producción por lote', () => {
  const resultado = normalizarProduccionLotes(respuestaBase)

  assert.deepEqual(resultado.produccion[0], {
    lote_id: '00000000-0000-0000-0000-000000000001',
    lote_codigo: 'LOTE-001',
    lote_nombre: 'Sector Sur',
    variedad: 'Ventura',
    total_jabas: 420,
    total_cosechadores: 36,
    total_sesiones: 8,
    ultima_lectura: '2026-09-30T15:42:00Z'
  })
  assert.equal(resultado.campania.nombre, 'Campaña 2026')
})

test('resume la cantidad de lotes con producción', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion
  assert.equal(resumirProduccionLotes(produccion).lotes, 2)
})

test('resume el total de jabas sin sumar cosechadores ni sesiones', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion
  assert.deepEqual(resumirProduccionLotes(produccion), { lotes: 2, jabas: 775 })
})

test('busca por código de lote ignorando mayúsculas y espacios', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion
  assert.equal(buscarProduccionLotes(produccion, '  lote-002  ')[0].variedad, 'Hass')
})

test('busca por nombre del lote', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion
  assert.equal(
    buscarProduccionLotes(produccion, 'sector sur')[0].lote_codigo,
    'LOTE-001'
  )
})

test('busca por variedad', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion
  assert.equal(buscarProduccionLotes(produccion, 'hass')[0].lote_codigo, 'LOTE-002')
})

test('ordena por más jabas y desempata por código', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion
  const ordenada = ordenarProduccionLotes(produccion, ORDEN_PRODUCCION_LOTES.MAS_JABAS)
  assert.deepEqual(
    ordenada.map((fila) => fila.total_jabas),
    [420, 355]
  )
})

test('ordena A–Z por código de lote', () => {
  const produccion = normalizarProduccionLotes(respuestaBase).produccion.reverse()
  const ordenada = ordenarProduccionLotes(produccion, ORDEN_PRODUCCION_LOTES.AZ)
  assert.deepEqual(
    ordenada.map((fila) => fila.lote_codigo),
    ['LOTE-001', 'LOTE-002']
  )
})

test('actualizar reemplaza la producción y no duplica filas', () => {
  const actual = [{ lote_id: 'lote-1', total_jabas: 10 }]
  const siguiente = [
    { lote_id: 'lote-1', total_jabas: 11 },
    { lote_id: 'lote-2', total_jabas: 4 }
  ]

  const reemplazado = reemplazarProduccionLotes(actual, siguiente)
  assert.equal(reemplazado.length, 2)
  assert.deepEqual(reemplazado, siguiente)
  assert.notEqual(reemplazado, siguiente)
})

test('una respuesta vacía produce resumen vacío', () => {
  const resultado = normalizarProduccionLotes({ ...respuestaBase, produccion: [] })
  assert.deepEqual(resumirProduccionLotes(resultado.produccion), { lotes: 0, jabas: 0 })
})

test('propaga el error de la consulta', async () => {
  const consultar = async () => {
    throw new Error('RPC no disponible')
  }
  await assert.rejects(
    obtenerProduccionLotes('12345678', consultar),
    /RPC no disponible/
  )
})

test('formatea la última lectura en hora local del dispositivo', () => {
  const ahora = new Date(2026, 8, 30, 11, 0)
  const hoy = new Date(2026, 8, 30, 10, 42).toISOString()
  const anterior = new Date(2026, 8, 29, 16, 18).toISOString()

  assert.equal(formatearUltimaLecturaLote(hoy, ahora), 'Hoy 10:42')
  assert.equal(formatearUltimaLecturaLote(anterior, ahora), '29/09 16:18')
})

test('la consulta de producción por lote recibe el operador', async () => {
  let llamada
  const consultar = async (parametros) => {
    llamada = parametros
    return respuestaBase
  }

  await obtenerProduccionLotes('12345678', consultar)

  assert.deepEqual(llamada, { dniOperador: '12345678' })
})

test('la migración conserva las reglas de conteo y agrupación por lote', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260930_produccion_lotes.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /count\(lj\.id\)::bigint as total_jabas/i)
  assert.match(
    sql,
    /count\(distinct at\.cosechador_rol_id\)::bigint as total_cosechadores/i
  )
  assert.match(sql, /count\(distinct lj\.sesion_id\)::bigint as total_sesiones/i)
  assert.match(sql, /max\(lj\.fecha_hora\) as ultima_lectura/i)
  assert.match(sql, /where l\.campania_id = v_campania_id/i)
  assert.match(sql, /group by\s+l\.id,/i)
  assert.match(sql, /join variedades v\s+on v\.id = l\.variedad_id/i)
  assert.doesNotMatch(sql, /count\(distinct\s+lj\.asignacion_ticket_id\)/i)
  assert.doesNotMatch(sql, /count\(distinct\s+codigo_ticket\)/i)
})
