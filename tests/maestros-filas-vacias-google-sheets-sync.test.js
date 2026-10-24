import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const read = (relative) => fs.readFileSync(path.join(dirname, '..', relative), 'utf8')

const trabajadoresPure = read('apps-script/TrabajadoresPure.gs')
const campaniasPure = read('apps-script/CampaniasPure.gs')
const variedadesPure = read('apps-script/VariedadesPure.gs')
const lotesPure = read('apps-script/LotesPure.gs')
const rolesPure = read('apps-script/RolesCampaniaPure.gs')

const fuentes = {
  trabajadores: read('apps-script/Trabajadores.gs'),
  campanias: read('apps-script/Campanias.gs'),
  variedades: read('apps-script/Variedades.gs'),
  lotes: read('apps-script/Lotes.gs'),
  roles: read('apps-script/RolesCampania.gs')
}

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
vm.runInContext(
  [trabajadoresPure, campaniasPure, variedadesPure, lotesPure, rolesPure].join('\n'),
  contexto
)

const {
  filtrarFilasPendientesConDatosScc_,
  obtenerUltimaFilaAdministrativaScc_,
  procesarFilasPendientesScc_,
  procesarFilasPendientesCampaniasScc_,
  procesarFilasPendientesVariedadesScc_,
  procesarFilasPendientesLotesScc_,
  procesarFilasPendientesRolesCampaniaScc_,
  tieneCambiosLocalesNoResueltosScc_
} = contexto

const UUID_1 = '11111111-1111-4111-8111-111111111111'
const UUID_2 = '22222222-2222-4222-8222-222222222222'
const UUID_3 = '33333333-3333-4333-8333-333333333333'

const trabajadorVacio = (overrides = {}) => ({
  dni: '', nombres: '', apellidos: '', activo: '', estadoSync: 'PENDIENTE',
  observacion: '', idSistema: '', ultimaSincronizacion: '', ...overrides
})

test('1. TRABAJADORES ignora una fila A:D totalmente vacía', () => {
  let llamadas = 0
  const fila = trabajadorVacio()
  const [resultado] = procesarFilasPendientesScc_([fila], () => { llamadas += 1 })

  assert.equal(llamadas, 0)
  assert.equal(resultado.estadoSync, 'PENDIENTE')
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('2. TRABAJADORES ignora una fila vacía con Estado Sync viejo', () => {
  const fila = trabajadorVacio({ estadoSync: 'ERROR' })
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila]), false)
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('3. TRABAJADORES ignora una fila vacía con Observación vieja', () => {
  let llamadas = 0
  const fila = trabajadorVacio({ observacion: 'DNI debe contener exactamente 8 dígitos' })
  procesarFilasPendientesScc_([fila], () => { llamadas += 1 })

  assert.equal(llamadas, 0)
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('4. TRABAJADORES valida una fila parcialmente rellenada sin DNI', () => {
  let llamadas = 0
  const [resultado] = procesarFilasPendientesScc_(
    [trabajadorVacio({ nombres: 'Juan' })],
    () => { llamadas += 1 }
  )

  assert.equal(llamadas, 0)
  assert.equal(resultado.estadoSync, 'ERROR')
  assert.match(resultado.observacion, /DNI debe contener exactamente 8 dígitos/i)
})

test('5. TRABAJADORES mantiene la sincronización normal de una fila válida', () => {
  let llamadas = 0
  const [resultado] = procesarFilasPendientesScc_([
    trabajadorVacio({ dni: '71234567', nombres: 'Juan', apellidos: 'Pérez', activo: 'Sí' })
  ], () => {
    llamadas += 1
    return { ok: true, trabajador: { id: UUID_1 } }
  }, () => 'ahora')

  assert.equal(llamadas, 1)
  assert.equal(resultado.estadoSync, 'SINCRONIZADO')
  assert.equal(resultado.idSistema, UUID_1)
})

test('6. CAMPANIAS ignora filas administrativas vacías aunque tengan datos técnicos viejos', () => {
  let llamadas = 0
  const fila = {
    codigo: '', nombre: '', fechaInicio: '', fechaFin: '', estado: '',
    estadoSync: 'PENDIENTE', observacion: 'vieja', idSistema: UUID_1,
    ultimaSincronizacion: 'ayer'
  }
  procesarFilasPendientesCampaniasScc_([fila], () => { llamadas += 1 })
  assert.equal(llamadas, 0)
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('7. VARIEDADES ignora filas administrativas vacías aunque tengan datos técnicos viejos', () => {
  let llamadas = 0
  const fila = {
    nombre: '', activo: '', estadoSync: 'PENDIENTE', observacion: 'vieja',
    idSistema: UUID_1, ultimaSincronizacion: 'ayer'
  }
  procesarFilasPendientesVariedadesScc_([fila], () => { llamadas += 1 })
  assert.equal(llamadas, 0)
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('8. LOTES ignora filas administrativas vacías aunque tengan datos técnicos viejos', () => {
  let llamadas = 0
  const fila = {
    codigo: '', nombre: '', campania: '', variedad: '', activo: '',
    estadoSync: 'PENDIENTE', observacion: 'vieja', idSistema: UUID_1,
    ultimaSincronizacion: 'ayer'
  }
  procesarFilasPendientesLotesScc_([fila], [], [], [], () => { llamadas += 1 })
  assert.equal(llamadas, 0)
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('9. ROLES_CAMPANIA ignora nombre informativo y técnicos viejos si A,C,D,E están vacíos', () => {
  let llamadas = 0
  const fila = {
    dni: '', trabajador: 'Nombre viejo', campania: '', rol: '', activo: '',
    estadoSync: 'PENDIENTE', observacion: 'vieja', idSistema: UUID_1,
    ultimaSincronizacion: 'ayer'
  }
  procesarFilasPendientesRolesCampaniaScc_([fila], [], [], [], () => { llamadas += 1 })
  assert.equal(llamadas, 0)
  assert.equal(filtrarFilasPendientesConDatosScc_([fila]).length, 0)
})

test('10. una fila parcial equivalente en otros maestros sigue validándose', () => {
  const [campania] = procesarFilasPendientesCampaniasScc_([{
    codigo: '', nombre: 'Campaña parcial', fechaInicio: '', fechaFin: '', estado: '',
    estadoSync: 'PENDIENTE', observacion: '', idSistema: '', ultimaSincronizacion: ''
  }], () => ({ ok: true, campania: { id: UUID_1 } }))
  const [variedad] = procesarFilasPendientesVariedadesScc_([{
    nombre: 'Ventura', activo: '', estadoSync: 'PENDIENTE', observacion: '',
    idSistema: '', ultimaSincronizacion: ''
  }], () => ({ ok: true, variedad: { id: UUID_2 } }))
  const [lote] = procesarFilasPendientesLotesScc_([{
    codigo: 'LOTE-1', nombre: '', campania: '', variedad: '', activo: '',
    estadoSync: 'PENDIENTE', observacion: '', idSistema: '', ultimaSincronizacion: ''
  }], [], [], [], () => ({ ok: true, lote: { id: UUID_2 } }))
  const [rol] = procesarFilasPendientesRolesCampaniaScc_([{
    dni: '71234567', trabajador: '', campania: '', rol: '', activo: '',
    estadoSync: 'PENDIENTE', observacion: '', idSistema: '', ultimaSincronizacion: ''
  }], [], [], [], () => ({ ok: true, rol_campania: { id: UUID_3 } }))

  assert.equal(campania.estadoSync, 'ERROR')
  assert.equal(variedad.estadoSync, 'ERROR')
  assert.equal(lote.estadoSync, 'ERROR')
  assert.equal(rol.estadoSync, 'ERROR')
})

test('11. lastRow administrativo ignora filas sostenidas solo por columnas técnicas', () => {
  let columnasLeidas = null
  const hoja = {
    getLastRow: () => 25,
    getRange: (_fila, _columna, filas, columnas) => {
      columnasLeidas = columnas
      return { getValues: () => Array.from({ length: filas }, () => Array(columnas).fill('')) }
    }
  }

  assert.equal(obtenerUltimaFilaAdministrativaScc_(hoja, [1, 2, 3, 4]), 1)
  assert.equal(columnasLeidas, 4)
})

test('12. lastRow de ROLES_CAMPANIA ignora también la columna B informativa', () => {
  const hoja = {
    getLastRow: () => 2,
    getRange: () => ({ getValues: () => [['', 'Nombre viejo', '', '', '']] })
  }

  assert.equal(obtenerUltimaFilaAdministrativaScc_(hoja, [1, 3, 4, 5]), 1)
})

test('13. los cinco sincronizadores usan filtro administrativo y lastRow administrativo', () => {
  assert.match(fuentes.trabajadores, /obtenerUltimaFilaAdministrativaScc_\(hoja, \[1, 2, 3, 4\]\)/)
  assert.match(fuentes.campanias, /obtenerUltimaFilaAdministrativaScc_\(hoja, \[1, 2, 3, 4, 5\]\)/)
  assert.match(fuentes.variedades, /obtenerUltimaFilaAdministrativaScc_\(hoja, \[1, 2\]\)/)
  assert.match(fuentes.lotes, /obtenerUltimaFilaAdministrativaScc_\(hoja, \[1, 2, 3, 4, 5\]\)/)
  assert.match(fuentes.roles, /obtenerUltimaFilaAdministrativaScc_\(hoja, \[1, 3, 4, 5\]\)/)

  Object.values(fuentes).forEach((source) => {
    assert.match(source, /var pendientes = filtrarFilasPendientesConDatosScc_\(filas\);/)
  })
})
