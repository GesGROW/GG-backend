import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  formatearFechaCalendario,
  normalizarProduccionDiaria,
  obtenerProduccionDiaria,
  reemplazarProduccionDiaria,
  resumirProduccionDiaria
} from '@gesgrow/core/contexts/harvest/application/reports/produccionDiaria.js'

const respuestaBase = {
  ok: true,
  campania: {
    id: '00000000-0000-0000-0000-000000000001',
    nombre: 'Campaña 2026'
  },
  zona_horaria: 'America/Lima',
  produccion: [
    {
      fecha: '2026-09-29',
      total_jabas: '251',
      total_cosechadores: '43',
      total_sesiones: '5'
    },
    {
      fecha: '2026-09-30',
      total_jabas: 284,
      total_cosechadores: 47,
      total_sesiones: 6
    }
  ]
}

test('normaliza la respuesta de producción diaria', () => {
  const resultado = normalizarProduccionDiaria(respuestaBase)

  assert.deepEqual(resultado.produccion[0], {
    fecha: '2026-09-30',
    total_jabas: 284,
    total_cosechadores: 47,
    total_sesiones: 6
  })
  assert.equal(resultado.campania.nombre, 'Campaña 2026')
  assert.equal(resultado.zona_horaria, 'America/Lima')
})

test('resume el total de jabas', () => {
  const produccion = normalizarProduccionDiaria(respuestaBase).produccion
  assert.equal(resumirProduccionDiaria(produccion).jabas, 535)
})

test('resume la cantidad de días con producción', () => {
  const produccion = normalizarProduccionDiaria(respuestaBase).produccion
  assert.equal(resumirProduccionDiaria(produccion).dias, 2)
})

test('ordena por fecha descendente', () => {
  const produccion = normalizarProduccionDiaria(respuestaBase).produccion
  assert.deepEqual(
    produccion.map((fila) => fila.fecha),
    ['2026-09-30', '2026-09-29']
  )
})

test('formatea YYYY-MM-DD sin convertir la fecha a Date', () => {
  assert.equal(formatearFechaCalendario('2026-09-30'), '30/09/2026')
})

test('pasa la zona horaria del cliente a la operación de producción', async () => {
  let llamada
  const consultar = async (parametros) => {
    llamada = parametros
    return respuestaBase
  }

  await obtenerProduccionDiaria('12345678', consultar, () => 'America/Lima')

  assert.deepEqual(llamada, {
    dniOperador: '12345678',
    zonaHoraria: 'America/Lima'
  })
})

test('actualizar reemplaza la producción y no duplica filas', () => {
  const actual = [{ fecha: '2026-09-30', total_jabas: 10 }]
  const siguiente = [
    { fecha: '2026-09-30', total_jabas: 11 },
    { fecha: '2026-09-29', total_jabas: 4 }
  ]

  const reemplazado = reemplazarProduccionDiaria(actual, siguiente)
  assert.equal(reemplazado.length, 2)
  assert.deepEqual(reemplazado, siguiente)
  assert.notEqual(reemplazado, siguiente)
})

test('una respuesta vacía produce un resumen vacío', () => {
  const resultado = normalizarProduccionDiaria({
    ...respuestaBase,
    produccion: []
  })

  assert.deepEqual(resumirProduccionDiaria(resultado.produccion), {
    jabas: 0,
    dias: 0
  })
})

test('propaga el error de la consulta', async () => {
  const consultar = async () => {
    throw new Error('RPC no disponible')
  }
  await assert.rejects(
    obtenerProduccionDiaria('12345678', consultar, () => 'America/Lima'),
    /RPC no disponible/
  )
})

test('operación ausente informa que Administración debe habilitar el reporte', async () => {
  const consultar = async () => {
    throw new Error(
      'Producción por día no está disponible. Solicite a Administración que habilite el reporte.'
    )
  }
  await assert.rejects(
    obtenerProduccionDiaria('12345678', consultar, () => 'America/Lima'),
    /Solicite a Administración que habilite el reporte/
  )
})

test('el resumen no suma cosechadores diarios como cosechadores únicos de campaña', () => {
  const produccion = normalizarProduccionDiaria(respuestaBase).produccion
  const resumen = resumirProduccionDiaria(produccion)

  assert.equal(Object.hasOwn(resumen, 'cosechadores'), false)
})

test('la migración conserva las reglas de conteo y timezone', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260930_produccion_diaria.sql', import.meta.url),
    'utf8'
  )

  assert.match(sql, /count\(lj\.id\)::bigint as total_jabas/i)
  assert.match(
    sql,
    /count\(distinct at\.cosechador_rol_id\)::bigint as total_cosechadores/i
  )
  assert.match(sql, /count\(distinct lj\.sesion_id\)::bigint as total_sesiones/i)
  assert.match(sql, /lj\.fecha_hora at time zone v_zona_horaria/i)
  assert.match(sql, /where at\.campania_id = v_campania_id/i)
  assert.match(sql, /pg_catalog\.pg_timezone_names/i)
  assert.doesNotMatch(sql, /count\(distinct\s+lj\.asignacion_ticket_id\)/i)
  assert.doesNotMatch(sql, /count\(distinct\s+codigo_ticket\)/i)
})
