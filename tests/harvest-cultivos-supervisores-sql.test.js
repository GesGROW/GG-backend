import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, COSECHADOR, JABERO } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const T2 = crypto.randomUUID(),
  cuentas = {}
const M = '202610221000_harvest_cultivos_supervisores.sql'
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sujeto ?? ''
  ])
const catalogo = (tenant = T1) => call('harvest_cultivos_catalogo($1::uuid)', [tenant])
let hoy
const fecha = (dias = 0) =>
  new Date(Date.parse(hoy + 'T12:00:00Z') + dias * 86400000).toISOString().slice(0, 10)
const datosCampania = (inicio = 31, fin = 60) => ({
  nombre: 'Temporada siguiente',
  fechaInicio: fecha(inicio),
  fechaFin: fecha(fin)
})
const paleta = [
  'F92D2D',
  'FF8800',
  '1FD200',
  '137D15',
  '3B64EC',
  '6F1D79',
  'D54E4E',
  'F1E907',
  'ED3BB8',
  'D9D9D9'
]
const datos = () => ({
  nombre: 'Arándanos propios',
  color: '#3b64ec',
  variedades: ['Ventura', 'Biloxi'],
  lotes: [
    { nombre: 'Norte', variedades: ['Ventura', 'Biloxi'] },
    { nombre: 'Sur', variedades: ['Biloxi'] }
  ],
  campania: {
    nombre: 'Temporada actual',
    fechaInicio: fecha(),
    fechaFin: fecha(30)
  }
})
const crear = (data = datos(), op = crypto.randomUUID(), tenant = T1) =>
  call('harvest_cultivos_crear($1::uuid,$2::uuid,$3::jsonb)', [tenant, op, data])
const campania = (cultivo, data = datosCampania(), op = crypto.randomUUID()) =>
  call('harvest_cultivos_campania($1::uuid,$2::uuid,$3::uuid,$4::jsonb)', [
    T1,
    op,
    cultivo,
    data
  ])
const solicitar = (cultivo, tenant = T1) =>
  call('harvest_cultivos_solicitar($1::uuid,$2::uuid)', [tenant, cultivo])
const resolver = (id, aceptar = true, tenant = T1) =>
  call('harvest_cultivos_resolver($1::uuid,$2::uuid,$3::boolean)', [
    tenant,
    id,
    aceptar
  ])
const generar = (id, n = 1) =>
  call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,$4::integer,1)', [
    T1,
    id,
    crypto.randomUUID(),
    n
  ])
const listar = (tipo, id = null) =>
  call('harvest_admin_listar($1::uuid,$2::text,$3::uuid)', [T1, tipo, id])
const obtener = (tipo, id) =>
  call('harvest_admin_obtener($1::uuid,$2::text,$3::text)', [T1, tipo, id])
const counts = async () =>
  (
    await db.query(`select
  (select count(*)::int from cultivos) cultivos, (select count(*)::int from variedades) variedades,
  (select count(*)::int from campanias) campanias, (select count(*)::int from lotes) lotes,
  (select count(*)::int from lote_variedades) asociaciones,
  (select count(*)::int from harvest_cultivos) gestionados,
  (select count(*)::int from harvest_cultivo_supervisores) supervisores,
  (select count(*)::int from harvest_cultivo_operaciones) operaciones`)
  ).rows[0]
const probarReciboHistorico = async (operacion, datosHistoricos, ejecutar) => {
  // Model a receipt acknowledged on a previous day, without changing the
  // server clock or weakening the validator under test.
  const id = crypto.randomUUID()
  const resultado = (
    await db.query(
      `insert into harvest_cultivo_operaciones(id,tenant_id,usuario_id,tipo,datos,resultado)
    select $1,tenant_id,usuario_id,tipo,$3::jsonb,resultado from harvest_cultivo_operaciones where id=$2 returning resultado`,
      [id, operacion, datosHistoricos]
    )
  ).rows[0].resultado
  const antes = await counts()
  assert.deepEqual(await ejecutar(id), resultado)
  await assert.rejects(ejecutar(crypto.randomUUID()), /anterior a hoy/)
  assert.deepEqual(await counts(), antes)
}
const asignarRol = (n, codigo) =>
  db.query(
    `insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
  select $1,m.id,r.id from identity_membresias m cross join identity_roles r
  where m.tenant_id=$1 and r.tenant_id=$1 and m.usuario_id=$2 and r.codigo=$3 on conflict do nothing`,
    [T1, cuentas[n].id, codigo]
  )
let propio,
  ajeno,
  extranjero,
  solicitud,
  opCrear,
  recibo,
  ticket,
  registroId,
  loteConsumido

before(async () => {
  hoy = await call("((clock_timestamp() at time zone 'America/Lima')::date)::text")
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
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
    M,
    '202610221100_harvest_listados_lotes.sql',
    '202610221200_harvest_trabajadores_campania.sql',
    '202610221300_harvest_reportes_campania.sql',
    '20261022230330_harvest_supervisores_participantes.sql',
    '20261023175011_harvest_filtros_tablas_campania.sql'
  ])
    await db.exec(read(n))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Otra empresa','CROP-OTHER')",
    [T2]
  )
  for (const [nombre, rol] of [
    ['ana', 'SUPERVISOR_COSECHA'],
    ['bea', 'SUPERVISOR_COSECHA'],
    ['cora', 'SUPERVISOR_COSECHA'],
    ['owner', 'ADMIN_EMPRESA'],
    ['consulta', 'CONSULTA'],
    ['campo', 'OPERADOR_CAMPO'],
    ['otra', 'SUPERVISOR_COSECHA']
  ]) {
    cuentas[nombre] = { sujeto: crypto.randomUUID() }
    await login(nombre)
    cuentas[nombre].id = (await call('iam_obtener_identidad()')).usuario.id
    await db.query('update identity_usuarios set nombre=$2,email=$3 where id=$1', [
      cuentas[nombre].id,
      nombre,
      nombre + '@test.local'
    ])
    await db.query(
      `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r
      where r.tenant_id=$1 and r.codigo=$3`,
      [nombre === 'otra' ? T2 : T1, cuentas[nombre].id, rol]
    )
  }
  // Provision the other tenant through the actual commercial API.
  await login('owner')
  await db.query(
    `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r
    where r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA'`,
    [T2, cuentas.owner.id]
  )
  await db.query(
    'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
    [T2, cuentas.owner.id]
  )
  await call(
    'platform_solicitar_cambio($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)',
    [
      crypto.randomUUID(),
      T2,
      'CREAR_SUSCRIPCION',
      { planId: '00000000-0000-4000-8000-000000000063' },
      'Prueba local'
    ]
  )
  await login('otra')
  extranjero = await crear(datos(), crypto.randomUUID(), T2)
  await login('bea')
  ajeno = await crear({ ...datos(), nombre: 'Mandarinas Bea' })
  await generar(ajeno.campaniaId)
  await login('ana')
})
after(() => db.close())

const trabajadores = (id, rol, offset = 0, tenant = T1) =>
  call('harvest_admin_trabajadores($1::uuid,$2::uuid,$3::text,$4::integer)', [
    tenant,
    id,
    rol,
    offset
  ])

const reporteCampania = (camp, tipo = 'PRODUCCION', filtros = {}, tenant = T1) =>
  call(
    'harvest_reportes_campania($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::date,$7::date)',
    [
      tenant,
      camp,
      tipo,
      filtros.loteId ?? null,
      filtros.variedadId ?? null,
      filtros.desde ?? null,
      filtros.hasta ?? null
    ]
  )

test('el listado de trabajadores conserva las fechas históricas desconocidas y registra altas futuras', async () => {
  assert.ok(
    (await trabajadores(A, 'COSECHADOR')).filas.every((p) => p.iniciadoEn === null)
  )
  await db.exec(read('202610221200_harvest_trabajadores_campania.sql'))
  await db.exec(read('20261022230330_harvest_supervisores_participantes.sql'))
  assert.ok(
    (await trabajadores(A, 'COSECHADOR')).filas.every((p) => p.iniciadoEn === null)
  )
})

test('crea entidades operativas reales, plantillas, primera campaña y al creador participante; recibo por actor e intención', async () => {
  opCrear = crypto.randomUUID()
  propio = await crear(datos(), opCrear)
  const campaniaAdmin = (await call('harvest_admin_campanias($1::uuid)', [T1])).find(
    (c) => c.id === propio.campaniaId
  )
  assert.ok(Object.hasOwn(campaniaAdmin, 'cutover'))
  assert.equal(campaniaAdmin.cutover, null)
  assert.equal(
    await call('(select count(*)::int from harvest_cutovers where campania_id=$1)', [
      propio.campaniaId
    ]),
    0
  )
  const antes = await counts()
  assert.deepEqual(await crear(datos(), opCrear), propio)
  assert.deepEqual(await counts(), antes)
  await assert.rejects(crear({ ...datos(), color: '#000000' }, opCrear), /reutilizado/)
  const c = await catalogo()
  assert.equal(c.propios.length, 1)
  assert.equal(c.propios[0].id, propio.cultivoId)
  assert.equal(c.propios[0].color, '#3B64EC')
  assert.deepEqual(
    c.propios[0].variedades.map((v) => v.nombre),
    ['Biloxi', 'Ventura']
  )
  assert.deepEqual(
    c.propios[0].lotes.map((l) => l.variedades.map((v) => v.nombre)),
    [['Biloxi', 'Ventura'], ['Biloxi']]
  )
  assert.deepEqual(c.propios[0].supervisores, [
    { id: cuentas.ana.id, nombre: 'ana', email: 'ana@test.local' }
  ])
  assert.equal(c.propios[0].campanias[0].id, propio.campaniaId)
  assert.equal(c.propios[0].campanias[0].fechaInicio, fecha())
  assert.equal(c.disponibles.length, 1)
  assert.equal(c.disponibles[0].solicitudEstado, null)
  assert.ok(!JSON.stringify(c).includes(extranjero.cultivoId))
  const actual = (
    await db.query(
      `select c.tenant_id,c.cultivo_id,c.estado,l.nombre,l.variedad_id,
    array_agg(v.nombre order by v.nombre) variedades from campanias c join lotes l on l.campania_id=c.id
    join lote_variedades lv on lv.lote_id=l.id join variedades v on v.id=lv.variedad_id where c.id=$1
    group by c.id,l.id order by l.nombre`,
      [propio.campaniaId]
    )
  ).rows
  assert.equal(actual.length, 2)
  assert.equal(actual[0].tenant_id, T1)
  assert.equal(actual[0].cultivo_id, propio.cultivoId)
  assert.deepEqual(actual[0].variedades, ['Biloxi', 'Ventura'])
  assert.ok(actual[0].variedad_id)
  const historicos = { ...datos(), campania: datosCampania(-2, -1) }
  await probarReciboHistorico(opCrear, historicos, (id) => crear(historicos, id))
  recibo = await generar(propio.campaniaId, 2)
  ticket = (
    await db.query(
      'select codigo from harvest_tickets where campania_id=$1 order by codigo',
      [propio.campaniaId]
    )
  ).rows[0].codigo
  await login('bea')
  await assert.rejects(crear(datos(), opCrear), /reutilizado/)
  await login('ana')
})

test('valida formas, fechas, nombres, variedades por lote y dupes; cada rechazo deja la base intacta', async () => {
  const invalidos = [
    null,
    [],
    {},
    { ...datos(), nombre: '' },
    { ...datos(), color: 'red' },
    { ...datos(), color: '#4D67A1' },
    { ...datos(), color: '#000000' },
    { ...datos(), color: '#FFFFFF' },
    { ...datos(), color: '3B64EC' },
    { ...datos(), variedades: [] },
    { ...datos(), variedades: ['A', ' a '] },
    { ...datos(), variedades: [null] },
    { ...datos(), lotes: [] },
    { ...datos(), lotes: [null] },
    { ...datos(), lotes: [{ nombre: 'Norte', variedades: [] }] },
    { ...datos(), lotes: [{ nombre: 'Norte', variedades: ['Desconocida'] }] },
    { ...datos(), lotes: [{ nombre: 'Norte', variedades: ['Ventura', ' ventura '] }] },
    {
      ...datos(),
      lotes: [
        { nombre: 'Norte', variedades: ['Ventura'] },
        { nombre: ' norte ', variedades: ['Biloxi'] }
      ]
    },
    {
      ...datos(),
      campania: { ...datosCampania(), fechaInicio: hoy.slice(0, 4) + '-02-30' }
    },
    {
      ...datos(),
      campania: datosCampania(1, 0)
    },
    { ...datos(), campania: datosCampania(-1, 30) },
    ...[undefined, null, '', 'not-a-date', 1, [], {}].map((fechaFin) => ({
      ...datos(),
      campania: { ...datosCampania(), fechaFin }
    })),
    {
      ...datos(),
      campania: { ...datosCampania(), fechaFin: hoy.slice(0, 4) + '-02-30' }
    }
  ]
  const antes = await counts()
  for (const d of invalidos) {
    await assert.rejects(crear(d))
    assert.deepEqual(await counts(), antes)
  }
  // Check every allowed color through the actual RPC, including normalization.
  // Roll back successful probes so later membership/list assertions stay small.
  for (const color of paleta) {
    await db.exec('begin')
    try {
      const creado = await crear({
        ...datos(),
        color: '#' + color.toLowerCase(),
        campania: datosCampania(1, 1)
      })
      const propio = (await catalogo()).propios.find((c) => c.id === creado.cultivoId)
      assert.equal(propio.color, '#' + color)
      assert.equal(propio.campanias[0].fechaInicio, fecha(1))
      assert.equal(propio.campanias[0].fechaFin, fecha(1))
      await assert.rejects(
        db.query('update harvest_cultivos set color=$2 where id=$1', [
          creado.cultivoId,
          '#000000'
        ]),
        /check constraint/
      )
    } finally {
      await db.exec('rollback')
    }
  }
  assert.deepEqual(await counts(), antes)
  await db.exec("set time zone 'Pacific/Kiritimati'; begin")
  try {
    const creado = await crear({ ...datos(), campania: datosCampania(0, 0) })
    assert.equal(
      (await catalogo()).propios.find((c) => c.id === creado.cultivoId).campanias[0]
        .fechaInicio,
      fecha()
    )
  } finally {
    await db.exec("rollback; set time zone 'UTC'")
  }
  assert.deepEqual(await counts(), antes)
})

test('campaña creada funciona con los RPC Identity reales de sesión, asignación y cosecha; dueño obtiene producción', async () => {
  await asignarRol('ana', 'GESTOR')
  await call('iam_activar_harvest($1::uuid)', [propio.campaniaId])
  const campaniaAdmin = (await call('harvest_admin_campanias($1::uuid)', [T1])).find(
    (c) => c.id === propio.campaniaId
  )
  assert.equal(campaniaAdmin.cutover.campaniaId, propio.campaniaId)
  assert.equal(campaniaAdmin.cutover.version, 1)
  assert.ok(campaniaAdmin.cutover.activadoEn)
  const lote = (
    await db.query(
      'select id,variedad_id from lotes where campania_id=$1 order by codigo limit 1',
      [propio.campaniaId]
    )
  ).rows[0]
  const trabajador = (
    await db.query(
      `insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,$2,'Cosechador','Prueba',true)
    on conflict(tenant_id,dni) do update set activo=true returning id`,
      [T1, COSECHADOR]
    )
  ).rows[0].id
  const rol = (
    await db.query(
      `insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo,fecha_asignacion_jabero)
    select $1,id,$2,'JABERO',true,(clock_timestamp() at time zone 'America/Lima')::date from trabajadores where tenant_id=$1 and dni=$3 returning id`,
      [T1, propio.campaniaId, JABERO]
    )
  ).rows[0].id
  const sesion = crypto.randomUUID()
  await call(
    'iam_iniciar_sesion_lectura($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)',
    [propio.campaniaId, lote.id, lote.variedad_id, rol, sesion]
  )
  const asignacion = await call(
    'iam_asignar_lote($1::uuid,$2::uuid,$3::text,$4::uuid)',
    [propio.campaniaId, trabajador, ticket, crypto.randomUUID()]
  )
  loteConsumido = asignacion.lote.id
  registroId = crypto.randomUUID()
  await call(
    'iam_registrar_cosecha($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::timestamptz)',
    [
      propio.campaniaId,
      sesion,
      ticket,
      registroId,
      crypto.randomUUID(),
      new Date().toISOString()
    ]
  )
  assert.equal((await obtener('registros', registroId)).id, registroId)
  assert.equal((await obtener('asignaciones', loteConsumido)).id, loteConsumido)
  const reporte = await call("harvest_reportes_obtener($1::uuid,$2::uuid,'RESUMEN')", [
    T1,
    propio.campaniaId
  ])
  assert.equal(reporte.datos.resumen.total_jabas, 1)
})

test('fallo tardío revierte cultivo, pertenencia, variedades, plantillas, campaña, lotes y recibo; reintento funciona', async () => {
  const antes = await counts(),
    op = crypto.randomUUID()
  await db.exec(`create function prueba_cultivo_fallo() returns trigger language plpgsql as $$ begin
    if new.nombre='Sur' then raise exception 'Fallo tardío de prueba'; end if; return new; end $$;
    create trigger prueba_cultivo_fallo before insert on lotes for each row execute function prueba_cultivo_fallo();`)
  await assert.rejects(crear(datos(), op), /Fallo tardío/)
  assert.deepEqual(await counts(), antes)
  await db.exec(
    'drop trigger prueba_cultivo_fallo on lotes; drop function prueba_cultivo_fallo()'
  )
  assert.ok((await crear({ ...datos(), nombre: 'Reintento' }, op)).cultivoId)
})

test('descubre solamente el tenant; solicitud PENDING idempotente no concede lectura; terceros y solicitante no resuelven', async () => {
  await login('bea')
  solicitud = await solicitar(propio.cultivoId)
  assert.equal(solicitud.estado, 'PENDING')
  assert.deepEqual(await solicitar(propio.cultivoId), solicitud)
  assert.equal(
    (await catalogo()).disponibles.find((c) => c.id === propio.cultivoId)
      .solicitudEstado,
    'PENDING'
  )
  await assert.rejects(resolver(solicitud.id), /participante/)
  await assert.rejects(generar(propio.campaniaId), /participación/)
  await assert.rejects(campania(propio.cultivoId), /participante/)
  await assert.rejects(solicitar(extranjero.cultivoId), /otra empresa/)
  await assert.rejects(catalogo(T2), /no autorizada/)
  await login('cora')
  await assert.rejects(resolver(solicitud.id, false), /participante/)
  assert.ok(!(await catalogo()).solicitudes.some((s) => s.id === solicitud.id))
  await login('otra')
  await assert.rejects(resolver(solicitud.id, true, T2), /otra empresa/)
  await login('owner')
  await assert.rejects(resolver(solicitud.id), /denegado/)
  await login('ana')
  assert.deepEqual(
    (await catalogo()).solicitudes.find((s) => s.id === solicitud.id),
    solicitud
  )
})

test('filtros y guardas de campañas admin/report/IAM y obtención por lote/ticket excluyen otros cultivos, mantienen legacy', async () => {
  await login('bea')
  for (const rpc of [
    'harvest_admin_campanias',
    'harvest_reportes_campanias',
    'iam_listar_campanias'
  ]) {
    const cs = await call(`${rpc}($1::uuid)`, [T1])
    assert.ok(
      cs.some((c) => c.id === A),
      rpc + ' legacy'
    )
    assert.ok(
      cs.some((c) => c.id === ajeno.campaniaId),
      rpc + ' propio'
    )
    assert.ok(!cs.some((c) => c.id === propio.campaniaId), rpc + ' ajeno')
  }
  assert.equal((await listar('tickets', ajeno.campaniaId)).total, 1)
  assert.equal((await listar('tickets')).total, 1)
  assert.equal((await listar('asignaciones')).total, 0)
  assert.equal((await listar('registros')).total, 0)
  assert.deepEqual(
    (await call('harvest_admin_filtros($1::uuid)', [T1])).trabajadores,
    []
  )
  await assert.rejects(listar('tickets', propio.campaniaId), /participación/)
  await assert.rejects(obtener('lotes', recibo.lotes[0].id), /inexistente/)
  await assert.rejects(obtener('tickets', ticket), /inexistente/)
  await assert.rejects(obtener('asignaciones', loteConsumido), /inexistente/)
  await assert.rejects(obtener('registros', registroId), /inexistente/)
  await assert.rejects(
    call("harvest_reportes_obtener($1::uuid,$2::uuid,'RESUMEN')", [
      T1,
      propio.campaniaId
    ]),
    /participación/
  )
  await assert.rejects(
    call("iam_obtener_reporte($1::uuid,'RESUMEN')", [propio.campaniaId]),
    /participación/
  )
  await assert.rejects(
    call('iam_recursos_campania($1::uuid)', [propio.campaniaId]),
    /participación|denegado/
  )
  await assert.rejects(
    call('iam_consultar_ticket($1::uuid,$2::text)', [propio.campaniaId, ticket]),
    /participación/
  )
  assert.ok(await call('harvest_reportes_validar($1::uuid,$2::uuid)', [T1, A]))
  await login('ana')
})

test('otros permisos de Campaign no saltan participación: catálogo, paginación, UUID y escrituras de campaña/variedad', async () => {
  await asignarRol('cora', 'GESTOR')
  await login('cora')
  const lista = await call('campaign_admin_listar($1::uuid)', [T1])
  assert.equal(lista.total, 2)
  assert.ok(
    lista.campanias.every(
      (c) => c.id !== propio.campaniaId && c.id !== ajeno.campaniaId
    )
  )
  const cultivos = await call('campaign_admin_cultivos($1::uuid)', [T1])
  assert.ok(
    !cultivos.some((c) => c.id === propio.cultivoId || c.id === ajeno.cultivoId)
  )
  await assert.rejects(
    call('campaign_admin_obtener($1::uuid,$2::uuid)', [T1, propio.campaniaId]),
    /participación/
  )
  await assert.rejects(
    call('campaign_admin_lotes($1::uuid,$2::uuid)', [T1, propio.campaniaId]),
    /participación/
  )
  await assert.rejects(
    call("iam_guardar_campania($1::uuid,null,'BYPASS','Bypass',$2::uuid,'CERRADA')", [
      T1,
      propio.cultivoId
    ]),
    /participante/
  )
  await assert.rejects(
    call(
      "campaign_admin_crear($1::uuid,'BYPASS','Bypass',$2::uuid,'2030-01-01'::date,null,'CERRADA')",
      [T1, propio.cultivoId]
    ),
    /participante/
  )
  await assert.rejects(
    db.query(
      "insert into variedades(tenant_id,cultivo_id,nombre) values($1,$2,'Bypass')",
      [T1, propio.cultivoId]
    ),
    /participante/
  )
  await login('ana')
  assert.equal(
    (await call('campaign_admin_obtener($1::uuid,$2::uuid)', [T1, propio.campaniaId]))
      .id,
    propio.campaniaId
  )
})

test('rechazo definitivo no agrega membresía; solo participante aprueba, aprobación repetible habilita campañas y lecturas', async () => {
  await login('cora')
  const rechazada = await solicitar(propio.cultivoId)
  await login('ana')
  assert.equal((await resolver(rechazada.id, false)).estado, 'REJECTED')
  await assert.rejects(resolver(rechazada.id, true), /otra decisión/)
  assert.equal((await resolver(solicitud.id)).estado, 'APPROVED')
  assert.equal((await resolver(solicitud.id)).estado, 'APPROVED')
  assert.equal((await catalogo()).solicitudes.length, 0)
  await login('cora')
  assert.equal((await solicitar(propio.cultivoId)).estado, 'REJECTED')
  await assert.rejects(generar(propio.campaniaId), /participación/)
  await login('bea')
  assert.ok((await catalogo()).propios.some((c) => c.id === propio.cultivoId))
  assert.equal((await obtener('tickets', ticket)).codigo, ticket)
  assert.equal((await obtener('registros', registroId)).id, registroId)
  await assert.rejects(solicitar(propio.cultivoId), /Ya es supervisor/)
  // A newly approved participant can review another supervisor's request.
  await login('ana')
  const request = await solicitar(ajeno.cultivoId)
  await login('bea')
  assert.equal((await resolver(request.id)).estado, 'APPROVED')
  await login('ana')
})

test('conflicto activo es accionable y no cambia nada; tras cierre nueva campaña reutiliza plantillas con recibo atómico', async () => {
  const op = crypto.randomUUID(),
    antes = await counts()
  await assert.rejects(
    campania(propio.cultivoId, undefined, op),
    /Cierre la campaña activa/
  )
  assert.deepEqual(await counts(), antes)
  assert.equal(
    (await db.query('select estado from campanias where id=$1', [propio.campaniaId]))
      .rows[0].estado,
    'ACTIVA'
  )
  // Existing campaign lifecycle closes the current campaign explicitly.
  await db.query("update campanias set estado='CERRADA' where id=$1", [
    propio.campaniaId
  ])
  const next = await campania(propio.cultivoId, undefined, op)
  assert.notEqual(next.campaniaId, propio.campaniaId)
  const campaniasAdmin = await call('harvest_admin_campanias($1::uuid)', [T1])
  assert.equal(campaniasAdmin.find((c) => c.id === next.campaniaId).cutover, null)
  assert.equal(
    campaniasAdmin.find((c) => c.id === propio.campaniaId).cutover.version,
    1
  )
  assert.deepEqual(await campania(propio.cultivoId, undefined, op), next)
  const despues = await counts()
  assert.equal(despues.variedades, antes.variedades)
  assert.equal(despues.lotes, antes.lotes + 2)
  const campañas = (
    await db.query(
      'select id,estado,fecha_fin::text from campanias where cultivo_id=$1 order by fecha_inicio',
      [propio.cultivoId]
    )
  ).rows
  assert.deepEqual(
    campañas.map((c) => c.estado),
    ['CERRADA', 'ACTIVA']
  )
  assert.equal(campañas[0].fecha_fin, fecha(30))
  const old = (
    await db.query('select id,variedad_id from lotes where campania_id=$1', [
      propio.campaniaId
    ])
  ).rows
  const nuevo = (
    await db.query('select id,variedad_id from lotes where campania_id=$1', [
      next.campaniaId
    ])
  ).rows
  assert.ok(nuevo.every((l) => !old.some((o) => o.id === l.id)))
  assert.deepEqual(
    nuevo.map((l) => l.variedad_id).sort(),
    old.map((l) => l.variedad_id).sort()
  )
  await assert.rejects(
    campania(propio.cultivoId, { ...datosCampania(61, 90), nombre: 'Cambio' }, op),
    /reutilizado/
  )
  await assert.rejects(campania(propio.cultivoId), /Cierre la campaña activa/)
  await db.query("update campanias set estado='CERRADA' where id=$1", [next.campaniaId])
  for (const data of [
    datosCampania(-1, 30),
    datosCampania(1, 0),
    { ...datosCampania(), fechaFin: null },
    { nombre: 'Sin fin', fechaInicio: fecha() }
  ]) {
    await assert.rejects(campania(propio.cultivoId, data), /anterior|obligatorios/)
    assert.deepEqual(await counts(), despues)
  }
  await db.exec(`create function prueba_campania_fallo() returns trigger language plpgsql as $$ begin raise exception 'Fallo campaña'; end $$;
    create trigger prueba_campania_fallo before insert on lotes for each row execute function prueba_campania_fallo();`)
  await assert.rejects(
    campania(propio.cultivoId, datosCampania(61, 90)),
    /Fallo campaña/
  )
  await db.exec(
    'drop trigger prueba_campania_fallo on lotes; drop function prueba_campania_fallo()'
  )
  assert.deepEqual(await counts(), despues)
  assert.equal(
    (await db.query('select estado from campanias where id=$1', [next.campaniaId]))
      .rows[0].estado,
    'CERRADA'
  )
  const historicos = datosCampania(-2, -1)
  await probarReciboHistorico(
    op,
    { cultivoId: propio.cultivoId, datos: historicos },
    (id) => campania(propio.cultivoId, historicos, id)
  )
})

test('owner conserva reportes globales de empresa, sin acceso operativo a cultivos gestionados', async () => {
  await login('owner')
  for (const rpc of ['harvest_reportes_campanias', 'iam_listar_campanias']) {
    const cs = await call(`${rpc}($1::uuid)`, [T1])
    assert.ok(cs.some((c) => c.id === propio.campaniaId))
    assert.ok(cs.some((c) => c.id === ajeno.campaniaId))
    assert.ok(!cs.some((c) => c.id === extranjero.campaniaId))
  }
  assert.equal(
    (
      await call("harvest_reportes_obtener($1::uuid,$2::uuid,'DASHBOARD')", [
        T1,
        propio.campaniaId
      ])
    ).datos.resumen.total_jabas,
    1
  )
  assert.ok(await call("iam_obtener_reporte($1::uuid,'RESUMEN')", [propio.campaniaId]))
  await assert.rejects(catalogo(), /denegado/)
  await assert.rejects(generar(propio.campaniaId), /participación/)
  await assert.rejects(
    call('iam_recursos_campania($1::uuid)', [propio.campaniaId]),
    /participación|denegado/
  )
  await login('ana')
})

test('owner sin operación, consulta, campo, anónimo y membresía inactiva no administran cultivos', async () => {
  for (const n of ['owner', 'consulta', 'campo', 'anon']) {
    await login(n)
    await assert.rejects(catalogo(), /denegado|autenticada/)
    await assert.rejects(crear(), /denegado|autenticada/)
    await assert.rejects(solicitar(propio.cultivoId), /denegado|autenticada/)
  }
  await login('bea')
  await db.query(
    'update identity_membresias set activo=false where tenant_id=$1 and usuario_id=$2',
    [T1, cuentas.bea.id]
  )
  await assert.rejects(catalogo(), /inactiva/)
  assert.equal(
    await call('harvest_cultivos_puede_campania($1::uuid,$2::uuid)', [
      T1,
      propio.campaniaId
    ]),
    false
  )
  await db.query(
    'update identity_membresias set activo=true where tenant_id=$1 and usuario_id=$2',
    [T1, cuentas.bea.id]
  )
  await db.query(
    `delete from identity_membresia_roles mr using identity_membresias m,identity_roles r
    where m.tenant_id=$1 and m.usuario_id=$2 and mr.tenant_id=m.tenant_id and mr.membresia_id=m.id
      and r.tenant_id=mr.tenant_id and r.id=mr.rol_id and r.codigo='SUPERVISOR_COSECHA'`,
    [T1, cuentas.bea.id]
  )
  await assert.rejects(catalogo(), /denegado/)
  assert.equal(
    await call('harvest_cultivos_puede_campania($1::uuid,$2::uuid)', [
      T1,
      propio.campaniaId
    ]),
    false
  )
  await asignarRol('bea', 'SUPERVISOR_COSECHA')
  await login('ana')
})

test('ownership compuesto rechaza referencias cross-tenant aun con SQL privilegiado', async () => {
  await assert.rejects(
    db.query(
      `insert into campanias(tenant_id,codigo,nombre,cultivo_id,estado)
    values($1,'CROSS','Cross',$2,'CERRADA')`,
      [T2, propio.cultivoId]
    ),
    /otra empresa/
  )
  await assert.rejects(
    db.query(
      "insert into variedades(tenant_id,cultivo_id,nombre) values($1,$2,'Cross')",
      [T2, propio.cultivoId]
    ),
    /otra empresa/
  )
  await assert.rejects(
    db.query(
      'insert into harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) values($1,$2,$3)',
      [T2, propio.cultivoId, cuentas.otra.id]
    ),
    /foreign key/
  )
  const l = (
    await db.query('select id from harvest_cultivo_lotes where cultivo_id=$1 limit 1', [
      propio.cultivoId
    ])
  ).rows[0].id
  const v = (
    await db.query('select id from variedades where cultivo_id=$1 limit 1', [
      ajeno.cultivoId
    ])
  ).rows[0].id
  await assert.rejects(
    db.query('insert into harvest_cultivo_lote_variedades values($1,$2,$3,$4)', [
      T1,
      propio.cultivoId,
      l,
      v
    ]),
    /foreign key/
  )
})

test('RLS intersecta políticas permisivas: lectura directa no evade participación, y legacy conserva visibilidad', async () => {
  // Model pre-existing deployment SELECT grants and permissive policies. The
  // migration must intersect them rather than relying on UI/RPC filtering.
  for (const t of [
    'cultivos',
    'variedades',
    'campanias',
    'lotes',
    'lote_variedades',
    'harvest_lotes_tickets',
    'harvest_tickets',
    'harvest_asignaciones_lote',
    'harvest_registros_cosecha',
    'sesiones_lectura'
  ]) {
    assert.equal(
      await call('(select relrowsecurity from pg_class where oid=$1::regclass)', [
        'public.' + t
      ]),
      true
    )
    await db.exec(`grant select on public.${t} to authenticated;
      create policy prueba_lectura on public.${t} for select to authenticated using(true)`)
  }
  await login('cora')
  await db.exec('set role authenticated')
  try {
    assert.equal(
      (await db.query('select id from campanias where id=$1', [propio.campaniaId])).rows
        .length,
      0
    )
    assert.equal(
      (await db.query('select id from campanias where id=$1', [A])).rows.length,
      1
    )
    assert.equal(
      (await db.query('select id from cultivos where id=$1', [propio.cultivoId])).rows
        .length,
      0
    )
    assert.equal(
      (
        await db.query('select id from variedades where cultivo_id=$1', [
          propio.cultivoId
        ])
      ).rows.length,
      0
    )
    assert.equal(
      (await db.query('select id from lotes where campania_id=$1', [propio.campaniaId]))
        .rows.length,
      0
    )
    assert.equal(
      (
        await db.query('select codigo from harvest_tickets where campania_id=$1', [
          propio.campaniaId
        ])
      ).rows.length,
      0
    )
    assert.equal(
      (
        await db.query('select id from harvest_registros_cosecha where id=$1', [
          registroId
        ])
      ).rows.length,
      0
    )
    assert.equal(
      (
        await db.query(
          'select lote_id from harvest_asignaciones_lote where lote_id=$1',
          [loteConsumido]
        )
      ).rows.length,
      0
    )
    assert.equal(
      (
        await db.query('select id from sesiones_lectura where identity_usuario_id=$1', [
          cuentas.ana.id
        ])
      ).rows.length,
      0
    )
    assert.equal((await db.query('select * from lote_variedades')).rows.length, 2) // two legacy lots
    await assert.rejects(
      db.query('select * from harvest_cultivo_solicitudes'),
      /permission denied/
    )
    await assert.rejects(
      call('harvest_cultivos_dto($1::uuid,$2::uuid)', [T1, propio.cultivoId]),
      /permission denied/
    )
    await assert.rejects(
      db.query('insert into harvest_cultivo_supervisores values($1,$2,$3)', [
        T1,
        propio.cultivoId,
        cuentas.cora.id
      ]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  await login('ana')
  await db.exec('set role authenticated')
  try {
    assert.equal(
      (await db.query('select id from campanias where id=$1', [propio.campaniaId])).rows
        .length,
      1
    )
    assert.equal(
      (
        await db.query('select codigo from harvest_tickets where campania_id=$1', [
          propio.campaniaId
        ])
      ).rows.length,
      2
    )
    assert.equal(
      (
        await db.query('select id from harvest_registros_cosecha where id=$1', [
          registroId
        ])
      ).rows.length,
      1
    )
    assert.ok(await catalogo())
  } finally {
    await db.exec('reset role')
  }
})

test('capacidad HARVEST se exige aun a participantes y ACL no exponen helpers de mutación', async () => {
  await db.query("update platform_modulos set disponible=false where codigo='HARVEST'")
  try {
    await assert.rejects(catalogo(), /módulo|Modulo|Módulo/)
    await assert.rejects(crear(), /módulo|Modulo|Módulo/)
    await assert.rejects(campania(propio.cultivoId), /módulo|Modulo|Módulo/)
    assert.equal(
      await call('harvest_cultivos_puede_campania($1::uuid,$2::uuid)', [
        T1,
        propio.campaniaId
      ]),
      false
    )
  } finally {
    await db.query("update platform_modulos set disponible=true where codigo='HARVEST'")
  }
  for (const rol of ['anon', 'service_role']) {
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_cultivos_crear(uuid,uuid,jsonb)','EXECUTE')",
        [rol]
      ),
      false
    )
  }
  assert.equal(
    await call(
      "has_function_privilege('authenticated','harvest_cultivos_materializar_campania(uuid,uuid,jsonb)','EXECUTE')"
    ),
    false
  )
})

let lecturaPropia, lecturaAjena
test('trabajadores se filtran por campaña y función sin perder inactivos; paginación antes de devolver filas', async () => {
  await login('bea')
  lecturaAjena = await crear({ ...datos(), nombre: 'Lectura privada Bea' })
  await login('ana')
  lecturaPropia = await crear({ ...datos(), nombre: 'Lectura privada Ana' })
  const propia = lecturaPropia.campaniaId
  const trabajador = await call(
    '(select id from trabajadores where tenant_id=$1 and dni=$2)',
    [T1, COSECHADOR]
  )
  await db.query(
    `insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo)
    values($1,$2,$3,'COSECHADOR',false),($1,$2,$3,'JABERO',true)`,
    [T1, trabajador, propia]
  )
  const filas = (await trabajadores(propia, 'COSECHADOR')).filas
  assert.equal(filas.length, 1)
  assert.equal(filas[0].dni, COSECHADOR)
  assert.equal(filas[0].activo, false)
  assert.ok(Date.parse(filas[0].iniciadoEn) > Date.now() - 60000)
  const jaberos = await trabajadores(propia, 'JABERO')
  assert.equal(jaberos.total, 1)
  assert.equal(jaberos.filas[0].activo, true)
  assert.equal(
    await trabajadores(lecturaAjena.campaniaId, 'COSECHADOR').catch(() => null),
    null
  )
  assert.equal((await trabajadores(propia, 'COSECHADOR', 50)).filas.length, 0)
  for (const [rol, offset] of [
    ['ADMIN', 0],
    ['JABERO', -1],
    [null, 0]
  ])
    await assert.rejects(trabajadores(propia, rol, offset), /inválida/)
  // Más de una página: comprobar total real y filas distintas, sin exigir Personal.
  await db.query(
    `with nuevos as (
    insert into trabajadores(tenant_id,dni,nombres,apellidos,activo)
    select $1,'77'||lpad(n::text,6,'0'),'Cosechador '||n,'Prueba',true from generate_series(1,51) n returning id
  ) insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo)
    select $1,id,$2,'COSECHADOR',true from nuevos`,
    [T1, propia]
  )
  const primera = await trabajadores(propia, 'COSECHADOR')
  const segunda = await trabajadores(propia, 'COSECHADOR', 50)
  assert.equal(primera.total, 52)
  assert.equal(primera.filas.length, 50)
  assert.equal(segunda.filas.length, 2)
  assert.equal(new Set([...primera.filas, ...segunda.filas].map((p) => p.id)).size, 52)
})

test('supervisores incluye participantes del cultivo sin crear trabajadores y combina operativos sin duplicarlos', async () => {
  await login('ana')
  await db.query(
    'insert into harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) values($1,$2,$3)',
    [T1, lecturaPropia.cultivoId, cuentas.cora.id]
  )
  const inicial = await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA')
  assert.equal(inicial.total, 2)
  const cora = inicial.filas.find((p) => p.id === cuentas.cora.id)
  assert.equal(cora.nombre, 'cora')
  assert.equal(cora.dni, null)
  assert.equal(cora.activo, true)
  assert.ok(cora.iniciadoEn)
  const persona = await call(
    '(select id from trabajadores where tenant_id=$1 and dni=$2)',
    [T1, COSECHADOR]
  )
  await db.query(
    `insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo)
    values($1,$2,$3,'SUPERVISORA',true)`,
    [T1, persona, lecturaPropia.campaniaId]
  )
  const original = await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA')
  assert.equal(original.total, 3)
  const operativo = original.filas.find((p) => p.dni === COSECHADOR)
  assert.equal(operativo.activo, true)
  assert.ok(operativo.iniciadoEn)
  await db.query('update trabajadores set activo=false where id=$1', [persona])
  try {
    const actual = await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA')
    assert.equal(actual.total, 3)
    assert.equal(actual.filas.find((p) => p.dni === COSECHADOR).activo, false)
  } finally {
    await db.query('update trabajadores set activo=true where id=$1', [persona])
  }
  await db.query('update identity_membresias set trabajador_id=$3 where tenant_id=$1 and usuario_id=$2',
    [T1, cuentas.cora.id, persona])
  try {
    const unidos = await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA')
    assert.equal(unidos.total, 2)
    assert.equal(unidos.filas.filter((p) => p.dni === COSECHADOR).length, 1)
    assert.equal(unidos.filas.find((p) => p.id === cuentas.cora.id).dni, COSECHADOR)
    await db.query('update identity_membresias set activo=false where tenant_id=$1 and usuario_id=$2',
      [T1, cuentas.cora.id])
    assert.equal((await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA')).filas.find((p) => p.id === cuentas.cora.id).activo, false)
  } finally {
    await db.query('update identity_membresias set activo=true,trabajador_id=null where tenant_id=$1 and usuario_id=$2',
      [T1, cuentas.cora.id])
  }
  await login('bea')
  await assert.rejects(trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA'), /participación|denegad/)
  await login('ana')
  assert.equal((await trabajadores(lecturaAjena.campaniaId, 'SUPERVISORA').catch(() => null)), null)
  assert.equal((await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA', 50)).total, 3)
  assert.equal((await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA', 50)).filas.length, 0)
})

test('reportes nuevos mantienen hechos admitidos, filtros coherentes y catálogo aun sin producción', async () => {
  await login('ana')
  await db.exec(read('202610221300_harvest_reportes_campania.sql'))
  const r = await reporteCampania(propio.campaniaId)
  const total = await call(
    '(select count(*)::int from harvest_produccion_reportable where campania_id=$1)',
    [propio.campaniaId]
  )
  assert.ok(total > 0)
  assert.equal(r.datos.metricas.totalJabas, total)
  assert.equal(
    r.datos.evolucion.reduce((n, p) => n + p.jabas, 0),
    total
  )
  assert.equal(
    r.datos.ranking.reduce((n, p) => n + p.jabas, 0),
    total
  )
  assert.ok(r.datos.catalogo.lotes.length)
  const lote = r.datos.catalogo.lotes[0]
  assert.equal(
    (await reporteCampania(propio.campaniaId, 'PRODUCCION', { loteId: lote.id })).datos
      .metricas.totalJabas,
    total
  )
  assert.equal(
    (
      await reporteCampania(propio.campaniaId, 'PRODUCCION', {
        variedadId: lote.variedades[0]
      })
    ).datos.metricas.totalJabas,
    total
  )
  const vacio = (await reporteCampania(lecturaPropia.campaniaId)).datos
  assert.equal(vacio.metricas.totalJabas, 0)
  assert.equal(vacio.metricas.promedioDiario, 0)
  assert.equal(vacio.metricas.mayorRendimiento, 0)
  assert.deepEqual(vacio.ranking, [])
  assert.ok(vacio.catalogo.lotes.length)
  assert.ok(vacio.catalogo.variedades.length)
  const actual = (await reporteCampania(propio.campaniaId, 'RENDIMIENTO')).datos
  assert.equal(actual.desde, hoy)
  assert.equal(actual.hasta, hoy)
  assert.equal(actual.evolucion.length, 1)
})

test('reportes filtran por día Lima, conservan ceros y orden de empates sin descartar trabajadores inactivos', async () => {
  await login('ana')
  // Campaña legacy de fixture: sus hechos son reportables sin tocar las tablas Harvest inmutables.
  const s = (
    await db.query(
      `select s.id,l.id lote_id,l.variedad_id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1 limit 1`,
      [A]
    )
  ).rows[0]
  const ids = []
  for (const [dni, nombre] of [
    ['88990001', 'Alfa'],
    ['88990002', 'Beta']
  ]) {
    const t = (
      await db.query(
        "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,$2,$3,'Prueba',true) returning id",
        [T1, dni, nombre]
      )
    ).rows[0].id
    const rol = (
      await db.query(
        "insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,'COSECHADOR',true) returning id",
        [T1, t, A]
      )
    ).rows[0].id
    const a = (
      await db.query(
        'insert into asignaciones_ticket(tenant_id,campania_id,cosechador_rol_id,codigo_ticket) values($1,$2,$3,$4) returning id',
        [T1, A, rol, crypto.randomUUID()]
      )
    ).rows[0].id
    ids.push(t)
    await db.query(
      "insert into lecturas_jaba(id,tenant_id,asignacion_ticket_id,sesion_id,fecha_hora) values($1,$2,$3,$4,$5::date::timestamp at time zone 'America/Lima')",
      [crypto.randomUUID(), T1, a, s.id, fecha(-2)]
    )
  }
  await db.query('update trabajadores set activo=false where id=$1', [ids[1]])
  const d = (
    await reporteCampania(A, 'RENDIMIENTO', {
      desde: fecha(-3),
      hasta: fecha(-1),
      loteId: s.lote_id,
      variedadId: s.variedad_id
    })
  ).datos
  assert.equal(d.metricas.totalJabas, 2)
  assert.equal(d.metricas.cosechadoresActivos, 2)
  assert.equal(d.metricas.promedioCosechador, 1)
  assert.equal(d.metricas.promedioDiario, 2)
  assert.equal(d.metricas.diasProduccion, 1)
  assert.deepEqual(
    d.evolucion.map((p) => p.jabas),
    [0, 2, 0]
  )
  assert.deepEqual(
    d.ranking.map((p) => p.posicion),
    [1, 1]
  )
  assert.deepEqual(
    d.ranking.map((p) => p.nombre),
    ['Alfa Prueba', 'Beta Prueba']
  )
  assert.equal(
    (await reporteCampania(A, 'PRODUCCION', { desde: fecha(-1), hasta: fecha(-1) }))
      .datos.metricas.totalJabas,
    0
  )
})

test('reportes exigen permiso, módulo, pertenencia al cultivo y filtros de la misma campaña', async () => {
  await login('ana')
  for (const filtros of [
    { loteId: crypto.randomUUID() },
    { variedadId: crypto.randomUUID() }
  ])
    await assert.rejects(
      reporteCampania(propio.campaniaId, 'PRODUCCION', filtros),
      /otra campaña|ajena/
    )
  for (const filtros of [
    { desde: fecha(1) },
    { desde: fecha(-1), hasta: fecha(-2) },
    { desde: '2000-01-01' }
  ])
    await assert.rejects(
      reporteCampania(propio.campaniaId, 'PRODUCCION', filtros),
      /período/
    )
  await assert.rejects(reporteCampania(propio.campaniaId, 'OTRO'), /tipo/)
  await assert.rejects(reporteCampania(lecturaAjena.campaniaId), /participación/)
  await assert.rejects(
    reporteCampania(extranjero.campaniaId, 'PRODUCCION', {}, T2),
    /denegad|participación/
  )
  for (const n of ['campo', 'anon']) {
    await login(n)
    await assert.rejects(
      reporteCampania(propio.campaniaId),
      /autenticada|denegad|participación/
    )
  }
  await login('ana')
  await db.query("update platform_modulos set disponible=false where codigo='HARVEST'")
  try {
    await assert.rejects(reporteCampania(propio.campaniaId), /módulo|participación/i)
  } finally {
    await db.query("update platform_modulos set disponible=true where codigo='HARVEST'")
  }
  for (const rol of ['anon', 'service_role'])
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_reportes_campania(uuid,uuid,text,uuid,uuid,date,date)','EXECUTE')",
        [rol]
      ),
      false
    )
  await db.exec('set role authenticated')
  try {
    assert.equal((await reporteCampania(lecturaPropia.campaniaId)).datos.ok, true)
  } finally {
    await db.exec('reset role')
  }
})

test('listado de campaña rechaza cruces de empresa, no participantes y módulo revocado; ACL autenticada', async () => {
  await login('ana')
  await assert.rejects(
    trabajadores(extranjero.campaniaId, 'COSECHADOR', 0, T2),
    /denegad|participación/
  )
  await assert.rejects(
    trabajadores(lecturaAjena.campaniaId, 'COSECHADOR'),
    /participación/
  )
  for (const n of ['anon', 'campo']) {
    await login(n)
    await assert.rejects(
      trabajadores(propio.campaniaId, 'COSECHADOR'),
      /autenticada|participación|denegad/
    )
  }
  await login('ana')
  await db.query("update platform_modulos set disponible=false where codigo='HARVEST'")
  try {
    await assert.rejects(
      trabajadores(propio.campaniaId, 'COSECHADOR'),
      /participación|módulo/i
    )
  } finally {
    await db.query("update platform_modulos set disponible=true where codigo='HARVEST'")
  }
  for (const rol of ['anon', 'service_role'])
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_admin_trabajadores(uuid,uuid,text,integer)','EXECUTE')",
        [rol]
      ),
      false
    )
  await db.exec('set role authenticated')
  try {
    assert.ok(
      (await trabajadores(lecturaPropia.campaniaId, 'SUPERVISORA')).filas.length
    )
  } finally {
    await db.exec('reset role')
  }
})

const trabajadoresFiltrados = (id, rol = 'COSECHADOR', { busqueda = '', activo = null, desde = null, hasta = null, offset = 0 } = {}, tenant = T1) =>
  call('harvest_admin_trabajadores_filtrados($1::uuid,$2::uuid,$3::text,$4::integer,$5::text,$6::boolean,$7::date,$8::date)',
    [tenant, id, rol, offset, busqueda, activo, desde, hasta])
const lotesFiltrados = (id, tipo = 'lotes', { busqueda = '', estado = '', desde = null, hasta = null, offset = 0 } = {}, tenant = T1) =>
  call('harvest_admin_listar_filtrado($1::uuid,$2::text,$3::uuid,$4::text,null,null,$5::text,$6::integer,$7::date,$8::date)',
    [tenant, tipo, id, busqueda, estado, offset, desde, hasta])

test('filtros de trabajadores cuentan antes de paginar, buscan DNI y no mezclan estados ni roles', async () => {
  await login('ana')
  const id = lecturaPropia.campaniaId
  const activos = await trabajadoresFiltrados(id, 'COSECHADOR', { activo: true })
  assert.equal(activos.total, 51)
  assert.equal(activos.filas.length, 50)
  const pagina2 = await trabajadoresFiltrados(id, 'COSECHADOR', { activo: true, offset: 50 })
  assert.equal(pagina2.total, 51)
  assert.equal(pagina2.filas.length, 1)
  const fueraDePrimera = pagina2.filas[0]
  const buscado = await trabajadoresFiltrados(id, 'COSECHADOR', { busqueda: fueraDePrimera.dni, activo: true })
  assert.equal(buscado.total, 1)
  assert.equal(buscado.filas[0].id, fueraDePrimera.id)
  const inactivos = await trabajadoresFiltrados(id, 'COSECHADOR', { activo: false })
  assert.equal(inactivos.total, 1)
  assert.ok(inactivos.filas.every(p => !p.activo))
  const jaberos = await trabajadoresFiltrados(id, 'JABERO')
  assert.equal(jaberos.total, 1)
  assert.equal((await trabajadoresFiltrados(id, 'SUPERVISORA')).total, (await trabajadores(id, 'SUPERVISORA')).total)
})

test('período de trabajadores incluye el día Lima completo y omite fechas desconocidas solo al filtrar', async () => {
  await login('ana')
  const id = lecturaPropia.campaniaId
  const sinFiltro = await trabajadoresFiltrados(id)
  const conFecha = await trabajadoresFiltrados(id, 'COSECHADOR', { desde: hoy, hasta: hoy })
  assert.equal(conFecha.total, sinFiltro.total)
  assert.equal((await trabajadoresFiltrados(id, 'COSECHADOR', { hasta: fecha(-1) })).total, 0)
  await db.query(`with nuevos as (
    insert into trabajadores(tenant_id,dni,nombres,apellidos,activo)
    select $1,'98'||lpad(n::text,6,'0'),'Ángela','Filtro '||n,true from generate_series(1,3) n
    returning id,dni
  ) insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo,iniciado_en)
    select $1,id,$2,'JABERO',true,case dni when '98000001' then null
      when '98000002' then ($3::date::text||'T04:59:59Z')::timestamptz
      else ($3::date::text||'T05:00:00Z')::timestamptz end from nuevos`, [T1,id,hoy])
  const historicos = await trabajadoresFiltrados(id, 'JABERO', { busqueda: 'ANGELA' })
  assert.equal(historicos.total, 3)
  assert.ok(historicos.filas.some(p => p.iniciadoEn === null))
  const limite = await trabajadoresFiltrados(id, 'JABERO', { busqueda: 'ANGELA', desde: hoy, hasta: hoy })
  assert.equal(limite.total, 1)
  assert.equal(limite.filas[0].dni, '98000003')
})

test('lotes filtra asignación, busca lotes más allá de la primera página y mantiene el total', async () => {
  await login('ana')
  const id = lecturaPropia.campaniaId
  await generar(id, 61)
  const primera = await lotesFiltrados(id, 'lotes', { estado: 'DISPONIBLE', desde: hoy, hasta: hoy })
  const segunda = await lotesFiltrados(id, 'lotes', { estado: 'DISPONIBLE', desde: hoy, hasta: hoy, offset: 50 })
  assert.equal(primera.total, 61)
  assert.equal(primera.filas.length, 50)
  assert.equal(segunda.total, 61)
  assert.equal(segunda.filas.length, 11)
  const fuera = segunda.filas.at(-1)
  const buscado = await lotesFiltrados(id, 'lotes', { busqueda: fuera.id })
  assert.equal(buscado.total, 1)
  assert.equal(buscado.filas[0].id, fuera.id)
  assert.equal((await lotesFiltrados(id, 'lotes', { hasta: fecha(-1) })).total, 0)
  assert.equal((await lotesFiltrados(id, 'lotes', { estado: 'ASIGNADO' })).total, 0)
})

test('asignados busca por lote, nombre y DNI y filtra la fecha confirmada de asignación', async () => {
  await login('ana')
  const id = propio.campaniaId
  const todos = await lotesFiltrados(id, 'asignaciones')
  assert.ok(todos.total > 0)
  const fila = todos.filas.find(p => p.asignadoEn)
  assert.ok(fila)
  for(const busqueda of [fila.id, fila.trabajador.dni, fila.trabajador.nombre.toUpperCase()]) {
    const resultado = await lotesFiltrados(id, 'asignaciones', { busqueda })
    assert.ok(resultado.filas.some(p => p.id === fila.id))
  }
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year:'numeric', month:'2-digit',day:'2-digit' }).format(new Date(fila.asignadoEn))
  assert.ok((await lotesFiltrados(id, 'asignaciones', { desde: dia, hasta: dia })).filas.some(p => p.id === fila.id))
})

test('filtros nuevos rechazan rangos inválidos y conservan permisos, módulo y aislamiento de campaña', async () => {
  await login('ana')
  for(const consultar of [lotesFiltrados, (id, tipo, f, tenant) => trabajadoresFiltrados(id, 'COSECHADOR', f, tenant)]) {
    await assert.rejects(consultar(propio.campaniaId, 'lotes', { desde: hoy, hasta: fecha(-1) }), /inválid/)
    await assert.rejects(consultar(propio.campaniaId, 'lotes', { hasta: fecha(1) }), /inválid/)
    await assert.rejects(consultar(extranjero.campaniaId, 'lotes', {}, T2), /denegad|participación/)
    await assert.rejects(consultar(lecturaAjena.campaniaId, 'lotes'), /participación/)
  }
  for(const actor of ['anon','campo']) {
    await login(actor)
    await assert.rejects(lotesFiltrados(propio.campaniaId), /autenticada|denegad|participación/)
    await assert.rejects(trabajadoresFiltrados(propio.campaniaId), /autenticada|denegad|participación/)
  }
  await login('ana')
  await db.query("update platform_modulos set disponible=false where codigo='HARVEST'")
  try {
    await assert.rejects(lotesFiltrados(propio.campaniaId), /módulo|participación/i)
    await assert.rejects(trabajadoresFiltrados(propio.campaniaId), /módulo|participación/i)
  } finally { await db.query("update platform_modulos set disponible=true where codigo='HARVEST'") }
  for(const firma of ['harvest_admin_listar_filtrado(uuid,text,uuid,text,uuid,uuid,text,integer,date,date)', 'harvest_admin_trabajadores_filtrados(uuid,uuid,text,integer,text,boolean,date,date)']) {
    for(const rol of ['anon','service_role']) assert.equal(await call('has_function_privilege($1,$2,\'EXECUTE\')',[rol,firma]), false)
    assert.equal(await call('has_function_privilege(\'authenticated\',$1,\'EXECUTE\')',[firma]), true)
  }
})


