import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { prepararHarvestSql, A } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite({ extensions: { pgcrypto } })
const T2 = crypto.randomUUID()
const cuentas = {}
const migracion = '20261027152741_pda_vinculacion_dispositivos.sql'
const read = (name) => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const call = async (sql, args = []) => (await db.query('select ' + sql + ' r', args)).rows[0].r
const login = (nombre) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [cuentas[nombre]?.sujeto ?? ''])
const secreto = () => randomBytes(32).toString('hex')
const generar = (tenant = T1, horas = 24) => call('pda_generar_vinculacion($1::uuid,$2::integer)', [tenant, horas])
const listar = (tenant = T1) => call('pda_administrar_dispositivos($1::uuid)', [tenant])
const vincular = (token, dispositivo, nombre = 'PDA Campo Norte') =>
  call('pda_vincular_dispositivo($1::text,$2::uuid,$3::text,$4::text)', [token, dispositivo.id, dispositivo.clave, nombre])
const contexto = (d) => call('pda_obtener_contexto($1::uuid,$2::text)', [d.id, d.clave])
const revocar = (d, tenant = T1) => call('pda_revocar_dispositivo($1::uuid,$2::uuid)', [tenant, d.id])
const operar = (d, tipo, datos, id = crypto.randomUUID(), campania = A) =>
  call('pda_operar($1::uuid,$2::text,$3::uuid,$4::uuid,$5::text,$6::jsonb)', [d.id, d.clave, campania, id, tipo, datos])
const nuevoPda = () => ({ id: crypto.randomUUID(), clave: secreto() })
let qr, dispositivo, propio
let equipoActual
const cabecerasPda = (d, dni = '78561234') => db.query("select set_config('request.headers',$1,false)", [JSON.stringify(d ? {
  'x-gesgrow-device-id': d.id, 'x-gesgrow-device-key': d.clave, 'x-gesgrow-operator-dni': dni
} : {})])

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create role service_role bypassrls;`)
  for (const name of [
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
    '20261023232743_portal_activacion_dni.sql',
    '20261023232746_portal_supervisor_dni_pwa.sql',
    '20261023233717_portal_validacion_operador_dni.sql'
  ]) await db.exec(read(name))
  await db.exec(read(migracion))
  await db.exec(read('20261027175118_pda_supervisores_gestion.sql'))
  await db.exec(read('20261027181414_pda_ingreso_supervisor.sql'))
  await db.query("insert into tenants(id,nombre,codigo) values($1,'Empresa B','PDA-B')", [T2])
  for (const [nombre, tenant, rol] of [
    ['admin', T1, 'ADMIN_EMPRESA'],
    ['supervisor', T1, 'SUPERVISOR_COSECHA'],
    ['otroSupervisor', T1, 'SUPERVISOR_COSECHA'],
    ['consulta', T1, 'CONSULTA'],
    ['operador', T1, 'OPERADOR_CAMPO'],
    ['ajeno', T2, 'SUPERVISOR_COSECHA']
  ]) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await db.query('insert into auth.users(id,email,encrypted_password) values($1,$2,\'hash\')', [cuentas[nombre].sujeto, nombre + '@test.local'])
    await login(nombre)
    cuentas[nombre].id = (await call('iam_obtener_identidad()')).usuario.id
    await db.query(`with m as (
      insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id
    ) insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
      select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo=$3`,
    [tenant, cuentas[nombre].id, rol])
  }
  await login('supervisor')
  const fechas = (await db.query(`select
    (clock_timestamp() at time zone 'America/Lima')::date::text inicio,
    ((clock_timestamp() at time zone 'America/Lima')::date + 30)::text fin`)).rows[0]
  propio = await call('harvest_cultivos_crear($1::uuid,$2::uuid,$3::jsonb)', [T1, crypto.randomUUID(), {
    nombre: 'Cultivo PDA', color: '#3B64EC', variedades: ['Ventura'],
    lotes: [{ nombre: 'Campo Norte', variedades: ['Ventura'] }],
    campania: { nombre: 'Cosecha PDA', fechaInicio: fechas.inicio, fechaFin: fechas.fin }
  }])
  await db.exec('set role authenticated')
})
after(() => db.close())

test('ACL: las tablas y helpers privados no admiten acceso directo; anon no puede vincular ni operar', async () => {
  await login('admin')
  await assert.rejects(db.query('select * from pda_privado.dispositivos'), /permission denied/)
  await assert.rejects(db.query('select * from pda_privado.vinculaciones'), /permission denied/)
  await assert.rejects(call('pda_privado.exigir_dispositivo($1::uuid,$2::text)', [crypto.randomUUID(), secreto()]), /permission denied/)
  await db.exec('set role anon')
  await login(null)
  await assert.rejects(generar(), /permission denied/)
  await assert.rejects(vincular(secreto(), nuevoPda()), /permission denied/)
  await assert.rejects(contexto(nuevoPda()), /permission denied/)
  await assert.rejects(operar(nuevoPda(), 'CERRAR_SESION', {}), /permission denied/)
  await db.exec('set role authenticated')
  // Incluso con el rol authenticated no basta un JWT sin sujeto verificado.
  await assert.rejects(generar(), /Sesión autenticada/)
})

test('administrador y supervisor gestionan QR; consulta y operador no, con empresa y módulo validados', async () => {
  for (const nombre of ['consulta', 'operador', 'ajeno']) {
    await login(nombre)
    await assert.rejects(generar(), /denegado|no autorizada/)
  }
  await login('admin')
  await assert.rejects(generar(T2), /no autorizada/)
  for (const horas of [null, 0, 169]) await assert.rejects(generar(T1, horas), /vigencia/)
  qr = await generar()
  assert.match(qr.token, /^[0-9a-f]{64}$/)
  assert.equal(qr.tenantId, T1)
  const listado = await listar()
  assert.equal(listado.vinculacion.id, qr.id)
  assert.equal(listado.vinculacion.estado, 'ACTIVA')
  assert.deepEqual(listado.dispositivos, [])
  assert.equal(JSON.stringify(listado).includes(qr.token), false)
  await db.exec('reset role')
  const fila = (await db.query('select * from pda_privado.vinculaciones where id=$1', [qr.id])).rows[0]
  assert.equal(Buffer.from(fila.token_hash).toString('hex'), createHash('sha256').update(qr.token).digest('hex'))
  assert.equal(JSON.stringify(fila).includes(qr.token), false)
  await db.exec('set role authenticated')
  await login('supervisor')
  const anterior = qr
  qr = await generar()
  assert.notEqual(qr.token, anterior.token)
  assert.equal((await listar()).vinculacion.id, qr.id)
  await assert.rejects(generar(T2), /no autorizada/)
  await db.exec('reset role')
  assert.equal((await db.query('select creada_por from pda_privado.vinculaciones where id=$1', [qr.id])).rows[0].creada_por, cuentas.supervisor.id)
  await db.exec('set role authenticated')
})

test('vincular exige permiso operativo y membresía en la empresa del QR, además de la credencial', async () => {
  await login('consulta')
  await assert.rejects(vincular(qr.token, nuevoPda()), /denegado/)
  await login('ajeno')
  await assert.rejects(vincular(qr.token, nuevoPda()), /no autorizada/)
  await login('supervisor')
  await assert.rejects(vincular('123', nuevoPda()), /QR no disponible/)
  await assert.rejects(vincular(qr.token, { id: crypto.randomUUID(), clave: '1234' }), /32 bytes/)
  await assert.rejects(vincular(qr.token, nuevoPda(), ' '), /nombre/)
  dispositivo = nuevoPda()
  const primero = await vincular(qr.token, dispositivo)
  const reintento = await vincular(qr.token, dispositivo)
  assert.deepEqual(reintento, primero)
  assert.equal(primero.contexto.usuarioId, cuentas.supervisor.id)
  assert.equal(primero.dispositivo.tenantId, T1)
  assert.equal(JSON.stringify(primero).includes(dispositivo.clave), false)
  await assert.rejects(vincular(qr.token, { ...dispositivo, clave: secreto() }), /ya está vinculada/)
  await db.exec('reset role')
  const fila = (await db.query('select * from pda_privado.dispositivos where id=$1', [dispositivo.id])).rows[0]
  assert.equal(Buffer.from(fila.credencial_hash).toString('hex'), createHash('sha256').update(dispositivo.clave).digest('hex'))
  await db.exec('set role authenticated')
})

test('regenerar invalida el QR anterior, conserva el PDA vinculado y rechaza QR vencidos', async () => {
  await login('admin')
  const anterior = qr
  qr = await generar()
  await login('supervisor')
  await assert.rejects(vincular(anterior.token, nuevoPda()), /QR no disponible/)
  const c = await contexto(dispositivo)
  assert.equal(c.contexto.tenantId, T1)
  assert.ok(c.campanias.some((fila) => fila.id === propio.campaniaId))
  assert.ok(Date.parse(c.autorizadoHasta) > Date.parse(c.validadoEn))
  assert.ok(Date.parse(c.autorizadoHasta) - Date.parse(c.validadoEn) <= 86400000)
  assert.ok(c.dispositivo.ultimoAccesoEn)
  await db.exec('reset role')
  await db.query("update pda_privado.vinculaciones set creada_en=now()-interval '2 days', vence_en=now()-interval '1 day' where id=$1", [qr.id])
  await db.exec('set role authenticated')
  await assert.rejects(vincular(qr.token, nuevoPda()), /QR no disponible/)
  assert.equal((await contexto(dispositivo)).dispositivo.id, dispositivo.id)
  await login('admin')
  assert.equal((await listar()).vinculacion.estado, 'VENCIDA')
  qr = await generar()
})

test('validación reconsulta usuario, membresía, rol, módulo y empresa; una clave o empresa ajena no sirve', async () => {
  await login('supervisor')
  await assert.rejects(contexto({ ...dispositivo, clave: secreto() }), /no autorizado/)
  await login('ajeno')
  await assert.rejects(contexto(dispositivo), /no autorizada/)
  await login('supervisor')
  for (const [revocarSql, restaurarSql, args] of [
    ['update identity_usuarios set activo=false where id=$1', 'update identity_usuarios set activo=true where id=$1', [cuentas.supervisor.id]],
    ['update identity_membresias set activo=false where usuario_id=$1', 'update identity_membresias set activo=true where usuario_id=$1', [cuentas.supervisor.id]],
    ["update identity_roles set activo=false where tenant_id=$1 and codigo='SUPERVISOR_COSECHA'", "update identity_roles set activo=true where tenant_id=$1 and codigo='SUPERVISOR_COSECHA'", [T1]],
    ["update tenants set estado='SUSPENDIDA' where id=$1", "update tenants set estado='ACTIVA' where id=$1", [T1]],
    ["update platform_modulos set disponible=false where codigo='HARVEST'", "update platform_modulos set disponible=true where codigo='HARVEST'", []]
  ]) {
    await db.exec('reset role')
    await db.query(revocarSql, args)
    await db.exec('set role authenticated')
    await assert.rejects(contexto(dispositivo))
    await db.exec('reset role')
    await db.query(restaurarSql, args)
    await db.exec('set role authenticated')
    assert.equal((await contexto(dispositivo)).contexto.usuarioId, cuentas.supervisor.id)
  }
})

test('operaciones reales conservan UUID, recibos y autor al reintentar; rechazan otro actor, datos o empresa', async () => {
  await login('supervisor')
  const campania = propio.campaniaId
  const recursos = await call('iam_recursos_campania($1::uuid)', [campania])
  const lote = recursos.lotes[0]
  const variedad = recursos.variedades[0].variedad_id
  // El jabero debe pertenecer a la nueva campaña y cumplir las reglas de Workforce.
  await db.exec('reset role')
  const worker = (await db.query(`insert into trabajadores(tenant_id,dni,nombres,apellidos,activo)
    values($1,'88887777','Jabero','PDA',true) returning id`, [T1])).rows[0].id
  const jabero = (await db.query(`insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo)
    values($1,$2,'JABERO',true) returning id`, [worker, campania])).rows[0].id
  await db.exec('set role authenticated')
  const inicioId = crypto.randomUUID()
  const inicioDatos = { loteId: lote.id, variedadId: variedad, jaberoRolId: jabero }
  const externaId = crypto.randomUUID()
  await call('iam_iniciar_sesion_lectura($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)', [campania, lote.id, variedad, jabero, externaId])
  await call('iam_cerrar_sesion_lectura($1::uuid,$2::uuid)', [campania, externaId])
  await assert.rejects(operar(dispositivo, 'INICIAR_SESION', inicioDatos, externaId, campania), /existente fuera del contrato/)
  const inicio = await operar(dispositivo, 'INICIAR_SESION', inicioDatos, inicioId, campania)
  assert.equal(inicio.id, inicioId)
  assert.deepEqual(await operar(dispositivo, 'INICIAR_SESION', inicioDatos, inicioId, campania), inicio)
  const generacion = await call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,2,2)', [T1, campania, crypto.randomUUID()])
  await db.exec('reset role')
  const codigo = (await db.query('select codigo from harvest_tickets where lote_id=$1 order by codigo limit 1', [generacion.lotes[0].id])).rows[0].codigo
  await db.query('insert into harvest_cutovers(campania_id,version,activado_en,activado_por) values($1,1,clock_timestamp(),auth.uid())', [campania])
  await db.exec('set role authenticated')
  const asignacionId = crypto.randomUUID()
  const asignacionDatos = { trabajadorId: worker, codigo }
  const asignacion = await operar(dispositivo, 'ASIGNAR_LOTE', asignacionDatos, asignacionId, campania)
  assert.equal(asignacion.asignacion.trabajador_id, worker)
  assert.deepEqual(await operar(dispositivo, 'ASIGNAR_LOTE', asignacionDatos, asignacionId, campania), asignacion)
  const registroId = crypto.randomUUID()
  const registroDatos = { sesionId: inicioId, codigo, fecha: await call('clock_timestamp()::text') }
  const registro = await operar(dispositivo, 'REGISTRAR_COSECHA', registroDatos, registroId, campania)
  assert.equal(registro.registro.id, registroId)
  assert.deepEqual(await operar(dispositivo, 'REGISTRAR_COSECHA', registroDatos, registroId, campania), registro)
  await assert.rejects(operar(dispositivo, 'REGISTRAR_COSECHA', registroDatos, crypto.randomUUID(), campania), /ya_utilizado/)
  // Un rechazo revierte también el recibo y el contexto temporal del dispositivo.
  assert.equal(await call("coalesce(current_setting('gesgrow.pda_solicitud',true),'')"), '')
  await assert.rejects(operar(dispositivo, 'INICIAR_SESION', { ...inicioDatos, extra: 'cambiado' }, inicioId, campania), /reutilizado/)
  await login('otroSupervisor')
  await db.exec('reset role')
  await db.query('insert into harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) values($1,$2,$3)', [T1, propio.cultivoId, cuentas.otroSupervisor.id])
  await db.exec('set role authenticated')
  assert.equal((await contexto(dispositivo)).contexto.usuarioId, cuentas.otroSupervisor.id)
  await assert.rejects(operar(dispositivo, 'INICIAR_SESION', inicioDatos, inicioId, campania), /otro actor/)
  await login('supervisor')
  const otroPda = nuevoPda()
  await vincular(qr.token, otroPda)
  await assert.rejects(operar(otroPda, 'INICIAR_SESION', inicioDatos, inicioId, campania), /dispositivo/)
  await db.exec('reset role')
  const otraCampania = crypto.randomUUID()
  await db.query("insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'PDA-X','Otra empresa','ACTIVA')", [otraCampania, T2])
  await db.exec('set role authenticated')
  await assert.rejects(operar(dispositivo, 'CERRAR_SESION', { sesionId: inicioId }, crypto.randomUUID(), otraCampania), /otra empresa/)
  const cierreId = crypto.randomUUID()
  const cierre = await operar(dispositivo, 'CERRAR_SESION', { sesionId: inicioId }, cierreId, campania)
  assert.equal(cierre.estado, 'CERRADA')
  assert.deepEqual(await operar(dispositivo, 'CERRAR_SESION', { sesionId: inicioId }, cierreId, campania), cierre)
  await db.exec('reset role')
  const recibo = (await db.query('select * from pda_privado.operaciones where id=$1', [inicioId])).rows[0]
  assert.equal(recibo.usuario_id, cuentas.supervisor.id)
  assert.equal(recibo.dispositivo_id, dispositivo.id)
  assert.equal((await db.query('select count(*)::int n from harvest_registros_cosecha where codigo_ticket=$1', [codigo])).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int n from pda_privado.operaciones where dispositivo_id=$1', [dispositivo.id])).rows[0].n, 4)
  await db.exec('set role authenticated')
  // La revocación se comprueba antes de devolver un recibo ya confirmado.
  await login('admin')
  await revocar(dispositivo)
  await login('supervisor')
  await assert.rejects(operar(dispositivo, 'INICIAR_SESION', inicioDatos, inicioId, campania), /no autorizado/)
})

test('activación por empresa cierra rutas legacy e IAM sin dispositivo y restaura el contexto tras fallos', async () => {
  const configurar = (obligatorio) => call('pda_configurar_acceso($1::uuid,$2::boolean)', [T1, obligatorio])
  await login('supervisor')
  await assert.rejects(configurar(true), /denegado/)
  const d = nuevoPda()
  await vincular(qr.token, d)
  await login('admin')
  assert.equal((await listar()).accesoVinculadoObligatorio, false)
  await assert.rejects(configurar(null), /Estado/)
  assert.equal((await configurar(true)).accesoVinculadoObligatorio, true)
  assert.equal((await listar()).accesoVinculadoObligatorio, true)
  await login('supervisor')
  const cierre = () => call('iam_cerrar_sesion_lectura($1::uuid,$2::uuid)', [propio.campaniaId, crypto.randomUUID()])
  await assert.rejects(cierre(), /PDA vinculado requerido/)
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({
    'x-gesgrow-device-id': d.id, 'x-gesgrow-device-key': secreto()
  })])
  await assert.rejects(cierre(), /PDA vinculado requerido/)
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({
    'x-gesgrow-device-id': d.id, 'x-gesgrow-device-key': d.clave
  })])
  // Una cabecera no abre una ruta sin recibo de dispositivo.
  await assert.rejects(cierre(), /PDA vinculado requerido/)
  await db.query("select set_config('request.headers','',false)")
  await assert.rejects(operar(d, 'CERRAR_SESION', { sesionId: crypto.randomUUID() }, crypto.randomUUID(), propio.campaniaId), /Sesión de otra cuenta/)
  assert.equal(await call("coalesce(current_setting('gesgrow.pda_solicitud',true),'')"), '')
  await db.exec('reset role')
  const jabero = (await db.query("select id from trabajador_campania_rol where campania_id=$1 and rol='JABERO'", [propio.campaniaId])).rows[0].id
  await db.exec('set role authenticated')
  const recursos = await call('iam_recursos_campania($1::uuid)', [propio.campaniaId])
  const inicioId = crypto.randomUUID()
  const datos = { loteId: recursos.lotes[0].id, variedadId: recursos.variedades[0].variedad_id, jaberoRolId: jabero }
  const inicio = await operar(d, 'INICIAR_SESION', datos, inicioId, propio.campaniaId)
  assert.equal(inicio.id, inicioId)
  assert.deepEqual(await operar(d, 'INICIAR_SESION', datos, inicioId, propio.campaniaId), inicio)
  assert.equal(await call("coalesce(current_setting('gesgrow.pda_solicitud',true),'')"), '')
  await operar(d, 'CERRAR_SESION', { sesionId: inicioId }, crypto.randomUUID(), propio.campaniaId)
  await db.exec('set role anon')
  await login(null)
  await assert.rejects(call('obtener_cache_operativa_campania($1::uuid,$2::varchar)', [A, '47480378']), /requiere sesión autenticada/)
  await assert.rejects(call('registrar_jabero_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid)', [A, '47480378', '77776666', crypto.randomUUID()]), /requiere sesión autenticada/)
  await db.exec('set role authenticated')
  await login('admin')
  await revocar(d)
  await login('supervisor')
  await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({
    'x-gesgrow-device-id': d.id, 'x-gesgrow-device-key': d.clave
  })])
  await assert.rejects(cierre(), /PDA vinculado requerido/)
  await db.query("select set_config('request.headers','',false)")
  await login('admin')
  await configurar(false)
  await db.exec('set role anon')
  await login(null)
  assert.equal((await call('obtener_cache_operativa_campania($1::uuid,$2::varchar)', [A, '47480378'])).campania.id, A)
  await db.exec('set role authenticated')
})

test('revocación es independiente del QR, no permite reactivar la instalación y no admite otra empresa', async () => {
  await login('supervisor')
  const d = nuevoPda()
  await vincular(qr.token, d)
  await login('consulta')
  await assert.rejects(revocar(d), /denegado/)
  await login('supervisor')
  await assert.rejects(revocar(d, T2), /no autorizada/)
  const primera = await revocar(d)
  assert.equal(primera.estado, 'REVOCADO')
  assert.deepEqual(await revocar(d), primera)
  assert.equal((await listar()).vinculacion.id, qr.id)
  await db.exec('reset role')
  assert.equal((await db.query('select revocado_por from pda_privado.dispositivos where id=$1', [d.id])).rows[0].revocado_por, cuentas.supervisor.id)
  await db.exec('set role authenticated')
  await login('supervisor')
  await assert.rejects(contexto(d), /no autorizado/)
  await assert.rejects(vincular(qr.token, d), /revocada/)
  await vincular(qr.token, nuevoPda())
})

test('los endpoints públicos son invoker y los secretos permanecen fuera del esquema expuesto', async () => {
  await db.exec('reset role')
  await db.exec(read('20261027175118_pda_supervisores_gestion.sql'))
  assert.equal(await call("has_function_privilege('authenticated','pda_privado.exigir_gestion(uuid)','execute')"), false)
  const funciones = (await db.query(`select p.proname,p.prosecdef from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pda_%'`)).rows
  assert.equal(funciones.length, 8)
  assert.ok(funciones.every((f) => f.prosecdef === false))
  const tablas = (await db.query(`select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='pda_privado' and c.relkind='r'`)).rows
  assert.equal(tablas.length, 4)
  assert.ok(tablas.every((t) => t.relrowsecurity))
  const anon = (await db.query(`select has_schema_privilege('anon','pda_privado','usage') permitido`)).rows[0]
  assert.equal(anon.permitido, false)
  await db.exec('set role authenticated')
})

test('el ingreso deriva el DNI de la cuenta autenticada y revalida equipo, empresa y campañas', async () => {
  await login('supervisor')
  await db.exec('reset role')
  await db.query('update identity_usuarios set dni=$1,nombre=$2 where id=$3', ['78561234','Supervisor PDA',cuentas.supervisor.id])
  await call('iam_vincular_dni_supervisor($1::uuid)', [T1])
  await db.exec('set role authenticated')
  const d = nuevoPda()
  const nuevoQr = await generar()
  await vincular(nuevoQr.token, d)
  const ingresar = () => call('pda_preparar_ingreso($1::uuid,$2::text)', [d.id,d.clave])
  const ingreso = await ingresar()
  assert.equal(ingreso.operador.dni, '78561234')
  assert.equal(ingreso.contexto.usuarioId, cuentas.supervisor.id)
  assert.ok(ingreso.operador.campanias.length > 0)
  assert.ok(ingreso.operador.campanias.every(c => c.tenant_id === T1))
  await login('otroSupervisor')
  assert.equal((await ingresar()).operador, null)
  await login('ajeno')
  await assert.rejects(ingresar(), /no autorizada/)
  await login('supervisor')
  await revocar(d)
  await assert.rejects(ingresar(), /no autorizado/)
  await db.exec('set role anon')
  await assert.rejects(ingresar(), /permission denied/)
  await db.exec('set role authenticated')
})

let dispositivoPin, sesionPin
const loginPin = (dni = '78561234', pin = '0427', d = dispositivoPin) => call('pda_iniciar_sesion_pin($1::uuid,$2::text,$3::text,$4::text)', [d.id,d.clave,dni,pin])
const validarPin = (sesion = sesionPin, d = dispositivoPin) => call('pda_preparar_ingreso_pin($1::uuid,$2::text,$3::text)', [d.id,d.clave,sesion])

test('configurar PIN exige cuenta autenticada y equipo ya vinculado; hash bcrypt real sin PIN en claro', async () => {
  await db.exec('reset role')
  await db.exec(read('20261028074652_pda_acceso_dni_pin.sql'))
  await db.exec('set role authenticated')
  await login('supervisor')
  dispositivoPin = nuevoPda()
  const token = (await generar()).token
  await vincular(token,dispositivoPin)
  await assert.rejects(call('pda_configurar_pin($1,$2,$3)',[dispositivoPin.id,dispositivoPin.clave,'123']),/4 dígitos/)
  await assert.rejects(call('pda_configurar_pin($1,$2,$3)',[dispositivoPin.id,secreto(),'0427']),/no autorizado/)
  assert.equal((await call('pda_configurar_pin($1,$2,$3)',[dispositivoPin.id,dispositivoPin.clave,'0427'])).dni,'78561234')
  await db.exec('reset role')
  const fila=(await db.query('select hash from pda_privado.pines where tenant_id=$1 and usuario_id=$2',[T1,cuentas.supervisor.id])).rows[0]
  assert.match(fila.hash,/^\$2[aby]\$10\$/)
  assert.equal(fila.hash.includes('0427'),false)
  await db.exec('set role anon');await login(null)
  await assert.rejects(call('pda_configurar_pin($1,$2,$3)',[dispositivoPin.id,dispositivoPin.clave,'0427']),/permission denied/)
  await assert.rejects(db.query('select * from pda_privado.pines'),/permission denied/)
  await assert.rejects(call('pda_privado.contexto_pin($1,$2,$3)',[cuentas.supervisor.sujeto,dispositivoPin.id,dispositivoPin.clave]),/permission denied/)
})

test('DNI y PIN ingresan sin correo, derivan el actor y conservan contexto JWT original al terminar', async () => {
  const r=await loginPin()
  assert.equal(r.ok,true);assert.match(r.sesion,/^[0-9a-f]{64}$/);sesionPin=r.sesion
  assert.equal(r.datos.contexto.usuarioId,cuentas.supervisor.id)
  assert.equal(r.datos.operador.dni,'78561234')
  assert.equal(await call('auth.uid()'),null)
  const actual=await validarPin()
  assert.equal(actual.contexto.tenantId,T1)
  assert.ok(Date.parse(actual.autorizadoHasta)<=Date.now()+12*60*60*1000+1000)
  assert.equal(await call('auth.uid()'),null)
  await assert.rejects(validarPin(secreto()),/sesión venció/)
  await assert.rejects(validarPin(sesionPin,{id:crypto.randomUUID(),clave:dispositivoPin.clave}),/PDA no autorizado/)
  await db.exec('reset role')
  const guardado=(await db.query('select token_hash from pda_privado.sesiones_pin where dispositivo_id=$1 and revocada_en is null',[dispositivoPin.id])).rows[0]
  assert.equal(Buffer.from(guardado.token_hash).toString('hex'),createHash('sha256').update(sesionPin).digest('hex'))
  await db.exec('set role anon')
})

test('los intentos incorrectos se confirman y bloquean tras cinco fallos, incluso desde otro equipo', async () => {
  for(let i=0;i<5;i++) assert.equal((await loginPin('78561234','9999')).ok,false)
  assert.match((await loginPin()).mensaje,/15 minutos/)
  await db.exec('reset role')
  const intentos=(await db.query('select fallos,bloqueado_hasta from pda_privado.pines where tenant_id=$1 and usuario_id=$2',[T1,cuentas.supervisor.id])).rows[0]
  assert.equal(intentos.fallos,5);assert.ok(intentos.bloqueado_hasta)
  await db.exec('set role authenticated');await login('supervisor')
  const otro=nuevoPda();await vincular((await generar()).token,otro)
  await db.exec('set role anon');await login(null)
  assert.match((await loginPin('78561234','0427',otro)).mensaje,/15 minutos/)
  for(let i=0;i<10;i++) assert.equal((await loginPin('00000000','9999',otro)).ok,false)
  assert.match((await loginPin('78561234','0427',otro)).mensaje,/15 minutos/)
  await db.exec('reset role')
  await db.query("update pda_privado.pines set bloqueado_hasta=clock_timestamp()-interval '1 minute'")
  await db.query("update pda_privado.intentos_pin set bloqueado_hasta=clock_timestamp()-interval '1 minute'")
  await db.exec('set role anon')
  sesionPin=(await loginPin()).sesion
  assert.ok(sesionPin)
})

test('sesión PIN no cambia de actor con un JWT ajeno y revalida permisos; salir y cambiar PIN invalidan sesiones', async () => {
  await db.exec('set role authenticated');await login('otroSupervisor')
  assert.equal((await validarPin()).contexto.usuarioId,cuentas.supervisor.id)
  assert.equal(await call('auth.uid()'),cuentas.otroSupervisor.sujeto)
  await login('supervisor')
  await call('pda_configurar_pin($1,$2,$3)',[dispositivoPin.id,dispositivoPin.clave,'0427'])
  await assert.rejects(validarPin(),/sesión venció/)
  await db.exec('set role anon');await login(null)
  sesionPin=(await loginPin()).sesion
  const sesionAnterior=sesionPin
  sesionPin=(await loginPin()).sesion
  await assert.rejects(validarPin(sesionAnterior),/sesión venció/)
  await call('pda_cerrar_sesion_pin($1,$2,$3)',[dispositivoPin.id,dispositivoPin.clave,sesionPin])
  await assert.rejects(validarPin(),/sesión venció/)
  sesionPin=(await loginPin()).sesion
  await db.exec('reset role')
  await db.query('update identity_membresias set activo=false where tenant_id=$1 and usuario_id=$2',[T1,cuentas.supervisor.id])
  await db.exec('set role anon')
  await assert.rejects(validarPin(),/no autorizada/)
  assert.equal(await call('auth.uid()'),null)
  await db.exec('reset role')
  await db.query('update identity_membresias set activo=true where tenant_id=$1 and usuario_id=$2',[T1,cuentas.supervisor.id])
  await db.exec('set role authenticated');await login('supervisor')
  await revocar(dispositivoPin)
  await db.exec('set role anon');await login(null)
  await assert.rejects(validarPin(),/revocado/)
  await assert.rejects(loginPin(),/revocado/)
})

test('ingreso solo DNI exige PDA vinculado y limita campañas a su empresa sin necesitar PIN', async () => {
  await db.exec('reset role')
  await db.exec(read('20261028160710_pda_ingreso_solo_dni.sql'))
  assert.equal(await call("has_function_privilege('authenticated','pda_preparar_ingreso_dni(uuid,text,text)','execute')"), false)
  assert.equal(await call("(select prosecdef from pg_proc where oid='public.pda_preparar_ingreso_dni(uuid,text,text)'::regprocedure)"), false)
  await db.exec('set role authenticated'); await login('supervisor')
  const d = nuevoPda()
  await vincular((await generar()).token, d)
  const ingreso = (dni = '78561234', equipo = d) => call('pda_preparar_ingreso_dni($1,$2,$3)', [equipo.id,equipo.clave,dni])
  await db.exec('set role anon'); await login(null)
  const r = await ingreso()
  assert.equal(r.operador.dni, '78561234')
  assert.equal(r.contexto.usuarioId, cuentas.supervisor.id)
  assert.equal(r.contexto.tenantId, T1)
  assert.ok(r.operador.campanias.length > 0)
  assert.ok(r.operador.campanias.every(c => c.tenant_id === T1))
  await assert.rejects(ingreso('78561234', {...d, clave: secreto()}), /no autorizado/)
  await assert.rejects(ingreso('00000000'), /DNI no autorizado/)
  await assert.rejects(ingreso('123'), /8 dígitos/)
  for (const [revocarSql, restaurarSql, args] of [
    ['update identity_membresias set activo=false where usuario_id=$1', 'update identity_membresias set activo=true where usuario_id=$1', [cuentas.supervisor.id]],
    ["update tenants set estado='SUSPENDIDA' where id=$1", "update tenants set estado='ACTIVA' where id=$1", [T1]],
    ["update platform_modulos set disponible=false where codigo='HARVEST'", "update platform_modulos set disponible=true where codigo='HARVEST'", []]
  ]) {
    await db.exec('reset role'); await db.query(revocarSql,args); await db.exec('set role anon')
    await assert.rejects(ingreso(), e => e.code === '42501')
    await db.exec('reset role'); await db.query(restaurarSql,args); await db.exec('set role anon')
    assert.equal((await ingreso()).operador.dni, '78561234')
  }
  await db.exec('set role authenticated'); await login('supervisor'); await revocar(d)
  await db.exec('set role anon'); await login(null)
  await assert.rejects(ingreso(), /revocado/)
})

test('ingreso DNI conserva operadores anteriores y rechaza un trabajador de otra empresa', async () => {
  await db.exec('reset role')
  const worker = (await db.query(`insert into trabajadores(tenant_id,dni,nombres,apellidos,activo)
    values($1,'66778899','Operador','Anterior',true) returning id`, [T1])).rows[0].id
  await db.query('insert into usuarios_app(tenant_id,trabajador_id,activo) values($1,$2,true)', [T1,worker])
  await db.query("insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)", [worker,propio.campaniaId])
  await db.exec('set role authenticated'); await login('supervisor')
  const d = nuevoPda(); await vincular((await generar()).token,d)
  await db.exec('set role anon'); await login(null)
  const ingreso = () => call('pda_preparar_ingreso_dni($1,$2,$3)', [d.id,d.clave,'66778899'])
  const r = await ingreso()
  assert.equal(r.operador.dni, '66778899')
  assert.equal(r.contexto.usuarioId, worker)
  assert.ok(r.operador.campanias.every(c => c.tenant_id === T1))
  await db.exec('reset role')
  await db.query('update usuarios_app set activo=false where trabajador_id=$1',[worker])
  await db.exec('set role anon')
  await assert.rejects(ingreso(), e => e.code === '42501')
  await db.exec('reset role')
  await db.query('update usuarios_app set activo=true where trabajador_id=$1',[worker])
  const ajeno = (await db.query(`insert into trabajadores(tenant_id,dni,nombres,apellidos,activo)
    values($1,'55667788','Operador','Ajeno',true) returning id`, [T2])).rows[0].id
  await db.query('insert into usuarios_app(tenant_id,trabajador_id,activo) values($1,$2,true)', [T2,ajeno])
  await db.exec('set role anon')
  await assert.rejects(call('pda_preparar_ingreso_dni($1,$2,$3)', [d.id,d.clave,'55667788']), /DNI no autorizado/)
})

test('renovar exige gestión en la empresa, conserva identidad y credencial y audita sin duplicar reintentos', async () => {
  await db.exec('reset role')
  await db.exec(read('20261028163604_pda_renovar_acceso.sql'))
  assert.equal(await call("has_function_privilege('anon','public.pda_renovar_dispositivo(uuid,uuid)','execute')"), false)
  assert.equal(await call("(select prosecdef from pg_proc where oid='public.pda_renovar_dispositivo(uuid,uuid)'::regprocedure)"), false)
  assert.equal(await call("(select relrowsecurity from pg_class where oid='pda_privado.renovaciones'::regclass)"), true)
  const renovar = (d, tenant = T1) => call('pda_renovar_dispositivo($1::uuid,$2::uuid)',[tenant,d.id])
  await db.exec('set role authenticated'); await login('supervisor')
  const d = nuevoPda(); await vincular((await generar()).token,d)
  const antes = await contexto(d)
  const revocado = await revocar(d)
  for (const cuenta of ['consulta', 'operador', 'ajeno']) {
    await login(cuenta)
    await assert.rejects(renovar(d), /denegado|no autorizada/)
  }
  await login('supervisor')
  await assert.rejects(renovar(d,T2), /no autorizada/)
  await assert.rejects(renovar(nuevoPda()), /no disponible/)
  await db.exec('reset role')
  await db.exec("update platform_modulos set disponible=false where codigo='HARVEST'")
  await db.exec('set role authenticated')
  await assert.rejects(renovar(d), /habilitado/)
  await db.exec('reset role')
  await db.exec("update platform_modulos set disponible=true where codigo='HARVEST'")
  await db.exec('set role authenticated')
  const renovado = await renovar(d)
  assert.equal(renovado.estado,'ACTIVO')
  assert.equal(renovado.id,antes.dispositivo.id)
  assert.equal(renovado.vinculadoEn,antes.dispositivo.vinculadoEn)
  assert.equal(renovado.vinculadoPor,antes.dispositivo.vinculadoPor)
  assert.equal(renovado.revocadoEn,null)
  assert.deepEqual(await renovar(d),renovado)
  assert.equal((await contexto(d)).dispositivo.id,d.id)
  await assert.rejects(db.query('select * from pda_privado.renovaciones'), /permission denied/)
  await db.exec('reset role')
  const auditoria = (await db.query('select * from pda_privado.renovaciones where dispositivo_id=$1',[d.id])).rows
  assert.equal(auditoria.length,1)
  assert.equal(auditoria[0].renovado_por,cuentas.supervisor.id)
  assert.equal(auditoria[0].revocado_por,cuentas.supervisor.id)
  assert.equal(new Date(auditoria[0].revocado_en).toISOString(),new Date(revocado.revocadoEn).toISOString())
  await db.exec('set role authenticated'); await revocar(d); await login('admin')
  assert.equal((await renovar(d)).estado,'ACTIVO')
  await login(null)
  await assert.rejects(renovar(d), /autenticada/)
  await db.exec('set role anon')
  await assert.rejects(renovar(d), /permission denied/)
})

test('campaña nueva asigna el lote completo, rechaza ticket hermano y aparece en la consulta administrativa', async () => {
  await db.exec('reset role'); await login('supervisor')
  await db.exec(read('20261028185125_harvest_asignacion_lote_obligatoria.sql'))
  await db.exec(read('202610221100_harvest_listados_lotes.sql'))
  await db.exec(read('20261028190321_harvest_fecha_asignacion_lote.sql'))
  const inicio=(await db.query("select (clock_timestamp() at time zone 'America/Lima')::date::text d")).rows[0].d
  const r=await call('harvest_cultivos_crear($1::uuid,$2::uuid,$3::jsonb)',[T1,crypto.randomUUID(),{
    nombre:'Cultivo seguro',color:'#3B64EC',variedades:['Ventura'],
    lotes:[{nombre:'Norte',variedades:['Ventura']}],
    campania:{nombre:'Nueva por lote',fechaInicio:inicio,fechaFin:inicio}
  }])
  assert.equal(await call('(select count(*) from harvest_cutovers where campania_id=$1)',[r.campaniaId]),1)
  const lote=crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id,tenant_id) values($1,$2,$3)',[lote,r.campaniaId,T1])
  await db.query("insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values('E012-01',$1,$2,$3),('E012-02',$1,$2,$3)",[lote,r.campaniaId,T1])
  const asignar=(codigo,dni,op)=>call('harvest_asignar_lote_tickets($1::uuid,$2::varchar,$3::varchar,$4::text,$5::uuid)',[r.campaniaId,'78561234',dni,codigo,op])
  await db.exec('set role anon');await login(null)
  const op=crypto.randomUUID()
  await asignar('E012-01','33445566',op)
  await assert.rejects(asignar('E012-02','44556677',crypto.randomUUID()),/harvest_lote_ya_asignado/)
  await asignar('E012-02','33445566',op) // reintento idempotente del mismo lote
  const snapshot=await call('harvest_obtener_snapshot($1::uuid,$2::varchar)',[r.campaniaId,'78561234'])
  assert.equal(snapshot.asignacionesDeLote.length,1)
  assert.ok(snapshot.asignacionesDeLote[0].fechaAsignacion)
  assert.equal(snapshot.cutover.version,1)
  await assert.rejects(call('asignar_ticket_campania($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::uuid)',[r.campaniaId,'78561234','44556677','E012-02',crypto.randomUUID()]),/legacy_solo_lectura/)
  await db.exec('set role authenticated'); await login('supervisor')
  const dto=await call('harvest_admin_obtener($1::uuid,$2::text,$3::text)',[T1,'lotes',lote])
  assert.equal(dto.estado,'ASIGNADO')
  assert.equal(dto.cantidadTickets,2)
  assert.equal(dto.asignacion.operacionId,op)
  const tabla=await call('harvest_admin_listar($1::uuid,$2::text,$3::uuid)',[T1,'asignaciones',r.campaniaId])
  assert.equal(tabla.total,1)
  assert.equal(tabla.filas[0].id,lote)
  assert.ok(tabla.filas[0].asignadoEn)
  await db.exec('reset role')
  assert.equal(await call('(select count(*) from harvest_asignaciones_lote where lote_id=$1)',[lote]),1)
})

test('conciliar un lote dividido conserva ambas asignaciones y exige una decisión privada explícita', async () => {
  await db.exec('reset role'); await login('supervisor')
  const lote=crypto.randomUUID(),op=crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id,tenant_id) values($1,$2,$3)',[lote,A,T1])
  const workers=[]
  for(const [codigo,dni] of [['HIST-01','33445566'],['HIST-02','44556677']]) {
    const w=await call('(select id from trabajadores where dni=$1)',[dni]); workers.push(w)
    const rol=(await db.query(`insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo,tenant_id)
      values($1,$2,'COSECHADOR',true,$3) returning id`,[w,A,T1])).rows[0].id
    await db.query('insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',[codigo,lote,A,T1])
    await db.query('insert into asignaciones_ticket(codigo_ticket,campania_id,cosechador_rol_id,tenant_id) values($1,$2,$3,$4)',[codigo,A,rol,T1])
  }
  const asignar=()=>db.query('insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id,tenant_id) values($1,$2,$3,$4,$5)',[lote,A,workers[0],op,T1])
  await assert.rejects(asignar(),/pendientes de conciliación/)
  await db.query(`insert into pda_privado.conciliaciones_lote(lote_id,campania_id,trabajador_id,operacion_id,conciliado_por,motivo,historial)
    select $1,$2,$3,$4,$5,'Conservar la primera asignación',jsonb_agg(to_jsonb(a)) from asignaciones_ticket a
    join harvest_tickets t on t.codigo=a.codigo_ticket and t.campania_id=a.campania_id where t.lote_id=$1`,[lote,A,workers[0],op,cuentas.supervisor.sujeto])
  await asignar()
  assert.equal(await call('(select trabajador_id from harvest_asignaciones_lote where lote_id=$1)',[lote]),workers[0])
  assert.equal(await call('(select count(*) from asignaciones_ticket a join harvest_tickets t on t.codigo=a.codigo_ticket where t.lote_id=$1)',[lote]),2)
  assert.equal(await call('(select jsonb_array_length(historial) from pda_privado.conciliaciones_lote where lote_id=$1)',[lote]),2)
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from pda_privado.conciliaciones_lote'),/permission denied/)
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from pda_privado.conciliaciones_lote'),/permission denied/)
})

test('el transporte actual cierra rutas directas y permite operar con la guarda obligatoria y el mismo UUID', async () => {
  await db.exec('reset role')
  await db.exec(read('20261030184601_pda_autorizacion_por_solicitud.sql'))
  for (const firma of ['pda_privado.operador_cuenta(uuid,varchar)', 'pda_privado.operador_empresa(uuid,varchar)', 'pda_privado.equipo_solicitud()']) {
    for (const rol of ['anon', 'authenticated', 'service_role'])
      assert.equal(await call('has_function_privilege($1,$2,\'execute\')', [rol, firma]), false)
  }
  await db.exec('set role authenticated'); await login('supervisor')
  equipoActual = nuevoPda()
  await vincular((await generar()).token, equipoActual)
  await login('admin')
  await call('pda_configurar_acceso($1::uuid,$2::boolean)', [T1, true])
  await db.exec('set role anon'); await login(null); await cabecerasPda(null)
  const ingreso = await call('pda_preparar_ingreso_dni($1,$2,$3)', [equipoActual.id,equipoActual.clave,'78561234'])
  assert.equal(ingreso.operador.dni, '78561234')
  const snapshot = () => call('harvest_obtener_snapshot($1::uuid,$2::varchar)', [propio.campaniaId,'78561234'])
  await assert.rejects(snapshot(), e => e.code === '42501')
  await cabecerasPda({...equipoActual,clave:secreto()})
  await assert.rejects(snapshot(), e => e.code === '42501')
  await db.query("select set_config('request.headers',$1,false),set_config('gesgrow.pda_solicitud',$2,false)", [
    JSON.stringify({'x-gesgrow-device-id':equipoActual.id,'x-gesgrow-operator-dni':'78561234'}),
    JSON.stringify({id:equipoActual.id,credencial:equipoActual.clave})
  ])
  await assert.rejects(snapshot(), e => e.code === '42501')
  await db.exec("select set_config('gesgrow.pda_solicitud','',false)")
  await cabecerasPda(equipoActual)
  assert.equal((await snapshot()).campaniaId, propio.campaniaId)
  await assert.rejects(call('harvest_obtener_snapshot($1::uuid,$2::varchar)', [propio.campaniaId,'47480378']), /no corresponde/)
  await db.exec('reset role')
  const lote = crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id,tenant_id) values($1,$2,$3)', [lote,propio.campaniaId,T1])
  await db.query("insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values('PDA-SEG-01',$1,$2,$3)", [lote,propio.campaniaId,T1])
  await db.exec('set role anon')
  const id = crypto.randomUUID()
  const asignar = () => call('harvest_asignar_lote_tickets($1::uuid,$2::varchar,$3::varchar,$4::text,$5::uuid)', [propio.campaniaId,'78561234','33445566','PDA-SEG-01',id])
  const primera = await asignar()
  assert.deepEqual(await asignar(), primera)
  await cabecerasPda(null)
  await assert.rejects(asignar(), e => e.code === '42501')
  await db.exec('set role authenticated'); await login('admin')
  await call('pda_configurar_acceso($1::uuid,$2::boolean)', [T1, false])
  await db.exec('set role anon'); await login(null)
  await assert.rejects(snapshot(), e => e.code === '42501')
  await cabecerasPda(equipoActual)
  assert.equal((await snapshot()).campaniaId, propio.campaniaId)
})

test('cada RPC revalida membresía, módulo y revocación aun con cabeceras válidas', async () => {
  const snapshot = () => call('harvest_obtener_snapshot($1::uuid,$2::varchar)', [propio.campaniaId,'78561234'])
  await db.exec('reset role')
  await db.query('update identity_membresias set activo=false where tenant_id=$1 and usuario_id=$2', [T1,cuentas.supervisor.id])
  await db.exec('set role anon'); await login(null); await cabecerasPda(equipoActual)
  await assert.rejects(snapshot(), e => e.code === '42501')
  await db.exec('reset role')
  await db.query('update identity_membresias set activo=true where tenant_id=$1 and usuario_id=$2', [T1,cuentas.supervisor.id])
  await db.exec("update platform_modulos set disponible=false where codigo='HARVEST'")
  await db.exec('set role anon')
  await assert.rejects(snapshot(), e => e.code === '42501')
  await db.exec('reset role')
  await db.exec("update platform_modulos set disponible=true where codigo='HARVEST'")
  await db.exec('set role authenticated'); await login('supervisor')
  await revocar(equipoActual)
  await db.exec('set role anon'); await login(null)
  await assert.rejects(snapshot(), /revocado/)
})

test('el mismo DNI puede operar como supervisor de cuenta en A y legacy en B sin mezclar empresas', async () => {
  await db.exec('reset role')
  await db.query(`insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select m.tenant_id,m.id,r.id from identity_membresias m join identity_roles r
    on r.tenant_id=m.tenant_id and r.codigo='ADMIN_EMPRESA' where m.tenant_id=$1 and m.usuario_id=$2`, [T2,cuentas.ajeno.id])
  await db.query('insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)', [T2,cuentas.ajeno.id])
  await db.exec('set role authenticated'); await login('ajeno')
  await call("platform_solicitar_cambio($1::uuid,$2::uuid,'CREAR_SUSCRIPCION',$3::jsonb,'Prueba multiempresa',null)",
    [crypto.randomUUID(),T2,{planId:'00000000-0000-4000-8000-000000000064',estado:'ACTIVA',hasta:'2099-01-01T00:00:00Z'}])
  const hoy = await call("((clock_timestamp() at time zone 'America/Lima')::date)::text")
  const cultivo = await call('harvest_cultivos_crear($1::uuid,$2::uuid,$3::jsonb)', [T2,crypto.randomUUID(),{
    nombre:'Cultivo transporte B',color:'#3B64EC',variedades:['Ventura'],lotes:[{nombre:'Norte',variedades:['Ventura']}],
    campania:{nombre:'Transporte B',fechaInicio:hoy,fechaFin:hoy}
  }])
  const d = nuevoPda(); await vincular((await generar(T2)).token,d)
  await db.exec('reset role')
  const trabajador = (await db.query("insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'78561234','Legacy','Empresa B',true) returning id", [T2])).rows[0].id
  await db.query('insert into usuarios_app(tenant_id,trabajador_id,activo) values($1,$2,true)', [T2,trabajador])
  await db.query("insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,'SUPERVISORA',true)", [T2,trabajador,cultivo.campaniaId])
  await db.exec('set role anon'); await login(null); await cabecerasPda(null)
  const ingreso = await call('pda_preparar_ingreso_dni($1,$2,$3)', [d.id,d.clave,'78561234'])
  assert.equal(ingreso.contexto.tenantId, T2)
  assert.equal(ingreso.operador.campanias.length, 1)
  assert.equal(ingreso.operador.campanias[0].id, cultivo.campaniaId)
  await cabecerasPda(d)
  assert.equal((await call('validar_operador_campanias($1::varchar)', ['78561234'])).tenant_id, T2)
  await assert.rejects(call('harvest_obtener_snapshot($1::uuid,$2::varchar)', [propio.campaniaId,'78561234']), /otra empresa/)
  await cabecerasPda(null)
})

test('la composición del cliente vigente ingresa por DNI y usa SQL protegido sin alterar UUID ni admitir un equipo revocado', async () => {
  const { crearClientePda } = await import('@gesgrow/harvest-client-contracts/src/infrastructure/supabase/clientePda.js')
  const { crearSupabaseBackend } = await import('@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js')
  const { crearVinculacionDispositivo } = await import('@gesgrow/harvest-client-contracts/src/application/vinculacionDispositivo.js')
  const { protegerBackendDispositivo } = await import('@gesgrow/harvest-client-contracts/src/application/protegerDispositivo.js')
  await db.exec('set role authenticated'); await login('supervisor')
  const d = nuevoPda(); await vincular((await generar()).token,d)
  await login('admin'); await call('pda_configurar_acceso($1::uuid,$2::boolean)',[T1,true])
  await db.exec('reset role')
  const lote = crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id,tenant_id) values($1,$2,$3)',[lote,propio.campaniaId,T1])
  await db.query("insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values('PDA-CLIENTE-01',$1,$2,$3)",[lote,propio.campaniaId,T1])
  await db.exec('set role anon'); await login(null); await cabecerasPda(null)
  let instalacion = { id:d.id,credencial:d.clave,tenantId:T1,estado:'VINCULADO' }
  const dispositivo = crearVinculacionDispositivo({
    remoto: { ingresarConDni: (equipo,dni) => call('pda_preparar_ingreso_dni($1,$2,$3)',[equipo.id,equipo.credencial,dni]) },
    almacen: { obtener:async()=>instalacion,guardar:async(v)=>{instalacion=v} },
    enLinea:()=>true
  })
  await dispositivo.restaurar()
  await dispositivo.iniciarConDni('78561234')
  const enviadas = []
  const transporte = {
    rpc(nombre,parametros) {
      assert.match(nombre,/^[a-z_]+$/)
      const headers = {}
      return {
        setHeader(k,v) { headers[k]=v;return this },
        then(resolve,reject) {
          return (async()=>{
            enviadas.push({nombre,parametros:structuredClone(parametros)})
            await db.query("select set_config('request.headers',$1,false)",[JSON.stringify(headers)])
            try {
              const nombres = Object.keys(parametros)
              for (const k of nombres) assert.match(k,/^p_[a-z_]+$/)
              return {data:await call(nombre+'('+nombres.map((k,i)=>k+' => $'+(i+1)).join(',')+')',Object.values(parametros)),error:null}
            } catch (e) {
              return {data:null,error:{message:e.message,code:e.code}}
            } finally { await cabecerasPda(null) }
          })().then(resolve,reject)
        }
      }
    }
  }
  const campo = protegerBackendDispositivo(crearSupabaseBackend(crearClientePda(transporte,()=>dispositivo.credencialesSolicitud())),dispositivo)
  assert.equal((await campo.obtenerSnapshotHarvest('78561234',propio.campaniaId)).campaniaId,propio.campaniaId)
  const datos = { dniOperador:'78561234',campaniaId:propio.campaniaId,dniCosechador:'33445566',codigoTicket:'PDA-CLIENTE-01',operacionId:crypto.randomUUID() }
  assert.equal((await campo.asignarTicket(datos)).lote.id,lote)
  await campo.asignarTicket(datos)
  assert.equal(enviadas.filter(e=>e.nombre==='harvest_asignar_lote_tickets').length,2)
  assert.ok(enviadas.filter(e=>e.nombre==='harvest_asignar_lote_tickets').every(e=>e.parametros.p_operacion_id===datos.operacionId))
  await db.exec('set role authenticated'); await login('supervisor'); await revocar(d)
  await db.exec('set role anon'); await login(null)
  await assert.rejects(campo.obtenerSnapshotHarvest('78561234',propio.campaniaId),e=>e.accesoDenegado===true)
})
