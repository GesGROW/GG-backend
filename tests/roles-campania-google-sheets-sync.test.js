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
const rolesPure = read('apps-script/RolesCampaniaPure.gs')
const rolesSource = read('apps-script/RolesCampania.gs')
const menuSource = read('apps-script/Menu.gs')
const codeSource = read('apps-script/Code.gs')
const configSource = read('apps-script/Config.gs')
const sql = read('supabase/migrations/20261001_admin_roles_campania.sql')

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
vm.runInContext(trabajadoresPure + '\n' + lotesPure + '\n' + rolesPure, contexto)

const {
  debeMarcarPendienteRolesCampaniaOnEditScc_,
  normalizarListadoRolesCampaniaScc_,
  normalizarRolCampaniaScc_,
  obtenerOpcionesCampaniasRolesCampaniaScc_,
  obtenerOpcionesRolesCampaniaScc_,
  obtenerOpcionesTrabajadoresRolesCampaniaScc_,
  prepararRolCampaniaParaGuardarScc_,
  procesarFilasPendientesRolesCampaniaScc_
} = contexto

const ROL_ID = '11111111-1111-4111-8111-111111111111'
const ROL_ID_2 = '22222222-2222-4222-8222-222222222222'
const TRAB_ID = '33333333-3333-4333-8333-333333333333'
const TRAB_ID_2 = '44444444-4444-4444-8444-444444444444'
const CAMP_ID = '55555555-5555-4555-8555-555555555555'
const CAMP_ID_2 = '66666666-6666-4666-8666-666666666666'

const trabajador = (o = {}) => ({
  dni: '80000001',
  nombres: 'Ana',
  apellidos: 'Pérez',
  activo: 'Sí',
  estadoSync: 'SINCRONIZADO',
  idSistema: TRAB_ID,
  ...o
})
const campania = (o = {}) => ({
  codigo: 'CAMP-2026',
  estado: 'ACTIVA',
  estadoSync: 'SINCRONIZADO',
  idSistema: CAMP_ID,
  ...o
})
const fila = (o = {}) => ({
  dni: '80000001',
  trabajador: 'Ana Pérez',
  campania: 'CAMP-2026',
  rol: 'JABERO',
  activo: 'Sí',
  estadoSync: 'PENDIENTE',
  observacion: '',
  idSistema: '',
  ultimaSincronizacion: '',
  ...o
})
const remoto = (o = {}) => ({
  id: ROL_ID,
  trabajadorId: TRAB_ID,
  dni: '80000001',
  trabajador: 'Ana Pérez',
  campaniaId: CAMP_ID,
  campaniaCodigo: 'CAMP-2026',
  campaniaEstado: 'ACTIVA',
  rol: 'JABERO',
  activo: true,
  accesoApp: true,
  ...o
})

test('1. trabajador es obligatorio', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila({ dni: '' }),
        [trabajador()],
        [campania()],
        []
      ),
    /trabajador es obligatorio/i
  )
})

test('2. campaña es obligatoria', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila({ campania: '' }),
        [trabajador()],
        [campania()],
        []
      ),
    /campaña es obligatoria/i
  )
})

test('3. rol obligatorio y enum válido', () => {
  assert.throws(() => normalizarRolCampaniaScc_(''), /rol es obligatorio/i)
  assert.throws(
    () => normalizarRolCampaniaScc_('ADMIN'),
    /rol seleccionado no es válido/i
  )
  assert.equal(normalizarRolCampaniaScc_(' jabero '), 'JABERO')
  assert.deepEqual(Array.from(obtenerOpcionesRolesCampaniaScc_()), [
    'COSECHADOR',
    'JABERO',
    'SUPERVISORA'
  ])
})

test('4. Sí y No se convierten a boolean', () => {
  assert.equal(
    prepararRolCampaniaParaGuardarScc_(
      fila({ activo: 'Sí' }),
      [trabajador()],
      [campania()],
      []
    ).p_activo,
    true
  )
  assert.equal(
    prepararRolCampaniaParaGuardarScc_(
      fila({ activo: 'No' }),
      [trabajador()],
      [campania()],
      []
    ).p_activo,
    false
  )
})

test('5. trabajador visible resuelve a UUID', () => {
  assert.equal(
    prepararRolCampaniaParaGuardarScc_(fila(), [trabajador()], [campania()], [])
      .p_trabajador_id,
    TRAB_ID
  )
})

test('6. trabajador no sincronizado falla localmente', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila(),
        [trabajador({ estadoSync: 'PENDIENTE' })],
        [campania()],
        []
      ),
    /trabajador seleccionado no está sincronizado/i
  )
})

test('7. campaña visible resuelve a UUID', () => {
  assert.equal(
    prepararRolCampaniaParaGuardarScc_(fila(), [trabajador()], [campania()], [])
      .p_campania_id,
    CAMP_ID
  )
})

test('8. campaña no sincronizada falla localmente', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila(),
        [trabajador()],
        [campania({ estadoSync: 'ERROR' })],
        []
      ),
    /campaña seleccionada no está sincronizada/i
  )
})

test('9. nueva asignación rechaza trabajador inactivo', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila(),
        [trabajador({ activo: 'No' })],
        [campania()],
        []
      ),
    /trabajador seleccionado no está activo/i
  )
})

test('10. nueva asignación rechaza campaña cerrada', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila(),
        [trabajador()],
        [campania({ estado: 'CERRADA' })],
        []
      ),
    /campaña seleccionada no está activa/i
  )
})

test('11. histórico sin cambio permite trabajador y campaña ya inactivos', () => {
  const payload = prepararRolCampaniaParaGuardarScc_(
    fila({ idSistema: ROL_ID }),
    [trabajador({ activo: 'No' })],
    [campania({ estado: 'CERRADA' })],
    [remoto({ campaniaEstado: 'CERRADA' })]
  )
  assert.equal(payload.p_trabajador_id, TRAB_ID)
  assert.equal(payload.p_campania_id, CAMP_ID)
})

test('12. reactivación exige vigencia', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila({ idSistema: ROL_ID, activo: 'Sí' }),
        [trabajador({ activo: 'No' })],
        [campania()],
        [remoto({ activo: false })]
      ),
    /trabajador seleccionado no está activo/i
  )
})

test('13. cambio de identidad exige vigencia', () => {
  assert.throws(
    () =>
      prepararRolCampaniaParaGuardarScc_(
        fila({ idSistema: ROL_ID, dni: '80000002' }),
        [
          trabajador(),
          trabajador({ dni: '80000002', idSistema: TRAB_ID_2, activo: 'No' })
        ],
        [campania()],
        [remoto()]
      ),
    /trabajador seleccionado no está activo/i
  )
})

test('14. SQL con UUID actualiza exactamente por ID', () => {
  assert.match(sql, /where tcr\.id = p_rol_id;/i)
  assert.match(sql, /El rol de campaña indicado no existe/i)
  assert.match(sql, /where id = v_rol\.id\s+returning \* into v_rol;/i)
})

test('15. SQL sin UUID usa triple trabajador campaña rol', () => {
  assert.match(
    sql,
    /where tcr\.trabajador_id = p_trabajador_id\s+and tcr\.campania_id = p_campania_id\s+and tcr\.rol = p_rol;/i
  )
})

test('16. identidad persistente no usa DNI ni nombre visible', () => {
  const fallback = sql.slice(
    sql.indexOf('else\n    select tcr.* into v_rol'),
    sql.indexOf('if found then')
  )
  assert.doesNotMatch(fallback, /\.dni|nombres|apellidos/i)
  const payload = prepararRolCampaniaParaGuardarScc_(
    fila(),
    [trabajador()],
    [campania()],
    []
  )
  assert.equal('p_dni' in payload, false)
  assert.equal('p_trabajador' in payload, false)
})

test('17. unique_violation tiene mensaje administrativo', () => {
  assert.match(
    sql,
    /when unique_violation then\s+raise exception 'El trabajador ya tiene ese rol en la campaña seleccionada'/i
  )
})

test('18. onEdit solo marca A, C, D o E desde fila 2', () => {
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 2, 1, 1),
    true
  )
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 2, 2, 1),
    false
  )
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 2, 3, 1),
    true
  )
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 2, 4, 1),
    true
  )
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 2, 5, 1),
    true
  )
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 2, 6, 1),
    false
  )
  assert.equal(
    debeMarcarPendienteRolesCampaniaOnEditScc_('ROLES_CAMPANIA', 1, 1, 1),
    false
  )
})

test('19. edición conserva ID Sistema y Última sincronización', () => {
  const cuerpo = rolesSource.match(
    /function marcarEdicionRolesCampania_\(evento\) \{[\s\S]*?\n\}/
  )?.[0]
  assert.ok(cuerpo)
  assert.doesNotMatch(
    cuerpo,
    /columnasRolesCampania\.idSistema|columnasRolesCampania\.ultimaSincronizacion/
  )
})

test('20. éxito guarda UUID real', () => {
  const [r] = procesarFilasPendientesRolesCampaniaScc_(
    [fila()],
    [trabajador()],
    [campania()],
    [],
    () => ({ ok: true, rol_campania: { id: ROL_ID } }),
    () => 'ahora'
  )
  assert.equal(r.estadoSync, 'SINCRONIZADO')
  assert.equal(r.idSistema, ROL_ID)
  assert.equal(r.ultimaSincronizacion, 'ahora')
})

test('21. error conserva UUID previo', () => {
  const [r] = procesarFilasPendientesRolesCampaniaScc_(
    [fila({ idSistema: ROL_ID })],
    [trabajador()],
    [campania()],
    [remoto()],
    () => {
      throw new Error('falló')
    }
  )
  assert.equal(r.estadoSync, 'ERROR')
  assert.equal(r.idSistema, ROL_ID)
})

test('22. fila SINCRONIZADA no se procesa', () => {
  let llamadas = 0
  const [r] = procesarFilasPendientesRolesCampaniaScc_(
    [fila({ estadoSync: 'SINCRONIZADO', idSistema: ROL_ID })],
    [trabajador()],
    [campania()],
    [remoto()],
    () => {
      llamadas += 1
    }
  )
  assert.equal(llamadas, 0)
  assert.equal(r.idSistema, ROL_ID)
})

test('23. error de una fila no detiene las siguientes', () => {
  let llamadas = 0
  const resultados = procesarFilasPendientesRolesCampaniaScc_(
    [fila(), fila({ rol: 'SUPERVISORA' })],
    [trabajador()],
    [campania()],
    [],
    () => {
      llamadas += 1
      if (llamadas === 1) throw new Error('primera')
      return { ok: true, rol_campania: { id: ROL_ID_2 } }
    }
  )
  assert.equal(resultados[0].estadoSync, 'ERROR')
  assert.equal(resultados[1].estadoSync, 'SINCRONIZADO')
})

test('24. menú sincroniza roles después de trabajadores y campañas', () => {
  const t = menuSource.indexOf('sincronizarTrabajadores_')
  const c = menuSource.indexOf('sincronizarCampanias_')
  const r = menuSource.indexOf('sincronizarRolesCampania_')
  assert.ok(t >= 0 && c > t && r > c)
})

test('25. listado remoto normaliza históricos', () => {
  const [r] = normalizarListadoRolesCampaniaScc_({
    ok: true,
    roles: [
      {
        id: ROL_ID,
        trabajador_id: TRAB_ID,
        dni: '80000001',
        trabajador: 'Ana Pérez',
        campania_id: CAMP_ID,
        campania_codigo: 'CAMP-2026',
        campania_estado: 'CERRADA',
        rol: 'JABERO',
        activo: false,
        acceso_app: false
      }
    ]
  })
  assert.equal(r.campaniaEstado, 'CERRADA')
  assert.equal(r.activo, false)
  assert.equal(r.accesoApp, false)
})

test('26. dropdowns se basan en maestros sincronizados y vigentes', () => {
  assert.deepEqual(
    Array.from(
      obtenerOpcionesTrabajadoresRolesCampaniaScc_([
        trabajador(),
        trabajador({ dni: '80000002', idSistema: TRAB_ID_2, activo: 'No' })
      ])
    ),
    ['80000001']
  )
  assert.deepEqual(
    Array.from(
      obtenerOpcionesCampaniasRolesCampaniaScc_([
        campania(),
        campania({ codigo: 'CERRADA', idSistema: CAMP_ID_2, estado: 'CERRADA' })
      ])
    ),
    ['CAMP-2026']
  )
  const bloqueRol = rolesSource.slice(
    rolesSource.indexOf('rangoRol.setDataValidation'),
    rolesSource.indexOf('function completarNombresRolesCampaniaDesdeDni_')
  )
  assert.match(
    rolesSource,
    /rangoTrabajador\.setDataValidation[\s\S]*?setAllowInvalid\(true\)/
  )
  assert.match(
    rolesSource,
    /rangoCampania\.setDataValidation[\s\S]*?setAllowInvalid\(true\)/
  )
  assert.match(bloqueRol, /setAllowInvalid\(false\)/)
})

test('27. columnas F:I están protegidas', () => {
  assert.match(configSource, /hojaRolesCampania: 'ROLES_CAMPANIA'/)
  assert.match(
    configSource,
    /columnasRolesCampania:[\s\S]*dni: 1,[\s\S]*ultimaSincronizacion: 9/
  )
  assert.match(rolesSource, /getRange\(1, 6, hoja\.getMaxRows\(\), 4\)/)
})

test('28. actualizar desde sistema soporta ROLES_CAMPANIA', () => {
  assert.match(menuSource, /nombre === SCC_CONFIG\.hojaRolesCampania/)
  assert.match(menuSource, /actualizarRolesCampaniaDesdeSistema_\(\)/)
  assert.match(rolesSource, /item\.id,[\s\S]*ahora/)
})

test('29. RPCs no conceden ejecución a anon ni SELECT directo', () => {
  assert.match(sql, /from public, anon, authenticated;/i)
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?\bto\s+anon\b/i)
  assert.doesNotMatch(
    sql,
    /grant\s+select\s+on\s+(table\s+)?public\.trabajador_campania_rol/i
  )
})

test('30. SQL recalcula usuarios_app por roles vigentes en campaña activa', () => {
  assert.match(
    sql,
    /from public\.trabajador_campania_rol tcr\s+join public\.campanias c on c\.id = tcr\.campania_id/i
  )
  assert.match(sql, /tcr\.activo = true/i)
  assert.match(sql, /c\.estado::text = 'ACTIVA'/i)
  assert.match(sql, /'JABERO'::public\.rol_trabajador/i)
  assert.match(sql, /'SUPERVISORA'::public\.rol_trabajador/i)
  assert.match(sql, /public\.usuarios_app/i)
})

test('31. al cambiar trabajador recalcula acceso del anterior y del nuevo', () => {
  assert.match(sql, /v_trabajador_id_anterior := v_rol\.trabajador_id/i)
  assert.match(
    sql,
    /if v_trabajador_id_anterior is distinct from p_trabajador_id then/i
  )
  assert.match(sql, /where tcr\.trabajador_id = v_trabajador_id_anterior/i)
  assert.match(sql, /where tcr\.trabajador_id = p_trabajador_id/i)
})

test('32. maestros previos siguen integrados y onEdit incluye roles', () => {
  assert.match(menuSource, /sincronizarTrabajadores_/)
  assert.match(menuSource, /sincronizarCampanias_/)
  assert.match(menuSource, /sincronizarVariedades_/)
  assert.match(menuSource, /sincronizarLotes_/)
  assert.match(codeSource, /marcarEdicionRolesCampania_\(e\);/)
})

test('33. roles relee referencias después de sincronizar maestros previos', () => {
  assert.match(
    rolesSource,
    /var trabajadores = leerFilasTrabajadores_\(hojaTrabajadores\);/
  )
  assert.match(rolesSource, /var campanias = leerFilasCampanias_\(hojaCampanias\);/)
})

test('34. onEdit completa nombre desde DNI sin llamar Supabase', () => {
  const cuerpo = rolesSource.match(
    /function marcarEdicionRolesCampania_\(evento\) \{[\s\S]*?\n\}/
  )?.[0]
  assert.ok(cuerpo)
  assert.match(cuerpo, /completarNombresRolesCampaniaDesdeDni_/)
  assert.doesNotMatch(cuerpo, /llamarRpcSupabase_/)
})

test('35. alta usa registrado_por_usuario_id NULL y actualización lo preserva', () => {
  const bloqueInsert = sql.slice(
    sql.indexOf('insert into public.trabajador_campania_rol'),
    sql.indexOf("v_accion := 'CREADO'")
  )
  const bloqueUpdate = sql.slice(
    sql.indexOf('update public.trabajador_campania_rol'),
    sql.indexOf("v_accion := 'ACTUALIZADO'")
  )
  assert.match(bloqueInsert, /registrado_por_usuario_id[\s\S]*?p_activo,[\s\S]*?null/i)
  assert.doesNotMatch(bloqueUpdate, /registrado_por_usuario_id\s*=/i)
})

test('36. COSECHADOR por sí solo no habilita usuarios_app', () => {
  const bloqueAcceso = sql.slice(
    sql.indexOf('if exists ('),
    sql.indexOf('if v_trabajador_id_anterior is distinct from p_trabajador_id')
  )
  assert.match(bloqueAcceso, /'JABERO'::public\.rol_trabajador/i)
  assert.match(bloqueAcceso, /'SUPERVISORA'::public\.rol_trabajador/i)
  assert.doesNotMatch(bloqueAcceso, /'COSECHADOR'::public\.rol_trabajador/i)
})

test('37. sin rol de acceso vigente usuarios_app se desactiva sin DELETE', () => {
  assert.match(
    sql,
    /update public\.usuarios_app\s+set activo = false\s+where trabajador_id = p_trabajador_id;/i
  )
  assert.doesNotMatch(sql, /delete\s+from\s+public\.usuarios_app/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.trabajador_campania_rol/i)
})

test('38. rol de acceso vigente crea o reactiva usuarios_app', () => {
  assert.match(
    sql,
    /insert into public\.usuarios_app \(trabajador_id, activo\)\s+values \(p_trabajador_id, true\)\s+on conflict \(trabajador_id\)\s+do update set activo = true;/i
  )
})

test('39. listado incluye históricos y orden requerido', () => {
  assert.match(sql, /from public\.trabajador_campania_rol tcr/i)
  assert.doesNotMatch(sql, /where\s+tcr\.activo\s*=\s*true/i)
  assert.match(sql, /'campania_estado', c\.estado/i)
  assert.match(
    sql,
    /order by c\.codigo asc, tcr\.rol::text asc,[\s\S]*?t\.nombres, t\.apellidos/i
  )
})

test('40. dropdown de Rol bloquea valores libres', () => {
  const bloqueRol = rolesSource.slice(
    rolesSource.indexOf('rangoRol.setDataValidation'),
    rolesSource.indexOf('function completarNombresRolesCampaniaDesdeDni_')
  )
  assert.match(bloqueRol, /requireValueInList\(opcionesRoles, true\)/)
  assert.match(bloqueRol, /setAllowInvalid\(false\)/)
})

test('provisionales aceptan trabajador vacío o nullable sin relajar identidad, rol y booleanos', () => {
  const raw = {
    id: ROL_ID,
    trabajador_id: TRAB_ID,
    dni: '43829105',
    trabajador: '',
    campania_id: CAMP_ID,
    campania_codigo: 'CAMP-ARA-2026',
    campania_estado: 'ACTIVA',
    rol: 'COSECHADOR',
    activo: true,
    acceso_app: false
  }
  for (const nombre of ['', null, '   ']) {
    const r = normalizarListadoRolesCampaniaScc_({
      ok: true,
      roles: [{ ...raw, trabajador: nombre }]
    })[0]
    assert.equal(r.trabajador, 'ASIGNAR NOMBRE')
    assert.equal(r.dni, '43829105')
    assert.equal(r.activo, true)
    assert.equal(r.accesoApp, false)
  }
  for (const invalido of [
    { id: null },
    { trabajador_id: 'no-uuid' },
    { campania_id: null },
    { dni: '123' },
    { campania_codigo: '' },
    { rol: 'OTRO' },
    { activo: null },
    { acceso_app: 'invalido' }
  ]) {
    assert.throws(() =>
      normalizarListadoRolesCampaniaScc_({ ok: true, roles: [{ ...raw, ...invalido }] })
    )
  }
})

test('fallback informativo nunca participa en payload de guardado del rol', () => {
  const provisional = trabajador({ dni: '43829105', nombres: '', apellidos: '' })
  assert.equal(
    contexto.nombreVisibleTrabajadorRolCampaniaScc_(provisional),
    'ASIGNAR NOMBRE'
  )
  const payload = prepararRolCampaniaParaGuardarScc_(
    fila({ dni: '43829105', trabajador: 'ASIGNAR NOMBRE', rol: 'COSECHADOR' }),
    [provisional],
    [campania()],
    []
  )
  assert.doesNotMatch(JSON.stringify(payload), /ASIGNAR NOMBRE|nombres|apellidos/)
  assert.equal(provisional.nombres, '')
  assert.equal(provisional.apellidos, '')
  assert.equal(payload.p_trabajador_id, TRAB_ID)
})

test('Actualizar de Apps Script escribe fallback en B y después nombre real conservando IDs', () => {
  const escritos = []
  const hoja = {
    getLastRow: () => 2,
    getRange: (...rango) => ({
      clearContent() {},
      setValues: (valores) => escritos.push({ rango, valores })
    })
  }
  let nombre = ''
  const ctx = vm.createContext({
    Date,
    SCC_CONFIG: {},
    llamarRpcSupabase_: () => ({
      ok: true,
      roles: [
        {
          id: ROL_ID,
          trabajador_id: TRAB_ID,
          dni: '43829105',
          trabajador: nombre,
          campania_id: CAMP_ID,
          campania_codigo: 'CAMP-ARA-2026',
          campania_estado: 'ACTIVA',
          rol: 'COSECHADOR',
          activo: true,
          acceso_app: false
        }
      ]
    })
  })
  vm.runInContext(
    trabajadoresPure + '\n' + lotesPure + '\n' + rolesPure + '\n' + rolesSource,
    ctx
  )
  ctx.configurarHojaRolesCampania_ = () => hoja
  ctx.leerFilasRolesCampania_ = () => []
  ctx.refrescarValidacionesRolesCampania_ = () => {}
  assert.equal(ctx.actualizarRolesCampaniaDesdeSistema_(), 1)
  assert.equal(escritos[0].valores[0][0], '43829105')
  assert.equal(escritos[0].valores[0][1], 'ASIGNAR NOMBRE')
  assert.equal(escritos[0].valores[0][3], 'COSECHADOR')
  assert.equal(escritos[0].valores[0][5], 'SINCRONIZADO')
  nombre = 'Fausto Rodríguez'
  assert.equal(ctx.actualizarRolesCampaniaDesdeSistema_(), 1)
  assert.equal(escritos[1].valores[0][1], 'Fausto Rodríguez')
  assert.equal(escritos[1].valores[0][7], escritos[0].valores[0][7])
})
