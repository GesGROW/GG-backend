import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const read = (relative) => fs.readFileSync(path.join(dirname, '..', relative), 'utf8')
const trabajadoresPure = read('apps-script/TrabajadoresPure.gs')
const lotesPure = read('apps-script/LotesPure.gs')
const lotesSource = read('apps-script/Lotes.gs')
const menuSource = read('apps-script/Menu.gs')
const codeSource = read('apps-script/Code.gs')
const configSource = read('apps-script/Config.gs')
const sql = read('supabase/migrations/20260930_admin_lotes.sql')

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
vm.runInContext(trabajadoresPure + '\n' + lotesPure, contexto)

const {
  debeMarcarPendienteLotesOnEditScc_,
  normalizarListadoLotesScc_,
  obtenerOpcionesCampaniasLotesScc_,
  obtenerOpcionesVariedadesLotesScc_,
  prepararLoteParaGuardarScc_,
  procesarFilasPendientesLotesScc_,
  tieneCambiosLocalesNoResueltosScc_
} = contexto

const LOTE_ID = '11111111-1111-4111-8111-111111111111'
const LOTE_ID_2 = '22222222-2222-4222-8222-222222222222'
const CAMP_ID = '33333333-3333-4333-8333-333333333333'
const CAMP_ID_2 = '44444444-4444-4444-8444-444444444444'
const VAR_ID = '55555555-5555-4555-8555-555555555555'
const VAR_ID_2 = '66666666-6666-4666-8666-666666666666'

const campania = (o = {}) => ({
  codigo: 'CAMP-2026',
  estado: 'ACTIVA',
  estadoSync: 'SINCRONIZADO',
  idSistema: CAMP_ID,
  ...o
})
const variedad = (o = {}) => ({
  nombre: 'Ventura',
  activo: 'Sí',
  estadoSync: 'SINCRONIZADO',
  idSistema: VAR_ID,
  ...o
})
const fila = (o = {}) => ({
  codigo: ' LOTE-001 ',
  nombre: ' Norte ',
  campania: 'CAMP-2026',
  variedad: 'Ventura',
  activo: 'Sí',
  estadoSync: 'PENDIENTE',
  observacion: '',
  idSistema: '',
  ultimaSincronizacion: '',
  ...o
})
const remoto = (o = {}) => ({
  id: LOTE_ID,
  codigo: 'LOTE-001',
  nombre: 'Norte',
  campaniaId: CAMP_ID,
  campaniaCodigo: 'CAMP-2026',
  campaniaEstado: 'ACTIVA',
  variedadId: VAR_ID,
  variedad: 'Ventura',
  variedadActiva: true,
  activo: true,
  ...o
})

test('1. codigo de lote es obligatorio', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila({ codigo: ' ' }),
        [campania()],
        [variedad()],
        []
      ),
    /código del lote es obligatorio/i
  ))
test('2. codigo de lote se recorta', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(
      fila({ codigo: '  LOTE-001  ' }),
      [campania()],
      [variedad()],
      []
    ).p_codigo,
    'LOTE-001'
  ))
test('3. nombre vacío se convierte a null', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(fila({ nombre: '   ' }), [campania()], [variedad()], [])
      .p_nombre,
    null
  ))
test('4. nombre válido se recorta', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(
      fila({ nombre: '  Norte  ' }),
      [campania()],
      [variedad()],
      []
    ).p_nombre,
    'Norte'
  ))
test('5. campaña es obligatoria', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila({ campania: '' }),
        [campania()],
        [variedad()],
        []
      ),
    /campaña es obligatoria/i
  ))
test('6. variedad es obligatoria', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila({ variedad: '' }),
        [campania()],
        [variedad()],
        []
      ),
    /variedad es obligatoria/i
  ))
test('7. Sí se convierte a true', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(fila({ activo: 'Sí' }), [campania()], [variedad()], [])
      .p_activo,
    true
  ))
test('8. No se convierte a false', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(fila({ activo: 'No' }), [campania()], [variedad()], [])
      .p_activo,
    false
  ))

test('9. SQL con ID actualiza exactamente por UUID', () => {
  assert.match(sql, /where l\.id = p_lote_id;/i)
  assert.match(sql, /El lote indicado no existe/)
  assert.match(sql, /where id = v_lote\.id\s+returning \* into v_lote;/i)
})
test('10. SQL sin ID usa campania_id + codigo como fallback', () =>
  assert.match(
    sql,
    /where l\.campania_id = p_campania_id\s+and l\.codigo = v_codigo;/i
  ))
test('11. SQL no usa codigo globalmente como identidad', () =>
  assert.doesNotMatch(sql, /from public\.lotes l\s+where l\.codigo = v_codigo;/i))
test('12. conflicto compuesto devuelve mensaje administrativo', () =>
  assert.match(
    sql,
    /when unique_violation then\s+raise exception 'Ya existe otro lote con ese código en la campaña seleccionada'/i
  ))
test('13. campaña visible se resuelve a UUID', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(fila(), [campania()], [variedad()], []).p_campania_id,
    CAMP_ID
  ))
test('14. campaña no sincronizada produce error local', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila(),
        [campania({ estadoSync: 'PENDIENTE' })],
        [variedad()],
        []
      ),
    /campaña seleccionada no está sincronizada/i
  ))
test('15. campaña cerrada no se acepta para nueva asignación', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila(),
        [campania({ estado: 'CERRADA' })],
        [variedad()],
        []
      ),
    /campaña seleccionada no está activa/i
  ))
test('16. campaña histórica cerrada sin cambio se permite', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(
      fila({ idSistema: LOTE_ID }),
      [campania({ estado: 'CERRADA' })],
      [variedad()],
      [remoto({ campaniaEstado: 'CERRADA' })]
    ).p_campania_id,
    CAMP_ID
  ))
test('17. variedad visible se resuelve a UUID', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(fila(), [campania()], [variedad()], [])
      .p_variedad_ids[0],
    VAR_ID
  ))
test('18. variedad no sincronizada produce error local', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila(),
        [campania()],
        [variedad({ estadoSync: 'ERROR' })],
        []
      ),
    /variedad seleccionada no está sincronizada/i
  ))
test('19. variedad inactiva no se acepta para nueva asignación', () =>
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila(),
        [campania()],
        [variedad({ activo: 'No' })],
        []
      ),
    /variedad seleccionada no está activa/i
  ))
test('20. variedad histórica inactiva sin cambio se permite', () =>
  assert.equal(
    prepararLoteParaGuardarScc_(
      fila({ idSistema: LOTE_ID }),
      [campania()],
      [variedad({ activo: 'No' })],
      [remoto({ variedadActiva: false })]
    ).p_variedad_ids[0],
    VAR_ID
  ))

test('21. onEdit conceptual de LOTES solo acepta A:E desde fila 2', () => {
  assert.equal(debeMarcarPendienteLotesOnEditScc_('LOTES', 2, 1, 5), true)
  assert.equal(debeMarcarPendienteLotesOnEditScc_('LOTES', 2, 6, 1), false)
  assert.equal(debeMarcarPendienteLotesOnEditScc_('LOTES', 1, 1, 1), false)
})
test('22. onEdit de LOTES conserva ID Sistema y Última sincronización', () => {
  const cuerpo = lotesSource.match(
    /function marcarEdicionLotes_\(evento\) \{[\s\S]*?\n\}/
  )?.[0]
  assert.ok(cuerpo)
  assert.doesNotMatch(
    cuerpo,
    /columnasLotes\.idSistema|columnasLotes\.ultimaSincronizacion/
  )
})
test('23. éxito guarda UUID real del lote', () => {
  const [r] = procesarFilasPendientesLotesScc_(
    [fila()],
    [campania()],
    [variedad()],
    [],
    () => ({ ok: true, lote: { id: LOTE_ID } }),
    () => 'ahora'
  )
  assert.equal(r.estadoSync, 'SINCRONIZADO')
  assert.equal(r.idSistema, LOTE_ID)
})
test('24. error preserva UUID previo', () => {
  const [r] = procesarFilasPendientesLotesScc_(
    [fila({ idSistema: LOTE_ID })],
    [campania()],
    [variedad()],
    [remoto()],
    () => {
      throw new Error('falló')
    }
  )
  assert.equal(r.estadoSync, 'ERROR')
  assert.equal(r.idSistema, LOTE_ID)
})
test('25. fila SINCRONIZADA no se reprocesa', () => {
  let llamadas = 0
  const [r] = procesarFilasPendientesLotesScc_(
    [fila({ estadoSync: 'SINCRONIZADO', idSistema: LOTE_ID })],
    [campania()],
    [variedad()],
    [remoto()],
    () => {
      llamadas += 1
    }
  )
  assert.equal(llamadas, 0)
  assert.equal(r.idSistema, LOTE_ID)
})
test('26. error en un lote no detiene filas siguientes', () => {
  let llamadas = 0
  const rs = procesarFilasPendientesLotesScc_(
    [fila(), fila({ codigo: 'LOTE-002' })],
    [campania()],
    [variedad()],
    [],
    () => {
      llamadas += 1
      if (llamadas === 1) throw new Error('primera')
      return { ok: true, lote: { id: LOTE_ID_2 } }
    }
  )
  assert.equal(rs[0].estadoSync, 'ERROR')
  assert.equal(rs[1].estadoSync, 'SINCRONIZADO')
})
test('27. menú procesa LOTES después de CAMPANIAS y VARIEDADES', () => {
  const c = menuSource.indexOf('sincronizarCampanias_')
  const v = menuSource.indexOf('sincronizarVariedades_')
  const l = menuSource.indexOf('sincronizarLotes_')
  assert.ok(c >= 0 && v > c && l > v)
})
test('28. LOTES relee referencias y acepta referencias recién sincronizadas', () => {
  assert.match(lotesSource, /var campanias = leerFilasCampanias_\(hojaCampanias\);/)
  assert.match(lotesSource, /var variedades = leerFilasVariedades_\(hojaVariedades\);/)
  const p = prepararLoteParaGuardarScc_(fila(), [campania()], [variedad()], [])
  assert.equal(p.p_campania_id, CAMP_ID)
  assert.equal(p.p_variedad_ids[0], VAR_ID)
})
test('29. actualizar LOTES detecta PENDIENTE', () =>
  assert.equal(tieneCambiosLocalesNoResueltosScc_([fila()]), true))
test('30. actualizar LOTES detecta ERROR', () =>
  assert.equal(
    tieneCambiosLocalesNoResueltosScc_([fila({ estadoSync: 'ERROR' })]),
    true
  ))
test('31. listado remoto de LOTES se normaliza con referencias históricas', () => {
  const [r] = normalizarListadoLotesScc_({
    ok: true,
    lotes: [
      {
        id: LOTE_ID,
        codigo: ' LOTE-001 ',
        nombre: null,
        campania_id: CAMP_ID,
        campania_codigo: 'CAMP-2026',
        campania_estado: 'CERRADA',
        variedad_id: VAR_ID,
        variedad: 'Ventura',
        variedad_activa: false,
        activo: false
      }
    ]
  })
  assert.equal(r.codigo, 'LOTE-001')
  assert.equal(r.nombre, null)
  assert.equal(r.campaniaEstado, 'CERRADA')
  assert.equal(r.variedadActiva, false)
})
test('32. dropdown de campaña usa maestro sincronizado ACTIVA', () => {
  assert.deepEqual(
    Array.from(
      obtenerOpcionesCampaniasLotesScc_([
        campania(),
        campania({ codigo: 'CERRADA', estado: 'CERRADA', idSistema: CAMP_ID_2 })
      ])
    ),
    ['CAMP-2026']
  )
  assert.match(lotesSource, /requireValueInList\(opcionesCampanias, true\)/)
  assert.match(lotesSource, /setAllowInvalid\(true\)/)
})
test('33. dropdown de variedad usa maestro sincronizado activo', () => {
  assert.deepEqual(
    Array.from(
      obtenerOpcionesVariedadesLotesScc_([
        variedad(),
        variedad({ nombre: 'Biloxi', activo: 'No', idSistema: VAR_ID_2 })
      ])
    ),
    ['Ventura']
  )
  assert.match(lotesSource, /requireValueInList\(opcionesVariedades, true\)/)
})
test('34. TRABAJADORES permanece sin regresión de integración', () => {
  assert.match(menuSource, /sincronizarTrabajadores_/)
  assert.match(codeSource, /marcarEdicionTrabajadores_\(e\);/)
})
test('35. CAMPANIAS permanece sin regresión de integración', () => {
  assert.match(menuSource, /sincronizarCampanias_/)
  assert.match(codeSource, /marcarEdicionCampanias_\(e\);/)
})
test('36. VARIEDADES permanece sin regresión de integración', () => {
  assert.match(menuSource, /sincronizarVariedades_/)
  assert.match(codeSource, /marcarEdicionVariedades_\(e\);/)
})
test('37. RPCs de LOTES no conceden EXECUTE a anon', () => {
  assert.match(sql, /from public, anon, authenticated;/i)
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?\bto\s+anon\b/i)
  assert.match(
    sql,
    /admin_guardar_lote\(uuid, varchar, varchar, uuid, uuid, boolean\)\s+to authenticated;/i
  )
  assert.match(sql, /admin_listar_lotes\(\)\s+to authenticated;/i)
})

test('configuración LOTES define A:I y protege F:I', () => {
  assert.match(configSource, /hojaLotes: 'LOTES'/)
  assert.match(
    configSource,
    /columnasLotes:[\s\S]*codigo: 1,[\s\S]*ultimaSincronizacion: 9/
  )
  assert.match(lotesSource, /getRange\(1, 6, hoja\.getMaxRows\(\), 4\)/)
})
test('actualizar desde sistema soporta LOTES y reconstruye UUID real', () => {
  assert.match(menuSource, /nombre === SCC_CONFIG\.hojaLotes/)
  assert.match(menuSource, /actualizarLotesDesdeSistema_\(\)/)
  assert.match(lotesSource, /lote\.id,[\s\S]*ahora/)
})
test('SQL valida reglas históricas y no concede SELECT directo', () => {
  assert.match(
    sql,
    /v_cambio_campania := v_lote\.campania_id is distinct from p_campania_id/
  )
  assert.match(
    sql,
    /v_cambio_variedad := v_lote\.variedad_id is distinct from p_variedad_id/
  )
  assert.match(sql, /La campaña seleccionada no está activa/)
  assert.match(sql, /La variedad seleccionada no está activa/)
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+(table\s+)?public\.lotes/i)
})
test('listado SQL incluye históricos y ordena por campaña y código', () => {
  const listado = sql.slice(
    sql.indexOf('create or replace function public.admin_listar_lotes()')
  )
  assert.match(listado, /join public\.campanias c on c\.id = l\.campania_id/)
  assert.match(listado, /join public\.variedades v on v\.id = l\.variedad_id/)
  assert.match(listado, /order by c\.codigo asc, l\.codigo asc/)
  assert.doesNotMatch(listado, /where\s+l\.activo\s*=\s*true/i)
})

test('LOTES resuelve varias variedades separadas por punto y coma y elimina duplicados', () => {
  const payload = prepararLoteParaGuardarScc_(
    fila({ variedad: ' Ventura ; Biloxi ; Ventura ' }),
    [campania()],
    [variedad(), variedad({ nombre: 'Biloxi', idSistema: VAR_ID_2 })],
    []
  )
  assert.deepEqual(Array.from(payload.p_variedad_ids), [VAR_ID, VAR_ID_2])
  assert.match(
    lotesSource,
    /llamarRpcSupabase_\('admin_guardar_lote_variedades', payload\)/
  )
})

test('LOTES valida cada variedad sin enviar un conjunto parcialmente válido', () => {
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila({ variedad: 'Ventura; No existe' }),
        [campania()],
        [variedad()],
        []
      ),
    /no está sincronizada/
  )
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila({ variedad: 'Ventura;' }),
        [campania()],
        [variedad()],
        []
      ),
    /variedad es obligatoria/
  )
})

test('LOTES conserva las variedades históricas inactivas y rechaza agregar otra inactiva', () => {
  const referencias = [
    variedad({ activo: 'No' }),
    variedad({ nombre: 'Biloxi', idSistema: VAR_ID_2, activo: 'No' })
  ]
  const original = remoto({ variedadIds: [VAR_ID, VAR_ID_2] })
  const payload = prepararLoteParaGuardarScc_(
    fila({ idSistema: LOTE_ID, variedad: 'Ventura; Biloxi' }),
    [campania()],
    referencias,
    [original]
  )
  assert.deepEqual(Array.from(payload.p_variedad_ids), [VAR_ID, VAR_ID_2])
  assert.throws(
    () =>
      prepararLoteParaGuardarScc_(
        fila({ idSistema: LOTE_ID, variedad: 'Ventura; Biloxi' }),
        [campania()],
        referencias,
        [remoto()]
      ),
    /no está activa/
  )
})

test('LOTES reconstruye varias variedades del sistema en una única fila', () => {
  const [lote] = normalizarListadoLotesScc_({
    ok: true,
    lotes: [
      {
        id: LOTE_ID,
        codigo: 'L1',
        nombre: null,
        campania_id: CAMP_ID,
        campania_codigo: 'CAMP-2026',
        campania_estado: 'ACTIVA',
        activo: true,
        variedades: [
          { id: VAR_ID, nombre: 'Ventura', activo: true },
          { id: VAR_ID_2, nombre: 'Biloxi', activo: false }
        ]
      }
    ]
  })
  assert.equal(lote.variedad, 'Ventura; Biloxi')
  assert.deepEqual(Array.from(lote.variedadIds), [VAR_ID, VAR_ID_2])
})
