import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const trabajadoresPure = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'TrabajadoresPure.gs'),
  'utf8'
)
const campaniasPure = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'CampaniasPure.gs'),
  'utf8'
)
const sql = fs.readFileSync(
  path.join(dirname, '..', 'supabase', 'migrations', '20260930_admin_campanias.sql'),
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
vm.runInContext(trabajadoresPure + '\n' + campaniasPure, contexto)

const {
  convertirFechaPostgresParaHojaScc_,
  debeMarcarPendienteCampaniasOnEditScc_,
  esFilaPendienteScc_,
  normalizarEstadoCampaniaScc_,
  normalizarListadoCampaniasScc_,
  prepararCampaniaParaGuardarScc_,
  procesarFilasPendientesCampaniasScc_,
  tieneCambiosLocalesNoResueltosScc_
} = contexto

const UUID_1 = '11111111-1111-4111-8111-111111111111'
const UUID_2 = '22222222-2222-4222-8222-222222222222'

function fila(overrides = {}) {
  return {
    codigo: ' CAMP-2026 ',
    nombre: ' Campaña 2026 ',
    fechaInicio: '2026-09-30',
    fechaFin: '',
    estado: 'ACTIVA',
    estadoSync: 'PENDIENTE',
    observacion: '',
    idSistema: '',
    ultimaSincronizacion: '',
    ...overrides
  }
}

test('campaña requiere código', () => {
  assert.throws(
    () => prepararCampaniaParaGuardarScc_(fila({ codigo: '  ' })),
    /código de campaña es obligatorio/i
  )
})

test('campaña requiere nombre', () => {
  assert.throws(
    () => prepararCampaniaParaGuardarScc_(fila({ nombre: '' })),
    /nombre de campaña es obligatorio/i
  )
})

test('campaña requiere fecha de inicio', () => {
  assert.throws(
    () => prepararCampaniaParaGuardarScc_(fila({ fechaInicio: '' })),
    /fecha de inicio es obligatoria/i
  )
})

test('fecha de fin es nullable', () => {
  const payload = prepararCampaniaParaGuardarScc_(fila({ fechaFin: '' }))
  assert.equal(payload.p_fecha_fin, null)
})

test('fecha de fin anterior a inicio es inválida', () => {
  assert.throws(
    () => prepararCampaniaParaGuardarScc_(
      fila({ fechaInicio: '2026-09-30', fechaFin: '2026-09-29' })
    ),
    /fecha de fin no puede ser anterior/i
  )
})

test('ACTIVA es estado válido', () => {
  assert.equal(normalizarEstadoCampaniaScc_('ACTIVA'), 'ACTIVA')
})

test('CERRADA es estado válido', () => {
  assert.equal(normalizarEstadoCampaniaScc_('CERRADA'), 'CERRADA')
})

test('estado de campaña inválido se rechaza', () => {
  assert.throws(() => normalizarEstadoCampaniaScc_('PAUSADA'), /ACTIVA o CERRADA/)
})

test('Date se convierte a YYYY-MM-DD mediante formateador de timezone del Sheet', () => {
  const instante = new Date('2026-09-30T00:30:00+14:00')
  assert.equal(instante.toISOString().slice(0, 10), '2026-09-29')

  let recibida = null
  const payload = prepararCampaniaParaGuardarScc_(
    fila({ fechaInicio: instante }),
    (fecha) => {
      recibida = fecha
      return '2026-09-30'
    }
  )

  assert.equal(recibida, instante)
  assert.equal(payload.p_fecha_inicio, '2026-09-30')
})

test('fecha PostgreSQL se parsea usando texto calendario y timezone sin UTC intermedio', () => {
  let argumentos = null
  const marcador = { fecha: 'local' }
  const resultado = convertirFechaPostgresParaHojaScc_(
    '2026-09-30',
    (texto, zona, formato) => {
      argumentos = { texto, zona, formato }
      return marcador
    },
    'America/Lima'
  )

  assert.equal(resultado, marcador)
  assert.deepEqual(argumentos, {
    texto: '2026-09-30',
    zona: 'America/Lima',
    formato: 'yyyy-MM-dd'
  })
})

test('onEdit de CAMPANIAS solo marca cuando la edición toca A:E desde fila 2', () => {
  assert.equal(debeMarcarPendienteCampaniasOnEditScc_('CAMPANIAS', 2, 1, 1), true)
  assert.equal(debeMarcarPendienteCampaniasOnEditScc_('CAMPANIAS', 2, 5, 1), true)
  assert.equal(debeMarcarPendienteCampaniasOnEditScc_('CAMPANIAS', 2, 6, 1), false)
  assert.equal(debeMarcarPendienteCampaniasOnEditScc_('CAMPANIAS', 1, 1, 1), false)
  assert.equal(debeMarcarPendienteCampaniasOnEditScc_('TRABAJADORES', 2, 1, 1), false)
})

test('identifica fila PENDIENTE de campaña', () => {
  assert.equal(esFilaPendienteScc_(' pendiente '), true)
  assert.equal(esFilaPendienteScc_('SINCRONIZADO'), false)
})

test('éxito de campaña guarda ID Sistema real', () => {
  const [resultado] = procesarFilasPendientesCampaniasScc_(
    [fila()],
    () => ({ ok: true, accion: 'CREADO', campania: { id: UUID_1 } }),
    () => '2026-09-30T20:00:00-05:00'
  )

  assert.equal(resultado.estadoSync, 'SINCRONIZADO')
  assert.equal(resultado.idSistema, UUID_1)
  assert.equal(resultado.observacion, '')
})

test('error de campaña preserva ID Sistema existente', () => {
  const [resultado] = procesarFilasPendientesCampaniasScc_(
    [fila({ idSistema: UUID_1 })],
    () => { throw new Error('Ya existe otra campaña activa') }
  )

  assert.equal(resultado.estadoSync, 'ERROR')
  assert.equal(resultado.idSistema, UUID_1)
  assert.match(resultado.observacion, /otra campaña activa/)
})

test('fila de campaña SINCRONIZADA no se reprocesa', () => {
  let llamadas = 0
  const [resultado] = procesarFilasPendientesCampaniasScc_(
    [fila({ estadoSync: 'SINCRONIZADO', idSistema: UUID_1 })],
    () => {
      llamadas += 1
      return { ok: true, campania: { id: UUID_2 } }
    }
  )

  assert.equal(llamadas, 0)
  assert.equal(resultado.idSistema, UUID_1)
})

test('actualizar campañas detecta PENDIENTE y ERROR antes de sobrescribir', () => {
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila()]), true)
  assert.equal(
    tieneCambiosLocalesNoResueltosScc_([fila({ estadoSync: 'ERROR' })]),
    true
  )
  assert.equal(
    tieneCambiosLocalesNoResueltosScc_([fila({ estadoSync: 'SINCRONIZADO' })]),
    false
  )
})

test('listado remoto de campañas se normaliza sin convertir DATE a UTC', () => {
  const resultado = normalizarListadoCampaniasScc_({
    ok: true,
    campanias: [{
      id: UUID_1,
      codigo: ' CAMP-2026 ',
      nombre: ' Campaña 2026 ',
      fecha_inicio: '2026-09-30',
      fecha_fin: null,
      estado: 'ACTIVA'
    }]
  })

  assert.equal(resultado.length, 1)
  assert.equal(resultado[0].codigo, 'CAMP-2026')
  assert.equal(resultado[0].nombre, 'Campaña 2026')
  assert.equal(resultado[0].fechaInicio, '2026-09-30')
  assert.equal(resultado[0].fechaFin, null)
  assert.equal(resultado[0].estado, 'ACTIVA')
})

test('SQL valida datos existentes antes de crear el índice de una sola ACTIVA', () => {
  const validacion = sql.indexOf('if v_activas > 1 then')
  const indice = sql.indexOf('create unique index if not exists ux_campanias_una_activa')
  assert.ok(validacion >= 0)
  assert.ok(indice > validacion)
  assert.match(sql, /No se puede aplicar la regla de una sola campaña activa/)
})

test('SQL crea UNIQUE parcial que permite como máximo una campaña ACTIVA', () => {
  assert.match(
    sql,
    /create unique index if not exists ux_campanias_una_activa[\s\S]*on public\.campanias \(\(true\)\)[\s\S]*where estado = 'ACTIVA'::public\.estado_campania;/i
  )
})

test('RPC guardar usa autorización administrativa reutilizable', () => {
  const cuerpo = sql.match(
    /create or replace function public\.admin_guardar_campania[\s\S]*?end;\s*\$\$;/i
  )?.[0]
  assert.ok(cuerpo)
  assert.match(cuerpo, /perform public\.autorizar_integracion_gestion_maestros\(\);/)
})

test('RPC listar usa autorización administrativa reutilizable', () => {
  const inicio = sql.indexOf('create or replace function public.admin_listar_campanias()')
  assert.ok(inicio >= 0)
  assert.match(
    sql.slice(inicio),
    /perform public\.autorizar_integracion_gestion_maestros\(\);/
  )
})

test('SQL actualiza exactamente por ID cuando p_campania_id existe', () => {
  assert.match(sql, /where c\.id = p_campania_id;/)
  assert.match(sql, /where id = p_campania_id\s+returning \* into v_campania;/)
  assert.match(sql, /La campaña indicada no existe/)
})

test('SQL usa codigo UNIQUE como fallback cuando no hay ID', () => {
  assert.match(sql, /where c\.codigo = v_codigo;/)
  assert.match(sql, /if found then[\s\S]*update public\.campanias/i)
  assert.match(sql, /else[\s\S]*insert into public\.campanias/i)
})

test('SQL convierte conflicto de campaña ACTIVA en mensaje administrativo', () => {
  assert.match(sql, /Ya existe otra campaña activa/)
  assert.match(sql, /when unique_violation then/)
})

test('RPCs de campañas no conceden EXECUTE a anon', () => {
  assert.match(
    sql,
    /revoke all[\s\S]*admin_guardar_campania[\s\S]*from public, anon, authenticated;/i
  )
  assert.match(
    sql,
    /revoke all[\s\S]*admin_listar_campanias\(\)[\s\S]*from public, anon, authenticated;/i
  )
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?\bto\s+anon\b/i)
})

test('migración no concede SELECT directo sobre campanias', () => {
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+(table\s+)?public\.campanias/i)
})

test('menú sincroniza TRABAJADORES antes que CAMPANIAS y aísla errores de hoja', () => {
  const trabajadores = menuSource.indexOf(
    'ejecutarSincronizacionMaestroScc_(sincronizarTrabajadores_)'
  )
  const campanias = menuSource.indexOf(
    'ejecutarSincronizacionMaestroScc_(sincronizarCampanias_)'
  )
  assert.ok(trabajadores >= 0)
  assert.ok(campanias > trabajadores)
  assert.match(menuSource, /try \{[\s\S]*var resultado = sincronizar\(\);[\s\S]*catch \(error\)/)
})

test('Actualizar desde sistema selecciona RPC por hoja activa', () => {
  assert.match(menuSource, /getActiveSheet\(\)/)
  assert.match(menuSource, /actualizarTrabajadoresDesdeSistema_\(\)/)
  assert.match(menuSource, /actualizarCampaniasDesdeSistema_\(\)/)
})

test('onEdit conserva el flujo de TRABAJADORES y añade CAMPANIAS', () => {
  assert.match(codeSource, /marcarEdicionTrabajadores_\(e\);/)
  assert.match(codeSource, /marcarEdicionCampanias_\(e\);/)
})
