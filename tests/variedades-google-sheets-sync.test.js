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
const variedadesPure = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'VariedadesPure.gs'),
  'utf8'
)
const variedadesSource = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'Variedades.gs'),
  'utf8'
)
const sql = fs.readFileSync(
  path.join(dirname, '..', 'supabase', 'migrations', '20260930_admin_variedades.sql'),
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
const configSource = fs.readFileSync(
  path.join(dirname, '..', 'apps-script', 'Config.gs'),
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
  Math
})
vm.runInContext(trabajadoresPure + '\n' + variedadesPure, contexto)

const {
  debeMarcarPendienteVariedadesOnEditScc_,
  normalizarListadoVariedadesScc_,
  prepararVariedadParaGuardarScc_,
  procesarFilasPendientesVariedadesScc_,
  tieneCambiosLocalesNoResueltosScc_
} = contexto

const UUID_1 = '11111111-1111-4111-8111-111111111111'
const UUID_2 = '22222222-2222-4222-8222-222222222222'

function fila(overrides = {}) {
  return {
    nombre: ' Ventura ',
    activo: 'Sí',
    estadoSync: 'PENDIENTE',
    observacion: '',
    idSistema: '',
    ultimaSincronizacion: '',
    ...overrides
  }
}

test('variedad requiere nombre', () => {
  assert.throws(
    () => prepararVariedadParaGuardarScc_(fila({ nombre: '  ' })),
    /nombre de la variedad es obligatorio/i
  )
})

test('variedad recorta espacios del nombre', () => {
  const payload = prepararVariedadParaGuardarScc_(fila({ nombre: '  Ventura  ' }))
  assert.equal(payload.p_nombre, 'Ventura')
})

test('Sí se convierte a true para variedad', () => {
  assert.equal(prepararVariedadParaGuardarScc_(fila({ activo: 'Sí' })).p_activo, true)
})

test('No se convierte a false para variedad', () => {
  assert.equal(prepararVariedadParaGuardarScc_(fila({ activo: 'No' })).p_activo, false)
})

test('payload conserva UUID existente', () => {
  const payload = prepararVariedadParaGuardarScc_(fila({ idSistema: UUID_1 }))
  assert.equal(payload.p_variedad_id, UUID_1)
})

test('SQL con ID actualiza exactamente por UUID', () => {
  assert.match(sql, /where v\.id = p_variedad_id;/)
  assert.match(sql, /where id = p_variedad_id\s+returning \* into v_variedad;/)
  assert.match(sql, /La variedad indicada no existe/)
})

test('SQL sin ID busca por nombre UNIQUE', () => {
  assert.match(sql, /where v\.nombre = v_nombre;/)
  assert.match(sql, /if found then[\s\S]*update public\.variedades/i)
})

test('SQL sin ID y nombre inexistente crea variedad', () => {
  assert.match(sql, /else[\s\S]*insert into public\.variedades[\s\S]*nombre,[\s\S]*activo/i)
  assert.match(sql, /v_accion := 'CREADO';/)
})

test('SQL traduce conflicto de nombre a mensaje administrativo', () => {
  assert.match(sql, /Ya existe otra variedad con ese nombre/)
  assert.match(sql, /when unique_violation then/)
})

test('onEdit conceptual de VARIEDADES solo acepta A:B desde fila 2', () => {
  assert.equal(debeMarcarPendienteVariedadesOnEditScc_('VARIEDADES', 2, 1, 1), true)
  assert.equal(debeMarcarPendienteVariedadesOnEditScc_('VARIEDADES', 2, 2, 1), true)
  assert.equal(debeMarcarPendienteVariedadesOnEditScc_('VARIEDADES', 2, 3, 1), false)
  assert.equal(debeMarcarPendienteVariedadesOnEditScc_('VARIEDADES', 1, 1, 1), false)
  assert.equal(debeMarcarPendienteVariedadesOnEditScc_('CAMPANIAS', 2, 1, 1), false)
})

test('marcar edición de variedad escribe PENDIENTE en Estado Sync', () => {
  assert.match(variedadesSource, /columnasVariedades\.estadoSync[\s\S]*\['PENDIENTE'\]/)
})

test('marcar edición de variedad limpia Observación', () => {
  assert.match(variedadesSource, /columnasVariedades\.observacion[\s\S]*\.clearContent\(\)/)
})

test('marcar edición no sobrescribe ID Sistema ni Última sincronización', () => {
  const cuerpo = variedadesSource.match(
    /function marcarEdicionVariedades_\(evento\) \{[\s\S]*?\n\}/
  )?.[0]
  assert.ok(cuerpo)
  assert.doesNotMatch(cuerpo, /columnasVariedades\.idSistema/)
  assert.doesNotMatch(cuerpo, /columnasVariedades\.ultimaSincronizacion/)
})

test('éxito guarda UUID real de variedad', () => {
  const [resultado] = procesarFilasPendientesVariedadesScc_(
    [fila()],
    () => ({ ok: true, accion: 'CREADO', variedad: { id: UUID_1 } }),
    () => '2026-09-30T21:00:00-05:00'
  )
  assert.equal(resultado.estadoSync, 'SINCRONIZADO')
  assert.equal(resultado.idSistema, UUID_1)
  assert.equal(resultado.observacion, '')
})

test('error conserva UUID previo de variedad', () => {
  const [resultado] = procesarFilasPendientesVariedadesScc_(
    [fila({ idSistema: UUID_1 })],
    () => { throw new Error('Ya existe otra variedad con ese nombre') }
  )
  assert.equal(resultado.estadoSync, 'ERROR')
  assert.equal(resultado.idSistema, UUID_1)
  assert.match(resultado.observacion, /otra variedad/)
})

test('fila SINCRONIZADA de variedad no se reprocesa', () => {
  let llamadas = 0
  const [resultado] = procesarFilasPendientesVariedadesScc_(
    [fila({ estadoSync: 'SINCRONIZADO', idSistema: UUID_1 })],
    () => {
      llamadas += 1
      return { ok: true, variedad: { id: UUID_2 } }
    }
  )
  assert.equal(llamadas, 0)
  assert.equal(resultado.idSistema, UUID_1)
})

test('error en una variedad no detiene las siguientes', () => {
  let llamadas = 0
  const resultados = procesarFilasPendientesVariedadesScc_(
    [fila({ nombre: 'Ventura' }), fila({ nombre: 'Biloxi' })],
    () => {
      llamadas += 1
      if (llamadas === 1) throw new Error('falló primera')
      return { ok: true, variedad: { id: UUID_2 } }
    }
  )
  assert.equal(resultados[0].estadoSync, 'ERROR')
  assert.equal(resultados[1].estadoSync, 'SINCRONIZADO')
  assert.equal(llamadas, 2)
})

test('actualización de variedades detecta PENDIENTE', () => {
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila()]), true)
})

test('actualización de variedades detecta ERROR', () => {
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila({ estadoSync: 'ERROR' })]), true)
})

test('listado remoto de variedades se normaliza', () => {
  const resultado = normalizarListadoVariedadesScc_({
    ok: true,
    variedades: [{ id: UUID_1, nombre: ' Ventura ', activo: true }]
  })
  assert.equal(resultado.length, 1)
  assert.equal(resultado[0].id, UUID_1)
  assert.equal(resultado[0].nombre, 'Ventura')
  assert.equal(resultado[0].activo, true)
})

test('RPC guardar usa autorización administrativa existente', () => {
  const cuerpo = sql.match(
    /create or replace function public\.admin_guardar_variedad[\s\S]*?end;\s*\$\$;/i
  )?.[0]
  assert.ok(cuerpo)
  assert.match(cuerpo, /perform public\.autorizar_integracion_gestion_maestros\(\);/)
})

test('RPC listar usa autorización administrativa existente', () => {
  const inicio = sql.indexOf('create or replace function public.admin_listar_variedades()')
  assert.ok(inicio >= 0)
  assert.match(sql.slice(inicio), /perform public\.autorizar_integracion_gestion_maestros\(\);/)
})

test('RPCs de variedades no conceden EXECUTE a anon y sí a authenticated', () => {
  assert.match(sql, /from public, anon, authenticated;/i)
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?\bto\s+anon\b/i)
  assert.match(
    sql,
    /grant execute\s+on function public\.admin_guardar_variedad\(uuid, varchar, boolean\)\s+to authenticated;/i
  )
  assert.match(
    sql,
    /grant execute\s+on function public\.admin_listar_variedades\(\)\s+to authenticated;/i
  )
})

test('migración no concede SELECT directo sobre variedades', () => {
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+(table\s+)?public\.variedades/i)
})

test('RPC listar variedades ordena por nombre ASC e incluye inactivas', () => {
  assert.match(sql, /order by v\.nombre asc/)
  const listado = sql.slice(sql.indexOf('create or replace function public.admin_listar_variedades()'))
  assert.doesNotMatch(listado, /where\s+v\.activo\s*=\s*true/i)
})

test('menú sincroniza TRABAJADORES, CAMPANIAS y VARIEDADES en ese orden', () => {
  const trabajadores = menuSource.indexOf(
    'ejecutarSincronizacionMaestroScc_(sincronizarTrabajadores_)'
  )
  const campanias = menuSource.indexOf(
    'ejecutarSincronizacionMaestroScc_(sincronizarCampanias_)'
  )
  const variedades = menuSource.indexOf(
    'ejecutarSincronizacionMaestroScc_(sincronizarVariedades_)'
  )
  assert.ok(trabajadores >= 0)
  assert.ok(campanias > trabajadores)
  assert.ok(variedades > campanias)
})

test('menú aísla error general de cada maestro', () => {
  assert.match(menuSource, /try \{[\s\S]*var resultado = sincronizar\(\);[\s\S]*catch \(error\)/)
  assert.match(menuSource, /formatearResumenSincronizacionScc_\('Variedades', variedades\)/)
})

test('Actualizar desde sistema soporta la hoja activa VARIEDADES', () => {
  assert.match(menuSource, /nombre === SCC_CONFIG\.hojaVariedades/)
  assert.match(menuSource, /actualizarVariedadesDesdeSistema_\(\)/)
})

test('onEdit conserva TRABAJADORES y CAMPANIAS y añade VARIEDADES', () => {
  assert.match(codeSource, /marcarEdicionTrabajadores_\(e\);/)
  assert.match(codeSource, /marcarEdicionCampanias_\(e\);/)
  assert.match(codeSource, /marcarEdicionVariedades_\(e\);/)
})

test('configuración define exactamente las seis columnas de VARIEDADES', () => {
  assert.match(configSource, /hojaVariedades: 'VARIEDADES'/)
  assert.match(configSource, /columnasVariedades:[\s\S]*nombre: 1,[\s\S]*activo: 2,[\s\S]*estadoSync: 3,[\s\S]*observacion: 4,[\s\S]*idSistema: 5,[\s\S]*ultimaSincronizacion: 6/)
  assert.match(configSource, /SCC_ENCABEZADOS_VARIEDADES[\s\S]*'Nombre'[\s\S]*'Activo'[\s\S]*'Estado Sync'[\s\S]*'Observación'[\s\S]*'ID Sistema'[\s\S]*'Última sincronización'/)
})

test('hoja VARIEDADES protege C:F y usa dropdown Sí/No', () => {
  assert.match(variedadesSource, /requireValueInList\(\['Sí', 'No'\]/)
  assert.match(variedadesSource, /getRange\(1, 3, hoja\.getMaxRows\(\), 4\)/)
})
