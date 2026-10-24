import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'
const db = new PGlite(),
  owner = crypto.randomUUID(),
  nueva = crypto.randomUUID(),
  existente = crypto.randomUUID(),
  otra = crypto.randomUUID(),
  invitacion = crypto.randomUUID(),
  acceso = crypto.randomUUID()
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const login = (s) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [s])
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const migracion = '20261023232743_portal_activacion_dni.sql'
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls;"
  )
  for (const n of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql',
    '202610141000_platform_ciclo_vida.sql',
    '202610141100_portal_identity_admin.sql',
    '202610141200_portal_campaign_workforce.sql',
    '202610141300_portal_harvest_admin.sql',
    '202610141400_portal_reportes.sql',
    '202610141500_portal_suscripcion.sql',
    '202610141600_portal_cutover_administrativo.sql',
    '202610141700_farm_structure.sql',
    '202610191000_portal_trabajadores_cosecha.sql',
    '202610211000_portal_activacion_cuenta.sql',
    '202610211100_owner_modulos.sql',
    '202610211200_usuarios_accesos_modulo.sql',
    '202610221000_harvest_cultivos_supervisores.sql',
    migracion,
    '20261023232746_portal_supervisor_dni_pwa.sql',
    '20261023233717_portal_validacion_operador_dni.sql'
  ])
    await db.exec(read(n))
  await db.query(
    "insert into auth.users(id,email,invited_at,encrypted_password) values($1,'owner@test.local',null,'hash'),($2,'nueva@test.local',now(),'hash-interno-no-elegido'),($3,'existente@test.local',null,'hash-elegido'),($4,'otra@test.local',null,'hash')",
    [owner, nueva, existente, otra]
  )
  await login(owner)
  const usuario = (await call('iam_obtener_identidad()')).usuario.id
  await db.query(
    "with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id) insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA'",
    [T1, usuario]
  )
  const rol = (
    await db.query(
      "select id from identity_roles where tenant_id=$1 and codigo='SUPERVISOR_COSECHA'",
      [T1]
    )
  ).rows[0].id
  for (const [id, subject, email, tipo] of [
    [invitacion, nueva, 'nueva@test.local', 'ACTIVACION'],
    [acceso, existente, 'existente@test.local', 'ACCESO']
  ]) {
    await call(
      'iam_preparar_invitacion($1::uuid,$2::uuid,$3::text,$4::text,$5::uuid[],null)',
      [id, T1, email, 'Invitada', [rol]]
    )
    await db.query('update identity_invitaciones set tipo_entrega=$2 where id=$1', [
      id,
      tipo
    ])
    await call('iam_completar_invitacion($1::uuid,$2::uuid)', [id, subject])
  }
})
after(() => db.close())
const datos = (id) => call('iam_obtener_activacion_cuenta($1::uuid)', [id])
const completar = (id, dni) =>
  call('iam_completar_activacion_cuenta($1::uuid,$2::text)', [id, dni])
test('un hash interno no salta la activación ni una aceptación histórica; se recupera sin URL', async () => {
  await login(nueva)
  await db.query('update identity_invitaciones set aceptada_en=now() where id=$1', [
    invitacion
  ])
  assert.equal((await datos(invitacion)).requiereActivacion, true)
  assert.equal(
    (await call('iam_obtener_activacion_pendiente()')).invitacionId,
    invitacion
  )
  await assert.rejects(
    call('iam_aceptar_invitacion($1::uuid)', [invitacion]),
    /Activa tu cuenta/
  )
})
test('no acepta DNI inválido ni una cuenta sin contraseña y no deja cambios parciales', async () => {
  for (const dni of [null, '1234567', '123456789', 'abcdefgh'])
    await assert.rejects(completar(invitacion, dni), /DNI de 8 dígitos/)
  await db.query("update auth.users set encrypted_password='' where id=$1", [nueva])
  await assert.rejects(completar(invitacion, '01234567'), /contraseña/)
  assert.equal((await datos(invitacion)).requiereActivacion, true)
  await db.query(
    "update auth.users set encrypted_password='clave-elegida' where id=$1",
    [nueva]
  )
})
test('sólo el receptor activa; la revocación del invitante revierte DNI y aceptación', async () => {
  await login(otra)
  await assert.rejects(completar(invitacion, '01234567'), /no está disponible/)
  await login(nueva)
  await db.query(
    'update identity_membresias set activo=false where usuario_id=(select usuario_id from identity_identidades where sujeto=$1)',
    [owner]
  )
  await assert.rejects(completar(invitacion, '01234567'), /revocada/)
  assert.equal((await datos(invitacion)).requiereActivacion, true)
  await db.query(
    'update identity_membresias set activo=true where usuario_id=(select usuario_id from identity_identidades where sujeto=$1)',
    [owner]
  )
})
test('DNI y activación se guardan una vez y vinculan un trabajador sin ampliar permisos', async () => {
  const antes = await call('iam_permisos_efectivos($1::uuid)', [T1])
  const trabajadores = await call('(select count(*) from trabajadores)')
  assert.equal((await completar(invitacion, '01234567')).estado, 'ACEPTADA')
  const fecha = (
    await db.query(
      'select dni,activacion_completada_en from identity_usuarios where id=iam_usuario_actual()'
    )
  ).rows[0]
  assert.equal(fecha.dni, '01234567')
  assert.ok(fecha.activacion_completada_en)
  assert.equal((await datos(invitacion)).requiereActivacion, false)
  assert.equal(await call('iam_obtener_activacion_pendiente()'), null)
  await completar(invitacion, '01234567')
  assert.deepEqual(
    (
      await db.query(
        'select dni,activacion_completada_en from identity_usuarios where id=iam_usuario_actual()'
      )
    ).rows[0],
    fecha
  )
  await assert.rejects(completar(invitacion, '12345678'), /otros datos/)
  assert.deepEqual(await call('iam_permisos_efectivos($1::uuid)', [T1]), antes)
  assert.equal(await call('(select count(*) from trabajadores)'), trabajadores + 1)
  assert.equal(
    await call(
      '(select t.dni from trabajadores t join identity_membresias m on m.trabajador_id=t.id and m.tenant_id=t.tenant_id where m.usuario_id=iam_usuario_actual())'
    ),
    '01234567'
  )
})
test('una cuenta existente conserva su contraseña, no pide DNI y acepta normalmente', async () => {
  await login(existente)
  assert.equal((await datos(acceso)).requiereActivacion, false)
  assert.equal(await call('iam_obtener_activacion_pendiente()'), null)
  await assert.rejects(completar(acceso, '01234567'), /no necesita activación/)
  await call('iam_aceptar_invitacion($1::uuid)', [acceso])
  assert.equal(
    await call('(select encrypted_password from auth.users where id=auth.uid())'),
    'hash-elegido'
  )
})
test('DNI duplicado no permite activar otra cuenta; las nuevas RPC sólo admiten authenticated', async () => {
  await db.query(
    "update identity_invitaciones set tipo_entrega='ACTIVACION' where id=$1",
    [acceso]
  )
  await assert.rejects(completar(acceso, '01234567'), /No se pudo registrar ese DNI/)
  assert.equal((await datos(acceso)).requiereActivacion, true)
  for (const f of [
    'iam_obtener_activacion_pendiente()',
    'iam_completar_activacion_cuenta(uuid,text)'
  ])
    for (const role of ['anon', 'service_role'])
      assert.equal(
        await call("has_function_privilege($1,$2,'execute')", [role, f]),
        false
      )
  await db.exec('set role authenticated')
  assert.equal((await call('iam_obtener_activacion_pendiente()')).invitacionId, acceso)
  await db.exec('reset role')
  await db.exec(read(migracion))
  assert.equal((await datos(acceso)).requiereActivacion, true)
})

test('el DNI activado permite entrar al PWA sólo en cultivos propios o aprobados, conservando el acceso legacy', async () => {
  await login(nueva)
  const hoy = await call(
    "((clock_timestamp() at time zone 'America/Lima')::date)::text"
  )
  const crear = (nombre) =>
    call('harvest_cultivos_crear($1::uuid,$2::uuid,$3::jsonb)', [
      T1,
      crypto.randomUUID(),
      {
        nombre,
        color: '#3B64EC',
        variedades: ['Biloxi'],
        lotes: [{ nombre: 'Norte', variedades: ['Biloxi'] }],
        campania: { nombre: 'Cosecha prueba', fechaInicio: hoy, fechaFin: hoy }
      }
    ])
  const propio = await crear('Propio PWA')
  await login(existente)
  const ajeno = await crear('Externo PWA')
  const lote = (
    await db.query('select id,variedad_id from lotes where campania_id=$1', [
      propio.campaniaId
    ])
  ).rows[0]
  await login('')
  await db.exec('set role anon')
  const operador = await call("validar_operador_campanias('01234567'::varchar)")
  assert.deepEqual(
    operador.campanias.map((c) => c.id),
    [propio.campaniaId]
  )
  assert.deepEqual(operador.campanias[0].roles, ['SUPERVISORA'])
  await assert.rejects(
    call('obtener_cache_operativa_campania($1::uuid,$2::varchar)', [
      ajeno.campaniaId,
      '01234567'
    ]),
    /no está autorizado/
  )
  const cache = await call('obtener_cache_operativa_campania($1::uuid,$2::varchar)', [
    propio.campaniaId,
    '01234567'
  ])
  assert.equal(cache.campania.id, propio.campaniaId)
  const jabero = await call(
    'registrar_jabero_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid)',
    [propio.campaniaId, '01234567', '99991111', crypto.randomUUID()]
  )
  assert.equal(jabero.dni, '99991111')
  const sesion = await call(
    'iniciar_sesion_lectura_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid,$6::uuid)',
    [
      propio.campaniaId,
      '01234567',
      '99991111',
      lote.id,
      crypto.randomUUID(),
      lote.variedad_id
    ]
  )
  assert.equal(sesion.ok, true)
  const legacy = await call("validar_operador_campanias('47480378'::varchar)")
  assert.ok(legacy.campanias.length)
  await db.exec('reset role')
  await login(nueva)
  const solicitud = await call('harvest_cultivos_solicitar($1::uuid,$2::uuid)', [
    T1,
    ajeno.cultivoId
  ])
  await login(existente)
  await call('harvest_cultivos_resolver($1::uuid,$2::uuid,true)', [T1, solicitud.id])
  await login('')
  assert.equal(
    (await call("validar_operador_campanias('01234567'::varchar)")).campanias.length,
    2
  )
  await db.query(
    'update identity_membresias set activo=false where usuario_id=(select usuario_id from identity_identidades where sujeto=$1)',
    [nueva]
  )
  await assert.rejects(
    call("validar_operador_campanias('01234567'::varchar)"),
    /No tiene campañas/
  )
  await db.query(
    'update identity_membresias set activo=true where usuario_id=(select usuario_id from identity_identidades where sujeto=$1)',
    [nueva]
  )
  await db.query(
    'delete from harvest_cultivo_supervisores where cultivo_id=$1 and usuario_id=(select usuario_id from identity_identidades where sujeto=$2)',
    [ajeno.cultivoId, nueva]
  )
  assert.equal(
    (await call("validar_operador_campanias('01234567'::varchar)")).campanias.length,
    1
  )
  await db.query(
    'update identity_usuarios set activo=false where id=(select usuario_id from identity_identidades where sujeto=$1)',
    [nueva]
  )
  await assert.rejects(
    call("validar_operador_campanias('01234567'::varchar)"),
    /No tiene campañas/
  )
  await db.query(
    'update identity_usuarios set activo=true where id=(select usuario_id from identity_identidades where sujeto=$1)',
    [nueva]
  )
})
