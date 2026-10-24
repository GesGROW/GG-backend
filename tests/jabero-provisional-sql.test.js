import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import vm from 'node:vm'
import { PGlite } from '@electric-sql/pglite'
import * as local from '@gesgrow/harvest-client-contracts/src/offline/db.js'
import { ejecutarCola } from '@gesgrow/harvest-client-contracts/src/offline/cola.js'
import { crearSupabaseBackend } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js'

const read = (file) =>
  readFileSync(
    new URL(
      file.startsWith('@gesgrow/') ? import.meta.resolve(file) : file,
      import.meta.url
    ),
    'utf8'
  )
const db = new PGlite()
const pure = vm.createContext({ Date })
vm.runInContext(
  read('../apps-script/TrabajadoresPure.gs') +
    '\n' +
    read('../apps-script/LotesPure.gs') +
    '\n' +
    read('../apps-script/RolesCampaniaPure.gs'),
  pure
)
const CAMP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const operador = '47480378'
const sql = (file) => read('../supabase/migrations/' + file)
const call = async (dni, id = crypto.randomUUID(), dniOperador = operador) => {
  const { rows } = await db.query(
    'select public.registrar_jabero($1::varchar, $2::varchar, $3::uuid) as resultado',
    [dniOperador, dni, id]
  )
  return rows[0].resultado
}
const worker = async (dni, nombres = '', apellidos = '', activo = true) => {
  const { rows } = await db.query(
    'insert into trabajadores (dni, nombres, apellidos, activo) values ($1,$2,$3,$4) returning id',
    [dni, nombres, apellidos, activo]
  )
  return rows[0].id
}
const count = async (table, column, value) => {
  const { rows } = await db.query(
    `select count(*)::int as n from ${table} where ${column} = $1`,
    [value]
  )
  return rows[0].n
}
before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  await db.exec(sql('20261001_admin_roles_campania.sql'))
  await db.exec(sql('20261001_consistencia_acceso_app.sql'))
  await db.exec(sql('202610020100_jabero_provisional.sql'))
  const listado = sql('20260930_admin_trabajadores.sql').match(
    /create or replace function public\.admin_listar_trabajadores\(\)[\s\S]*?\$\$;/
  )[0]
  await db.exec(listado)
})
after(() => db.close())

test('SQL reutiliza trabajador y JABERO activo sin duplicar y reactiva usuarios_app', async () => {
  const id = await worker('76338971', 'Marco', 'Góngora')
  await db.query(
    "insert into trabajador_campania_rol (trabajador_id,campania_id,rol,activo) values ($1,$2,'JABERO',true)",
    [id, CAMP]
  )
  await db.query('insert into usuarios_app (trabajador_id,activo) values ($1,false)', [
    id
  ])
  const primero = await call('76338971')
  const segundo = await call('76338971')
  assert.equal(primero.rol_id, segundo.rol_id)
  assert.equal(primero.nombre, 'Marco Góngora')
  assert.equal(await count('trabajadores', 'dni', '76338971'), 1)
  assert.equal(await count('trabajador_campania_rol', 'trabajador_id', id), 1)
  assert.equal(await count('usuarios_app', 'trabajador_id', id), 1)
  assert.equal(
    (await db.query('select activo from usuarios_app where trabajador_id=$1', [id]))
      .rows[0].activo,
    true
  )
})

test('SQL crea rol para trabajador existente y reactiva el mismo rol inactivo', async () => {
  const id = await worker('76338972', 'Rosa', 'Díaz')
  const primero = await call('76338972')
  await db.query('update trabajador_campania_rol set activo=false where id=$1', [
    primero.rol_id
  ])
  const segundo = await call('76338972')
  assert.equal(segundo.trabajador_id, id)
  assert.equal(segundo.rol_id, primero.rol_id)
  assert.equal(await count('trabajador_campania_rol', 'trabajador_id', id), 1)
  assert.equal(
    (
      await db.query('select activo from trabajador_campania_rol where id=$1', [
        primero.rol_id
      ])
    ).rows[0].activo,
    true
  )
})

test('SQL crea provisional vacío, JABERO y acceso; retry devuelve el mismo recibo', async () => {
  const operacion = crypto.randomUUID()
  const primero = await call('76338973', operacion)
  assert.deepEqual(await call('76338973', operacion), primero)
  assert.equal(primero.nombre, 'DNI 76338973')
  const { rows } = await db.query(
    'select nombres,apellidos,activo from trabajadores where id=$1',
    [primero.trabajador_id]
  )
  assert.deepEqual(rows[0], { nombres: '', apellidos: '', activo: true })
  assert.equal(await count('trabajadores', 'dni', '76338973'), 1)
  assert.equal(
    await count('trabajador_campania_rol', 'trabajador_id', primero.trabajador_id),
    1
  )
  assert.equal(await count('usuarios_app', 'trabajador_id', primero.trabajador_id), 1)
  assert.equal(await count('operaciones_pda_procesadas', 'id', operacion), 1)
  await assert.rejects(call('76338974', operacion), /reutilizado/)
  assert.equal(await count('trabajadores', 'dni', '76338974'), 0)
})

test('SQL rechaza operador sin autorización antes de crear trabajador, rol o recibo', async () => {
  const op = crypto.randomUUID()
  await assert.rejects(call('76338975', op, '12345678'), /no autorizado/i)
  assert.equal(await count('trabajadores', 'dni', '76338975'), 0)
  assert.equal(await count('operaciones_pda_procesadas', 'id', op), 0)
  // Un DNI nuevo tampoco puede autorizarse a sí mismo mediante el alta.
  await assert.rejects(call('76338975', op, '76338975'), /no autorizado/i)
})

test('SQL rechaza trabajador inactivo sin crear rol ni conceder acceso', async () => {
  const id = await worker('76338976', '', '', false)
  await assert.rejects(call('76338976'), /inactivo/)
  assert.equal(await count('trabajador_campania_rol', 'trabajador_id', id), 0)
  assert.equal(await count('usuarios_app', 'trabajador_id', id), 0)
})

test('SQL rechaza DNI inválido, campaña ausente y campañas activas ambiguas sin altas', async () => {
  await assert.rejects(call('123'), /8 dígitos/)
  await db.exec("update campanias set estado='CERRADA'")
  try {
    // La autorización también rechaza acceso cuando no hay campaña activa.
    await assert.rejects(call('76338977'))
    assert.equal(await count('trabajadores', 'dni', '76338977'), 0)
  } finally {
    await db.exec("update campanias set estado='ACTIVA'")
  }
  await db.exec(
    "insert into campanias (codigo,nombre,estado) values ('OTRA','Otra','ACTIVA')"
  )
  try {
    await assert.rejects(call('76338977'), /más de una campaña activa/)
    assert.equal(await count('trabajadores', 'dni', '76338977'), 0)
  } finally {
    await db.exec("delete from campanias where codigo='OTRA'")
  }
})

test('COSECHADOR provisional aparece en listado real de roles y no obtiene acceso app', async () => {
  const id = await worker('43829105')
  await db.query(
    "insert into trabajador_campania_rol (trabajador_id,campania_id,rol,activo) values ($1,$2,'COSECHADOR',true)",
    [id, CAMP]
  )
  await db.query('select recalcular_acceso_app_trabajador($1)', [id])
  const { rows } = await db.query('select admin_listar_roles_campania() as resultado')
  const resultado = rows[0].resultado
  const crudo = resultado.roles.find((r) => r.dni === '43829105')
  assert.equal(crudo.trabajador, '')
  assert.equal(crudo.activo, true)
  assert.equal(crudo.acceso_app, false)
  assert.equal(crudo.rol, 'COSECHADOR')
  const normalizado = pure
    .normalizarListadoRolesCampaniaScc_(resultado)
    .find((r) => r.dni === '43829105')
  assert.equal(normalizado.trabajador, 'ASIGNAR NOMBRE')
  assert.equal(await count('usuarios_app', 'trabajador_id', id), 0)
})

test('JABERO provisional aparece en TRABAJADORES y ROLES con fallback solo visual', async () => {
  const rol = await call('76338978')
  const trabajadores = (
    await db.query('select admin_listar_trabajadores() as resultado')
  ).rows[0].resultado
  const t = pure
    .normalizarListadoTrabajadoresScc_(trabajadores)
    .find((r) => r.dni === '76338978')
  assert.equal(t.nombres, '')
  assert.equal(t.apellidos, '')
  const roles = (await db.query('select admin_listar_roles_campania() as resultado'))
    .rows[0].resultado
  assert.equal(
    pure.normalizarListadoRolesCampaniaScc_(roles).find((r) => r.dni === '76338978')
      .trabajador,
    'ASIGNAR NOMBRE'
  )
  await assert.rejects(
    db.query('select admin_guardar_trabajador($1,$2,$3,$4,$5)', [
      rol.trabajador_id,
      '76338978',
      '',
      '',
      true
    ]),
    /nombres.*obligatorios/i
  )
  await db.query('select admin_guardar_trabajador($1,$2,$3,$4,$5)', [
    rol.trabajador_id,
    '76338978',
    'Fausto',
    'Rodríguez',
    true
  ])
  const actual = (await db.query('select admin_listar_roles_campania() as resultado'))
    .rows[0].resultado
  const fila = pure
    .normalizarListadoRolesCampaniaScc_(actual)
    .find((r) => r.dni === '76338978')
  assert.equal(fila.trabajador, 'Fausto Rodríguez')
  assert.equal(fila.id, rol.rol_id)
  assert.equal(await count('trabajadores', 'dni', '76338978'), 1)
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from trabajadores where nombres='ASIGNAR NOMBRE' or apellidos='ASIGNAR NOMBRE'"
      )
    ).rows[0].n,
    0
  )
})

test('escenario Fausto/Deysi/Marco sincroniza roles aunque otro trabajador siga provisional', async () => {
  await db.query(
    "update trabajadores set nombres='Fausto',apellidos='Rodríguez' where dni='43829105'"
  )
  const { rows } = await db.query('select admin_listar_roles_campania() as resultado')
  const roles = pure.normalizarListadoRolesCampaniaScc_(
    JSON.parse(JSON.stringify(rows[0].resultado))
  )
  for (const [dni, nombre, rol] of [
    ['43829105', 'Fausto Rodríguez', 'COSECHADOR'],
    ['47480378', 'Deysi Regalado', 'SUPERVISORA'],
    ['76338971', 'Marco Góngora', 'JABERO']
  ]) {
    const fila = roles.find((r) => r.dni === dni)
    assert.equal(fila.trabajador, nombre)
    assert.equal(fila.rol, rol)
    assert.equal(fila.campaniaCodigo, 'CAMP-ARA-2026')
    assert.equal(fila.activo, true)
  }
  assert.ok(roles.some((r) => r.trabajador === 'ASIGNAR NOMBRE'))
})

test('listado administrativo conserva autorización y permisos de RPC', async () => {
  await db.exec("set scc.test.integracion='false'")
  try {
    await assert.rejects(
      db.query('select admin_listar_roles_campania()'),
      /no autorizada/i
    )
  } finally {
    await db.exec("set scc.test.integracion='true'")
  }
  const { rows } = await db.query(
    "select has_function_privilege('anon','public.admin_listar_roles_campania()','EXECUTE') as admin, has_function_privilege('anon','public.registrar_jabero(varchar,varchar,uuid)','EXECUTE') as pda"
  )
  assert.deepEqual(rows[0], { admin: false, pda: true })
})

test('reconexión procesa una sola REGISTRAR_JABERO real desde IndexedDB hasta PostgreSQL', async () => {
  await local.seleccionarCampaniaLocal(CAMP)
  await local.guardarCache({
    campania: { id: CAMP, nombre: 'Arándanos 2026', estado: 'ACTIVA' },
    sincronizado_en: '',
    trabajadores: [],
    tickets: [],
    lotes: []
  })
  const op = await local.registrarJaberoOffline(operador, '76338979')
  const llamadas = []
  const contexto = vm.createContext({
    ...local,
    ejecutarCola,
    navigator: { onLine: false },
    backend: crearSupabaseBackend({
      rpc: async (nombre, args) => {
        llamadas.push({ nombre, args })
        return {
          data: await call(
            args.p_dni_trabajador,
            args.p_operacion_id,
            args.p_dni_operador
          )
        }
      }
    })
  })
  const registrar = read(
    '@gesgrow/core/contexts/workforce/application/registroJaberos.js'
  )
  vm.runInContext(
    registrar.slice(registrar.indexOf('export async')).replace('export ', ''),
    contexto
  )
  const sync = read('@gesgrow/harvest-client-contracts/src/offline/sync.js')
  vm.runInContext(
    sync.slice(sync.indexOf('let sincronizando')).replace('export async', 'async'),
    contexto
  )
  await contexto.sincronizarPendientes()
  assert.equal(llamadas.length, 0)
  assert.equal((await local.obtenerColaCompleta())[0].estado, 'PENDIENTE')
  contexto.navigator.onLine = true
  await contexto.sincronizarPendientes()
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].nombre, 'registrar_jabero_campania')
  assert.equal(llamadas[0].args.p_campania_id, CAMP)
  assert.equal(llamadas[0].args.p_operacion_id, op.id)
  const restante = await local.obtenerColaCompleta()
  assert.equal(restante.length, 1)
  assert.equal(restante[0].estado, 'SINCRONIZADA')
  assert.equal(restante[0].error, null)
  await contexto.sincronizarPendientes()
  assert.equal(llamadas.length, 1)
  assert.equal(
    (await local.obtenerTrabajador('76338979')).estado_sync_jabero,
    'SINCRONIZADO'
  )
  const { rows } = await db.query(
    "select t.nombres,t.apellidos,r.rol,r.activo,ua.activo as acceso from trabajadores t join trabajador_campania_rol r on r.trabajador_id=t.id join usuarios_app ua on ua.trabajador_id=t.id where t.dni='76338979'"
  )
  assert.deepEqual(rows, [
    { nombres: '', apellidos: '', rol: 'JABERO', activo: true, acceso: true }
  ])
  assert.equal(await count('operaciones_pda_procesadas', 'id', op.id), 1)
})
