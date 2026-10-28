import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  cuentas = {}
const M = '20261024193839_harvest_editor_trabajadores_campania.sql'
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sub ?? ''
  ])
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  for (const n of readdirSync(dir)
    .filter((n) => n >= '202610140600_' && n < M && n.endsWith('.sql'))
    .sort())
    await db.exec(read(n))
  for (const [nombre, rol] of [
    ['ana', 'SUPERVISOR_COSECHA'],
    ['bea', 'SUPERVISOR_COSECHA'],
    ['view', 'CONSULTA'],
    ['owner', 'ADMIN_EMPRESA']
  ]) {
    cuentas[nombre] = { sub: crypto.randomUUID() }
    await login(nombre)
    const usuario = (await call('iam_obtener_identidad()')).usuario.id
    await db.query(
      `with m as(insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
      select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo=$3`,
      [T, usuario, rol]
    )
  }
  await login('ana')
  await db.exec(read(M))
})
after(() => db.close())

let persona, cosechador, jabero, otra, campaniaB
const ficha = (id = cosechador, rol = 'COSECHADOR', campania = A, tenant = T) =>
  call('harvest_admin_trabajador_campania($1::uuid,$2::uuid,$3,$4::uuid)', [
    tenant,
    campania,
    rol,
    id
  ])
const editar = (id, rol, d = {}, campania = A, tenant = T) =>
  call(
    'harvest_admin_editar_trabajador_campania($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7,$8)',
    [
      tenant,
      campania,
      rol,
      id,
      d.dni ?? '23456789',
      d.nombres ?? 'Ana',
      d.apellidos ?? 'Rojas',
      d.activo ?? false
    ]
  )
test('lee la ficha real de un participante, sin dividir su nombre de presentación', async () => {
  persona = crypto.randomUUID()
  campaniaB = crypto.randomUUID()
  await db.query(
    'insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo) values($1,$2,$3,$4,$5,true)',
    [persona, T, '23456789', 'Ana María', 'De la Cruz Rojas']
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado,fecha_inicio,cultivo_id) select $1,tenant_id,'OTRA-EDITOR','Otra campaña','CERRADA',current_date,cultivo_id from campanias where id=$2",
    [campaniaB, A]
  )
  for (const [rol, campania] of [
    ['COSECHADOR', A],
    ['JABERO', A],
    ['COSECHADOR', campaniaB]
  ]) {
    const id = crypto.randomUUID()
    await db.query(
      'insert into trabajador_campania_rol(id,tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,$4,$5,true)',
      [id, T, persona, campania, rol]
    )
    if (rol === 'JABERO') jabero = id
    else if (campania === A) cosechador = id
    else otra = id
  }
  const r = await ficha()
  assert.equal(r.id, persona)
  assert.equal(r.participacionId, cosechador)
  assert.equal(r.nombres, 'Ana María')
  assert.equal(r.apellidos, 'De la Cruz Rojas')
  assert.equal(r.activo, true)
})
test('edita nombres y DNI; el estado solo afecta esa función y campaña, sin cambiar el trabajador global', async () => {
  const r = await editar(cosechador, 'COSECHADOR', {
    dni: '23456780',
    nombres: 'Ana María',
    apellidos: 'De la Cruz Rojas',
    activo: false
  })
  assert.equal(r.activo, false)
  assert.equal(r.trabajadorActivo, true)
  assert.equal((await ficha(jabero, 'JABERO')).activo, true)
  assert.equal((await ficha(otra, 'COSECHADOR', campaniaB)).activo, true)
  assert.equal((await ficha()).dni, '23456780')
  const nuevo = await editar(cosechador, 'COSECHADOR', { activo: true })
  assert.equal(nuevo.activo, true)
})
test('jabero: guardar datos no renueva el día; reactivar no concede una jornada nueva', async () => {
  await db.query(
    'update trabajador_campania_rol set fecha_asignacion_jabero=current_date-2 where id=$1',
    [jabero]
  )
  const anterior = (await ficha(jabero, 'JABERO')).fechaJabero
  assert.equal((await editar(jabero, 'JABERO', { activo: true })).fechaJabero, anterior)
  await editar(jabero, 'JABERO', { activo: false })
  assert.equal((await editar(jabero, 'JABERO', { activo: true })).fechaJabero, null)
})
test('DNI duplicado y datos inválidos revierten también el cambio de estado', async () => {
  await db.query(
    "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'34567890','Otro','Trabajador',true)",
    [T]
  )
  const antes = await ficha()
  await assert.rejects(
    editar(cosechador, 'COSECHADOR', { dni: '34567890', activo: !antes.activo }),
    /duplicate|DNI/
  )
  for (const d of [
    { dni: '123' },
    { nombres: '' },
    { apellidos: '' },
    { nombres: 'a'.repeat(201) }
  ])
    await assert.rejects(editar(cosechador, 'COSECHADOR', d), /requeridos/)
  assert.deepEqual(await ficha(), antes)
})
test('no permite activar en campaña cerrada ni reactivar globalmente a un trabajador', async () => {
  await editar(otra, 'COSECHADOR', { activo: false }, campaniaB)
  await assert.rejects(
    editar(otra, 'COSECHADOR', { activo: true }, campaniaB),
    /campaña debe estar activa/
  )
  await editar(cosechador, 'COSECHADOR', { activo: false })
  await db.query('update trabajadores set activo=false where id=$1', [persona])
  await assert.rejects(
    editar(cosechador, 'COSECHADOR', { activo: true }),
    /inactivo a nivel general/
  )
  await db.query('update trabajadores set activo=true where id=$1', [persona])
})
test('consulta autoriza harvest.view; escritura requiere gestión, empresa y participación en el cultivo', async () => {
  await login('view')
  assert.equal((await ficha()).participacionId, cosechador)
  await assert.rejects(editar(cosechador, 'COSECHADOR'))
  for (const quien of ['owner', null]) {
    await login(quien)
    await assert.rejects(ficha())
    await assert.rejects(editar(cosechador, 'COSECHADOR'))
  }
  await login('ana')
  await assert.rejects(ficha(jabero, 'COSECHADOR'), /Participación/)
  await assert.rejects(ficha(cosechador, 'COSECHADOR', campaniaB), /Participación/)
  await assert.rejects(ficha(persona), /Participación/)
  await assert.rejects(ficha(cosechador, 'COSECHADOR', A, crypto.randomUUID()))
  for (const rol of ['anon', 'service_role'])
    for (const f of [
      'harvest_admin_trabajador_campania(uuid,uuid,text,uuid)',
      'harvest_admin_editar_trabajador_campania(uuid,uuid,text,uuid,text,text,text,boolean)'
    ])
      assert.equal(
        await call("has_function_privilege($1,$2,'execute')", [rol, f]),
        false
      )
  await db.exec('set role authenticated')
  try {
    assert.equal((await ficha()).participacionId, cosechador)
  } finally {
    await db.exec('reset role')
  }
})

test('E014/E019: metricas sin lecturas y DNI inmutable en la API', async () => {
  await db.exec(read('20261028220241_harvest_resumen_configuracion_dni_fijo.sql'))
  const resumen = async () =>
    (await call('harvest_proyectar_resumen($1::uuid,$2)', [A, 'America/Lima'])).resumen
  const antes = await resumen()
  assert.equal(antes.total_jabas, 0)
  assert.ok(antes.total_lotes_configurados > 0)
  assert.ok(antes.total_variedades_configuradas > 0)
  for (const dni of ['98123450', '98123451']) {
    const w = (
      await db.query(
        "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,$2,'Nuevo','Cosechador',true) returning id",
        [T, dni]
      )
    ).rows[0].id
    await db.query(
      "insert into trabajador_campania_rol(tenant_id,campania_id,trabajador_id,rol,activo) values($1,$2,$3,'COSECHADOR',true)",
      [T, A, w]
    )
  }
  const fichaAntes = await ficha()
  await assert.rejects(
    editar(cosechador, 'COSECHADOR', { dni: '99112233' }),
    /no se puede modificar/
  )
  assert.deepEqual(await ficha(), fichaAntes)
  assert.equal(
    (await editar(cosechador, 'COSECHADOR', { dni: fichaAntes.dni })).dni,
    fichaAntes.dni
  )
  const despues = await resumen()
  assert.equal(despues.total_jabas, 0)
  assert.equal(
    despues.total_cosechadores_registrados,
    antes.total_cosechadores_registrados + 2
  )
  assert.equal(despues.dias_con_produccion, 0)
})
