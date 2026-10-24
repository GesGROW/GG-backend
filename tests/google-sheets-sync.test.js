import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'TrabajadoresPure.gs'),
  'utf8'
)
const contexto = vm.createContext({ Date, Error, Object, Array, String, Number, RegExp })
vm.runInContext(source, contexto)

const {
  debeMarcarPendienteOnEditScc_,
  esFilaPendienteScc_,
  normalizarActivoScc_,
  normalizarDniScc_,
  normalizarListadoTrabajadoresScc_,
  prepararTrabajadorParaGuardarScc_,
  procesarFilasPendientesScc_,
  tieneCambiosLocalesNoResueltosScc_
} = contexto

const UUID_1 = '11111111-1111-4111-8111-111111111111'
const UUID_2 = '22222222-2222-4222-8222-222222222222'

function fila(overrides = {}) {
  return {
    dni: '71234567',
    nombres: 'Juan',
    apellidos: 'Pérez',
    activo: 'Sí',
    estadoSync: 'PENDIENTE',
    observacion: '',
    idSistema: '',
    ultimaSincronizacion: '',
    ...overrides
  }
}

test('normaliza DNI', () => {
  assert.equal(normalizarDniScc_(' 71234567 '), '71234567')
})

test('rechaza DNI inválido', () => {
  assert.throws(() => normalizarDniScc_('1234A678'), /8 dígitos/)
})

test('requiere nombres', () => {
  assert.throws(
    () => prepararTrabajadorParaGuardarScc_(fila({ nombres: '  ' })),
    /nombres son obligatorios/
  )
})

test('requiere apellidos', () => {
  assert.throws(
    () => prepararTrabajadorParaGuardarScc_(fila({ apellidos: '' })),
    /apellidos son obligatorios/
  )
})

test('Sí se convierte a true', () => {
  assert.equal(normalizarActivoScc_('Sí'), true)
  assert.equal(normalizarActivoScc_('si'), true)
  assert.equal(normalizarActivoScc_('TRUE'), true)
})

test('No se convierte a false', () => {
  assert.equal(normalizarActivoScc_('No'), false)
  assert.equal(normalizarActivoScc_('FALSE'), false)
})

test('identifica PENDIENTE ignorando espacios y mayúsculas', () => {
  assert.equal(esFilaPendienteScc_(' pendiente '), true)
  assert.equal(esFilaPendienteScc_('SINCRONIZADO'), false)
})

test('éxito guarda ID Sistema y marca SINCRONIZADO', () => {
  const [resultado] = procesarFilasPendientesScc_(
    [fila()],
    () => ({ ok: true, trabajador: { id: UUID_1 } }),
    () => '2026-09-30T20:00:00-05:00'
  )
  assert.equal(resultado.estadoSync, 'SINCRONIZADO')
  assert.equal(resultado.idSistema, UUID_1)
  assert.equal(resultado.observacion, '')
})

test('error preserva ID Sistema previo', () => {
  const [resultado] = procesarFilasPendientesScc_(
    [fila({ idSistema: UUID_1 })],
    () => { throw new Error('DNI ya pertenece a otro trabajador') }
  )
  assert.equal(resultado.estadoSync, 'ERROR')
  assert.equal(resultado.idSistema, UUID_1)
  assert.match(resultado.observacion, /otro trabajador/)
})

test('error en una fila no interrumpe las siguientes', () => {
  let llamadas = 0
  const resultados = procesarFilasPendientesScc_(
    [fila({ dni: '71234567' }), fila({ dni: '71234568' })],
    () => {
      llamadas += 1
      if (llamadas === 1) throw new Error('falló primera')
      return { ok: true, trabajador: { id: UUID_2 } }
    }
  )
  assert.equal(resultados[0].estadoSync, 'ERROR')
  assert.equal(resultados[1].estadoSync, 'SINCRONIZADO')
  assert.equal(llamadas, 2)
})

test('fila SINCRONIZADA no se procesa', () => {
  let llamadas = 0
  const [resultado] = procesarFilasPendientesScc_(
    [fila({ estadoSync: 'SINCRONIZADO', idSistema: UUID_1 })],
    () => { llamadas += 1 }
  )
  assert.equal(llamadas, 0)
  assert.equal(resultado.idSistema, UUID_1)
})

test('onEdit conceptual solo marca cambios de A-D en TRABAJADORES', () => {
  assert.equal(debeMarcarPendienteOnEditScc_('TRABAJADORES', 2, 1, 1), true)
  assert.equal(debeMarcarPendienteOnEditScc_('TRABAJADORES', 2, 4, 1), true)
  assert.equal(debeMarcarPendienteOnEditScc_('TRABAJADORES', 2, 5, 1), false)
  assert.equal(debeMarcarPendienteOnEditScc_('TRABAJADORES', 1, 1, 1), false)
  assert.equal(debeMarcarPendienteOnEditScc_('OTRA', 2, 1, 1), false)
})

test('actualización desde sistema detecta pendientes o errores', () => {
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila()]), true)
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila({ estadoSync: 'ERROR' })]), true)
  assert.equal(
    tieneCambiosLocalesNoResueltosScc_([fila({ estadoSync: 'SINCRONIZADO' })]),
    false
  )
})

test('respuesta de listado se normaliza', () => {
  const resultado = normalizarListadoTrabajadoresScc_({
    ok: true,
    trabajadores: [
      {
        id: UUID_1,
        dni: ' 71234567 ',
        nombres: ' Juan ',
        apellidos: ' Pérez ',
        activo: true
      }
    ]
  })
  assert.equal(resultado.length, 1)
  assert.equal(resultado[0].dni, '71234567')
  assert.equal(resultado[0].nombres, 'Juan')
  assert.equal(resultado[0].apellidos, 'Pérez')
  assert.equal(resultado[0].activo, true)
})

test('actualizar desde sistema acepta trabajadores provisionales sin nombres', () => {
  const resultado = normalizarListadoTrabajadoresScc_({
    ok: true,
    trabajadores: [
      {
        id: UUID_2,
        dni: '74821563',
        nombres: '',
        apellidos: '   ',
        activo: true
      }
    ]
  })

  assert.equal(resultado[0].nombres, '')
  assert.equal(resultado[0].apellidos, '')
  assert.throws(
    () =>
      prepararTrabajadorParaGuardarScc_(
        fila({ dni: '74821563', nombres: '', apellidos: '' })
      ),
    /nombres son obligatorios/
  )
})
