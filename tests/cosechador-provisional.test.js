import 'fake-indexeddb/auto'
import * as lookupDb from '@gesgrow/harvest-client-contracts/src/offline/db.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  guardarAsignacionOffline,
  guardarCache,
  seleccionarCampaniaLocal,
  obtenerColaCompleta,
  obtenerTrabajador
} from '@gesgrow/harvest-client-contracts/src/offline/db.js'
import {
  crearBuscarCosechadorLocal,
  nombreCosechadorVisible
} from '@gesgrow/core/contexts/workforce/index.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migration = fs.readFileSync(
  path.join(
    dirname,
    '..',
    'supabase',
    'migrations',
    '202610010230_cosechador_provisional_asignar_ticket.sql'
  ),
  'utf8'
)

const buscarCosechadorLocal = crearBuscarCosechadorLocal({
  trabajadores: { obtener: lookupDb.obtenerTrabajador },
  campaignManagement: { obtenerActiva: lookupDb.obtenerCampaniaActiva }
})

async function cargarCache(trabajadores = []) {
  await seleccionarCampaniaLocal('campania-provisional')
  await guardarCache({
    campania: { id: 'campania-provisional', nombre: 'Campaña provisional' },
    sincronizado_en: new Date().toISOString(),
    trabajadores,
    lotes: [],
    tickets: []
  })
}

test('cosechador existente y activo conserva su identidad local', async () => {
  await cargarCache([
    { dni: '74821001', nombre: 'Ana Pérez', activo: true, roles: ['COSECHADOR'] }
  ])

  const cosechador = await buscarCosechadorLocal('74821001', {
    permitirProvisional: true
  })

  assert.equal(cosechador.nombre, 'Ana Pérez')
  assert.equal(cosechador.provisional_local, undefined)
})

test('trabajador existente sin rol se habilita provisionalmente como COSECHADOR', async () => {
  await cargarCache([{ dni: '74821002', nombre: 'Luis Soto', activo: true, roles: [] }])

  const cosechador = await buscarCosechadorLocal('74821002', {
    permitirProvisional: true
  })

  assert.equal(cosechador.nombre, 'Luis Soto')
  assert.equal(cosechador.roles.includes('COSECHADOR'), true)
  assert.equal(cosechador.provisional_local, true)
})

test('DNI inexistente se representa como cosechador provisional con fallback visible', async () => {
  await cargarCache([])

  const cosechador = await buscarCosechadorLocal('74821563', {
    permitirProvisional: true
  })

  assert.equal(cosechador.nombre, 'DNI 74821563')
  assert.deepEqual(cosechador.roles, ['COSECHADOR'])
  assert.equal(cosechador.activo, true)
})

test('fallback de nombre usa DNI cuando el nombre está vacío', () => {
  assert.equal(nombreCosechadorVisible('', '74821563'), 'DNI 74821563')
  assert.equal(nombreCosechadorVisible('  Rosa Díaz  ', '74821563'), 'Rosa Díaz')
})

test('asignación offline crea un solo ASIGNAR_TICKET y persiste cosechador provisional', async () => {
  await cargarCache([])
  const antes = await obtenerColaCompleta()

  const operacion = await guardarAsignacionOffline({
    codigoTicket: 'PROV-TICKET-001',
    cosechadorDni: '74821564',
    cosechador: 'DNI 74821564',
    dniOperador: '70000000'
  })

  const despues = await obtenerColaCompleta()
  const nuevas = despues.filter(
    (item) => !antes.some((previa) => previa.id === item.id)
  )
  const trabajador = await obtenerTrabajador('74821564')

  assert.equal(nuevas.length, 1)
  assert.equal(nuevas[0].id, operacion.id)
  assert.equal(nuevas[0].tipo, 'ASIGNAR_TICKET')
  assert.equal(trabajador.nombre, 'DNI 74821564')
  assert.equal(trabajador.roles.includes('COSECHADOR'), true)
  assert.equal(trabajador.provisional_local, true)
})

test('refresco de caché conserva provisional pendiente y luego adopta nombre real', async () => {
  await cargarCache([])
  await guardarAsignacionOffline({
    codigoTicket: 'PROV-TICKET-002',
    cosechadorDni: '74821565',
    cosechador: 'DNI 74821565',
    dniOperador: '70000000'
  })

  await cargarCache([])
  assert.equal((await obtenerTrabajador('74821565')).nombre, 'DNI 74821565')

  await cargarCache([
    {
      dni: '74821565',
      nombre: 'María López',
      activo: true,
      roles: ['COSECHADOR']
    }
  ])

  const actualizado = await obtenerTrabajador('74821565')
  assert.equal(actualizado.nombre, 'María López')
  assert.equal(actualizado.roles.includes('COSECHADOR'), true)
  assert.equal(actualizado.provisional_local, undefined)
})

test('SQL crea provisional vacío sin tocar usuarios_app y evita duplicados por DNI', () => {
  assert.match(migration, /values \(v_dni, '', '', true\)/i)
  assert.match(migration, /on conflict \(dni\) do nothing/i)
  assert.doesNotMatch(migration, /usuarios_app/i)
})

test('SQL crea o reactiva COSECHADOR de la campaña activa sin duplicar rol', () => {
  assert.match(migration, /where c\.estado = 'ACTIVA'::public\.estado_campania/i)
  assert.match(migration, /'COSECHADOR'::public\.rol_trabajador/i)
  assert.match(
    migration,
    /on conflict \(trabajador_id, campania_id, rol\)\s+do update set activo = true/i
  )
})

test('wrapper idempotente revisa recibo antes de garantizar cosechador y luego asigna', () => {
  const receipt = migration.indexOf('if found then')
  const helper = migration.indexOf(
    'perform public.obtener_o_registrar_cosechador_activo(p_dni_cosechador);',
    receipt
  )
  const assignment = migration.indexOf(
    'public.asignar_ticket(\n      p_dni_operador,\n      p_dni_cosechador,\n      p_codigo_ticket\n    )',
    helper
  )

  assert.ok(receipt >= 0)
  assert.ok(helper > receipt)
  assert.ok(assignment > helper)
})
