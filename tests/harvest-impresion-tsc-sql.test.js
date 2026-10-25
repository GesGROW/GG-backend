import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const T2 = crypto.randomUUID(),
  C2 = crypto.randomUUID(),
  cuentas = {}
const M = '20261024074658_harvest_impresion_tsc.sql'
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sujeto ?? ''
  ])
const generar = (
  cantidad = 1,
  tamanio = 1,
  op = crypto.randomUUID(),
  camp = A,
  tenant = T1
) =>
  call('harvest_admin_generar($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer)', [
    tenant,
    camp,
    op,
    cantidad,
    tamanio
  ])
const recibo = (op, tenant = T1) =>
  call('harvest_admin_generacion($1::uuid,$2::uuid)', [tenant, op])
const documento = (op, offset = 0, tenant = T1) =>
  call('harvest_admin_documento_impresion($1::uuid,$2::uuid,$3::integer)', [
    tenant,
    op,
    offset
  ])
const editar = (cultivo, datos, tenant = T1) =>
  call('harvest_cultivos_editar($1::uuid,$2::uuid,$3::jsonb)', [tenant, cultivo, datos])
const crearCultivo = async (nombre = 'Arándanos propios', extra = {}, tenant = T1) => {
  const hoy = await call(
    "to_char(clock_timestamp() at time zone 'America/Lima','YYYY-MM-DD')"
  )
  const r = await call('harvest_cultivos_crear($1::uuid,$2::uuid,$3::jsonb)', [
    tenant,
    crypto.randomUUID(),
    {
      nombre,
      color: '#3B64EC',
      variedades: ['Ventura'],
      lotes: [{ nombre: 'Norte', variedades: ['Ventura'] }],
      campania: { nombre: 'Actual', fechaInicio: hoy, fechaFin: hoy },
      ...extra
    }
  ])
  const catalogo = await call('harvest_cultivos_catalogo($1::uuid)', [tenant])
  return {
    ...catalogo.propios.find((c) => c.id === r.cultivoId),
    campaniaId: r.campaniaId
  }
}
const codigo = (prefijo, n) => 'C' + prefijo + String(n).padStart(2, '0')
let historica, legacyAntes, primera, propio, gPropio

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  // Execute the real migration chain, rather than mocking permissions or RPCs.
  for (const n of readdirSync(dir)
    .filter((n) => n >= '202610140600_' && n < M && n.endsWith('.sql'))
    .sort())
    await db.exec(read(n))
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Otra empresa','TSC-OTHER')",
    [T2]
  )
  for (const [n, rol] of [
    ['ana', 'SUPERVISOR_COSECHA'],
    ['bea', 'SUPERVISOR_COSECHA'],
    ['owner', 'ADMIN_EMPRESA'],
    ['view', 'CONSULTA'],
    ['campo', 'OPERADOR_CAMPO'],
    ['otra', 'SUPERVISOR_COSECHA']
  ]) {
    cuentas[n] = { sujeto: crypto.randomUUID() }
    await login(n)
    cuentas[n].id = (await call('iam_obtener_identidad()')).usuario.id
    for (const tenant of n === 'ana' ? [T1, T2] : [n === 'otra' ? T2 : T1])
      await db.query(
        `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
        insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
        select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo=$3`,
        [tenant, cuentas[n].id, rol]
      )
  }
  await login('ana')
  await db.query(
    `insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $1,m.id,r.id from identity_membresias m cross join identity_roles r
    where m.tenant_id=$1 and m.usuario_id=$2 and r.tenant_id=$1 and r.codigo='ADMIN_EMPRESA'`,
    [T2, cuentas.ana.id]
  )
  await db.query(
    'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
    [T2, cuentas.ana.id]
  )
  await call(
    'platform_solicitar_cambio($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)',
    [
      crypto.randomUUID(),
      T2,
      'CREAR_SUSCRIPCION',
      { planId: '00000000-0000-4000-8000-000000000063' },
      'Prueba local TSC'
    ]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'TSC-B','Otra','ACTIVA')",
    [C2, T2]
  )
  historica = await generar(2, 2)
  await db.query(
    `insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id)
    select x,$1,$2,$3 from unnest(array['C00000108','C000002100','C01061308']) x`,
    [historica.lotes[0].id, A, T1]
  )
  legacyAntes = (await db.query('select * from harvest_tickets order by codigo')).rows
  await db.exec(read(M))
})
after(() => db.close())

test('migración aditiva conserva PK/UUID y recibos históricos; no convierte QR/A4', async () => {
  assert.deepEqual(
    (await db.query('select * from harvest_tickets order by codigo')).rows,
    legacyAntes
  )
  assert.deepEqual(await recibo(historica.operacionId), historica)
  assert.deepEqual(await generar(2, 2, historica.operacionId), historica)
  await assert.rejects(documento(historica.operacionId), /histórica.*QR\/A4/)
  const lote = await call("harvest_admin_obtener($1::uuid,'lotes',$2::text)", [
    T1,
    historica.lotes[0].id
  ])
  assert.equal(lote.id, historica.lotes[0].id)
  assert.equal(lote.codigo, null)
  assert.equal(lote.generacionId, null)
  assert.equal(lote.numeroLote, null)
  assert.equal(
    await call("(select abreviatura_impresion from cultivos where codigo='MANDARINA')"),
    'MAN'
  )
  assert.equal(
    await call("(select abreviatura_impresion from cultivos where codigo='ARANDANO')"),
    'ARA'
  )
  assert.match(
    await call("pg_get_indexdef('harvest_tickets_lote'::regclass)"),
    /\(lote_id, campania_id, codigo\)/
  )
})

test('códigos reales reservan prefijos históricos, ticket 1..cantidad por lote y ordinal local', async () => {
  primera = await generar(223, 110)
  assert.equal(primera.formatoImpresion, 'TSC_30X20_3')
  assert.equal(primera.abreviaturaCultivo, 'ARA')
  assert.equal(
    primera.fecha,
    await call("to_char($1::timestamptz at time zone 'America/Lima','YYYYMMDD')", [
      primera.creadaEn
    ])
  )
  assert.deepEqual(
    primera.lotes.map((l) => l.codigoLote),
    ['000003', '000004', '000005']
  )
  assert.deepEqual(
    primera.lotes.map((l) => l.numeroLote),
    [1, 2, 3]
  )
  assert.deepEqual(
    primera.lotes.map((l) => l.cantidadTickets),
    [110, 110, 3]
  )
  for (const l of primera.lotes) assert.match(l.id, /^[0-9a-f-]{36}$/)
  const doc = await documento(primera.operacionId)
  assert.deepEqual(
    Object.keys(doc).sort(),
    [
      'operacionId',
      'campaniaId',
      'fecha',
      'abreviaturaCultivo',
      'total',
      'filas'
    ].sort()
  )
  assert.equal(doc.total, 223)
  assert.deepEqual(doc.filas[0], {
    codigo: 'C00000301',
    codigoLote: '000003',
    numeroLote: 1,
    numeroTicket: 1
  })
  assert.equal(doc.filas[98].codigo, 'C00000399')
  assert.equal(doc.filas[99].codigo, 'C000003100')
  assert.equal(doc.filas[109].codigo, 'C000003110')
  assert.deepEqual(doc.filas[110], {
    codigo: 'C00000401',
    codigoLote: '000004',
    numeroLote: 2,
    numeroTicket: 1
  })
  const lote = await call("harvest_admin_obtener($1::uuid,'lotes',$2::text)", [
    T1,
    primera.lotes[1].id
  ])
  assert.equal(lote.codigo, primera.lotes[1].codigoLote)
  assert.equal(lote.generacionId, primera.operacionId)
  assert.equal(lote.numeroLote, 2)
  const listado = await call(
    "harvest_admin_listar($1::uuid,'lotes',$2::uuid,'',$3::uuid)",
    [T1, A, primera.lotes[1].id]
  )
  assert.equal(listado.filas[0].codigo, lote.codigo)
  assert.equal(
    await call(
      '(select count(*)::int=count(distinct codigo)::int from harvest_tickets)'
    ),
    true
  )
})

test('reintentos idempotentes concurrentes no consumen secuencia; otras intenciones se rechazan', async () => {
  const antes = await call('(select last_value from harvest_impresion_codigo_lote_seq)')
  const resultados = await Promise.all(
    Array.from({ length: 4 }, () => generar(223, 110, primera.operacionId))
  )
  for (const r of resultados) assert.deepEqual(r, primera)
  assert.equal(
    await call('(select last_value from harvest_impresion_codigo_lote_seq)'),
    antes
  )
  await assert.rejects(generar(224, 110, primera.operacionId), /reutilizado/)
  await assert.rejects(generar(223, 111, primera.operacionId), /reutilizado/)
  await assert.rejects(generar(223, 110, primera.operacionId, B), /reutilizado/)
  await login('bea')
  assert.deepEqual(await recibo(primera.operacionId), primera)
  await assert.rejects(generar(223, 110, primera.operacionId), /reutilizado/)
  await login('ana')
})

test('paginación fija de 500 conserva orden numérico de ticket y lote por encima de 99', async () => {
  for (const tamanio of [110, 1]) {
    const g = await generar(1123, tamanio)
    const docs = await Promise.all(
      [0, 500, 1000, 1500].map((n) => documento(g.operacionId, n))
    )
    assert.deepEqual(
      docs.map((d) => d.filas.length),
      [500, 500, 123, 0]
    )
    const filas = docs.flatMap((d) => d.filas)
    assert.equal(new Set(filas.map((f) => f.codigo)).size, 1123)
    filas.forEach((f, i) => {
      assert.equal(f.numeroLote, Math.floor(i / tamanio) + 1)
      assert.equal(f.numeroTicket, (i % tamanio) + 1)
      assert.equal(
        f.codigo,
        codigo(g.lotes[f.numeroLote - 1].codigoLote, f.numeroTicket)
      )
    })
    assert.deepEqual(
      await call('harvest_admin_documento_impresion($1::uuid,$2::uuid)', [
        T1,
        g.operacionId
      ]),
      docs[0]
    )
  }
  await assert.rejects(documento(primera.operacionId, -1), /Offset/)
  await assert.rejects(documento(primera.operacionId, null), /Offset/)
})

test('catálogo valida abreviatura en API de creación/edición; fallback MAN/ARA y otros explícito', async () => {
  for (const v of ['', 'AB', 'ABCD', 'A1A', 'ÁRA', null, 123, true, {}]) {
    await assert.rejects(
      crearCultivo('Mango', { abreviaturaImpresion: v }),
      /abreviaturaImpresion/
    )
  }
  propio = await crearCultivo('Arándanos propios', { abreviaturaImpresion: ' ara ' })
  assert.equal(propio.abreviaturaImpresion, 'ARA')
  assert.equal((await crearCultivo('Mandarinas norte')).abreviaturaImpresion, 'MAN')
  assert.equal((await crearCultivo('Mángo especial')).abreviaturaImpresion, 'MAN')
  assert.equal((await crearCultivo('Uva')).abreviaturaImpresion, 'UVA')
  assert.equal((await crearCultivo('Té')).abreviaturaImpresion, 'TEX')
  assert.equal((await crearCultivo('123')).abreviaturaImpresion, 'CUL')
  for (const v of ['', 'ABCD', null, 0])
    await assert.rejects(
      editar(propio.id, { abreviaturaImpresion: v }),
      /abreviaturaImpresion/
    )
  await assert.rejects(
    editar(propio.id, { abreviaturaImpresion: 'ARA', nombre: 'Cambio' }),
    /únicamente/
  )
  await assert.rejects(editar(null, { abreviaturaImpresion: 'ARA' }), /participante/)
  await assert.rejects(
    editar('a1000000-0000-4000-8000-000000000001', { abreviaturaImpresion: 'XXX' }),
    /Cultivo/
  )
  const c = await call('harvest_cultivos_catalogo($1::uuid)', [T1])
  assert.equal(c.propios.find((x) => x.id === propio.id).abreviaturaImpresion, 'ARA')
})

test('snapshot inmutable conserva nombre, cultivo, abreviatura y fecha al reimprimir', async () => {
  await db.exec("set timezone='Pacific/Auckland'")
  gPropio = await generar(3, 2, crypto.randomUUID(), propio.campaniaId)
  const antes = await documento(gPropio.operacionId)
  assert.equal(
    gPropio.fecha,
    await call("to_char($1::timestamptz at time zone 'America/Lima','YYYYMMDD')", [
      gPropio.creadaEn
    ])
  )
  await editar(propio.id, { abreviaturaImpresion: 'NUE' })
  await db.query("update cultivos set nombre='Nuevo nombre' where id=$1", [propio.id])
  await db.exec("set timezone='America/Los_Angeles'")
  assert.deepEqual(await documento(gPropio.operacionId), antes)
  assert.deepEqual(await recibo(gPropio.operacionId), gPropio)
  assert.deepEqual(await generar(3, 2, gPropio.operacionId, propio.campaniaId), gPropio)
  assert.equal(gPropio.cultivoId, propio.id)
  assert.equal(gPropio.cultivoNombre, 'Arándanos propios')
  const nueva = await generar(1, 1, crypto.randomUUID(), propio.campaniaId)
  assert.equal(nueva.abreviaturaCultivo, 'NUE')
  assert.equal(nueva.cultivoNombre, 'Nuevo nombre')
  await db.query("update campanias set estado='CERRADA' where id=$1", [
    propio.campaniaId
  ])
  assert.deepEqual(await documento(gPropio.operacionId), antes)
  await assert.rejects(generar(1, 1, crypto.randomUUID(), propio.campaniaId), /activa/)
  for (const tabla of [
    'harvest_impresion_lotes',
    'harvest_impresion_filas',
    'harvest_impresion_codigos_lote'
  ]) {
    await assert.rejects(db.exec(`delete from ${tabla}`), /inmutable/)
    await assert.rejects(db.exec(`truncate ${tabla} cascade`), /inmutable/)
  }
  await assert.rejects(
    db.exec('update harvest_impresion_filas set numero_ticket=2'),
    /inmutable/
  )
  await assert.rejects(
    db.exec('update harvest_impresion_lotes set numero_lote=2'),
    /inmutable/
  )
  await assert.rejects(
    db.query("update harvest_generaciones set resultado='{}' where id=$1", [
      gPropio.operacionId
    ]),
    /inmutable/
  )
  await db.exec("set timezone='UTC'")
})

test('reimpresión de snapshot de otra fecha usa la fecha persistida, no el reloj de consulta', async () => {
  // Fixture for a previously acknowledged TSC generation: inserts only, without
  // disabling immutability triggers or replacing server auth/date functions.
  const id = crypto.randomUUID(),
    lote = crypto.randomUUID()
  await db.transaction(async (tx) => {
    const prefijo = (
      await tx.query('select harvest_impresion_reservar_lote($1::uuid) r', [lote])
    ).rows[0].r
    const resultado = {
      ...primera,
      operacionId: id,
      fecha: '19990101',
      creadaEn: '1999-01-01T12:00:00Z',
      cantidadTickets: 1,
      tamanioLote: 1,
      lotes: [{ id: lote, codigoLote: prefijo, numeroLote: 1, cantidadTickets: 1 }]
    }
    await tx.query(
      `insert into harvest_generaciones(id,tenant_id,campania_id,actor_usuario_id,cantidad_tickets,tamanio_lote,creada_en,resultado)
      values($1,$2,$3,$4,1,1,'1999-01-01T12:00:00Z',$5)`,
      [id, T1, A, cuentas.ana.id, resultado]
    )
    await tx.query(
      'insert into harvest_lotes_tickets(id,tenant_id,campania_id) values($1,$2,$3)',
      [lote, T1, A]
    )
    await tx.query('insert into harvest_impresion_lotes values($1,$2,$3,1)', [
      lote,
      id,
      prefijo
    ])
    await tx.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',
      [codigo(prefijo, 1), lote, A, T1]
    )
    await tx.query('insert into harvest_impresion_filas values($1,$2,$3,1)', [
      codigo(prefijo, 1),
      lote,
      A
    ])
  })
  assert.equal((await documento(id)).fecha, '19990101')
})

test('autorización por harvest.manage, participación y tenant; lectura compartida tras refresh', async () => {
  for (const n of ['view', 'campo', 'owner']) {
    await login(n)
    await assert.rejects(generar(), /Permiso/)
    await assert.rejects(recibo(primera.operacionId), /Permiso/)
    await assert.rejects(documento(primera.operacionId), /Permiso/)
  }
  await login('bea')
  await assert.rejects(documento(gPropio.operacionId), /participación/)
  await assert.rejects(recibo(gPropio.operacionId), /participación/)
  await assert.rejects(
    generar(1, 1, crypto.randomUUID(), propio.campaniaId),
    /participación/
  )
  await assert.rejects(
    editar(propio.id, { abreviaturaImpresion: 'XXX' }),
    /participante/
  )
  await assert.rejects(
    call("harvest_admin_obtener($1::uuid,'lotes',$2::text)", [T1, gPropio.lotes[0].id]),
    /empresa|participación/
  )
  // A campaign with catalog/history already prevents moving it to another crop.
  await login('ana')
  await assert.rejects(
    db.query(
      "update campanias set cultivo_id='a1000000-0000-4000-8000-000000000002' where id=$1",
      [propio.campaniaId]
    ),
    /No se puede cambiar el cultivo/
  )
  await login('bea')
  await db.query(
    'insert into harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) values($1,$2,$3)',
    [T1, propio.id, cuentas.bea.id]
  )
  await db.exec('set role authenticated')
  try {
    assert.deepEqual(await recibo(gPropio.operacionId), gPropio)
    assert.equal((await documento(gPropio.operacionId)).total, 3)
  } finally {
    await db.exec('reset role')
  }
  await db.query(
    'delete from harvest_cultivo_supervisores where cultivo_id=$1 and usuario_id=$2',
    [propio.id, cuentas.bea.id]
  )
  await assert.rejects(documento(gPropio.operacionId), /participación/)
  await login('otra')
  await assert.rejects(
    documento(primera.operacionId),
    /Permiso|empresa|acceso|membresía/i
  )
  await assert.rejects(documento(primera.operacionId, 0, T2), /otra empresa/)
  await login('ana')
  await assert.rejects(
    generar(1, 1, crypto.randomUUID(), C2),
    /otra empresa|participación/
  )
  await assert.rejects(recibo(crypto.randomUUID()), /inexistente/)
  await assert.rejects(recibo(null), /inexistente/)
  await login(null)
  await assert.rejects(recibo(primera.operacionId), /autentic|identidad|sesión/i)
  await login('ana')
})

test('secuencia global no se reinicia entre campañas/tenants; operaciones distintas tienen prefijos únicos', async () => {
  const antes = Number(
    await call('(select last_value from harvest_impresion_codigo_lote_seq)')
  )
  const gs = await Promise.all([
    generar(2, 1),
    generar(2, 1, crypto.randomUUID(), B),
    generar(2, 1, crypto.randomUUID(), C2, T2)
  ])
  const codigos = gs.flatMap((g) => g.lotes.map((l) => l.codigoLote))
  assert.equal(new Set(codigos).size, 6)
  assert.ok(codigos.every((c) => Number(c) > antes))
  assert.deepEqual(
    gs.map((g) => g.lotes[0].numeroLote),
    [1, 1, 1]
  )
  assert.equal(gs[1].abreviaturaCultivo, 'MAN')
  const params = (
    await db.query(`select seqmax::text,seqcycle from pg_sequence
    where seqrelid='harvest_impresion_codigo_lote_seq'::regclass`)
  ).rows[0]
  assert.deepEqual(params, { seqmax: '999999', seqcycle: false })
  // PGlite serializes one DB connection; sequence semantics, rather than these
  // Promise calls, are the guarantee across independent PostgreSQL sessions.
  const valor = await call("nextval('harvest_impresion_codigo_lote_seq')")
  await db.exec('begin')
  const abortado = await call("nextval('harvest_impresion_codigo_lote_seq')")
  await db.exec('rollback')
  assert.ok(Number(abortado) > Number(valor))
  assert.ok(
    Number(await call("nextval('harvest_impresion_codigo_lote_seq')")) >
      Number(abortado)
  )
})

test('importaciones posteriores reservan prefijos; rechaza reutilizar prefijo TSC ajeno', async () => {
  const siguiente = String(
    Number(await call('(select last_value from harvest_impresion_codigo_lote_seq)')) + 1
  ).padStart(6, '0')
  await db.query(
    'insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',
    [codigo(siguiente, 88), historica.lotes[0].id, A, T1]
  )
  const g = await generar()
  assert.equal(Number(g.lotes[0].codigoLote), Number(siguiente) + 1)
  await assert.rejects(
    db.query(
      'insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',
      [codigo(g.lotes[0].codigoLote, 999), historica.lotes[0].id, A, T1]
    ),
    /reservado/
  )
})

test('recibos y documentos vuelven a exigir el módulo HARVEST vigente', async () => {
  const g = await generar(1, 1, crypto.randomUUID(), C2, T2)
  const cambio = (tipo) =>
    call('platform_solicitar_cambio($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text)', [
      crypto.randomUUID(),
      T2,
      tipo,
      { modulo: 'HARVEST' },
      'Prueba de impresión'
    ])
  await cambio('DESHABILITAR_MODULO')
  try {
    await assert.rejects(recibo(g.operacionId, T2), /Módulo no habilitado/)
    await assert.rejects(documento(g.operacionId, 0, T2), /Módulo no habilitado/)
    await assert.rejects(
      generar(1, 1, crypto.randomUUID(), C2, T2),
      /Módulo no habilitado/
    )
  } finally {
    await cambio('HABILITAR_MODULO')
  }
  assert.equal((await documento(g.operacionId, 0, T2)).total, 1)
})

test('rollback de generación es completo y las cantidades admiten exactamente 100000', async () => {
  for (const [cantidad, tamanio] of [
    [0, 1],
    [1, 0],
    [100001, 1],
    [1, 100001],
    [null, 1],
    [1, null]
  ])
    await assert.rejects(generar(cantidad, tamanio), /cantidades/)
  const id = crypto.randomUUID()
  const antes = await call('(select count(*)::int from harvest_tickets)')
  await db.exec(`create function tsc_fallo() returns trigger language plpgsql as $$ begin
    if new.numero_lote=2 then raise exception 'Fallo TSC'; end if; return new; end $$;
    create trigger tsc_fallo before insert on harvest_impresion_lotes for each row execute function tsc_fallo();`)
  await assert.rejects(generar(3, 1, id), /Fallo TSC/)
  assert.equal(await call('(select count(*)::int from harvest_tickets)'), antes)
  assert.equal(
    await call('(select count(*)::int from harvest_generaciones where id=$1)', [id]),
    0
  )
  assert.equal(
    await call(
      '(select count(*)::int from harvest_impresion_lotes where operacion_id=$1)',
      [id]
    ),
    0
  )
  assert.equal(
    await call(`(select count(*)::int from harvest_impresion_codigos_lote r
    where r.lote_id is not null and not exists(select 1 from harvest_lotes_tickets l where l.id=r.lote_id))`),
    0
  )
  await db.exec(
    'drop trigger tsc_fallo on harvest_impresion_lotes; drop function tsc_fallo();'
  )
  assert.equal((await generar(3, 1, id)).cantidadTickets, 3)
  const grande = await generar(100000, 100000)
  assert.equal(grande.cantidadTickets, 100000)
  assert.equal(grande.lotes.length, 1)
  const fin = await documento(grande.operacionId, 99500)
  assert.equal(fin.filas.length, 500)
  assert.equal(fin.filas.at(-1).numeroTicket, 100000)
  assert.equal(fin.filas.at(-1).codigo, codigo(grande.lotes[0].codigoLote, 100000))
  assert.equal((await documento(grande.operacionId, 100000)).filas.length, 0)
  assert.equal(
    await call('(select count(*)::int from harvest_impresion_filas where lote_id=$1)', [
      grande.lotes[0].id
    ]),
    100000
  )
})

test('ACL/RLS ocultan helpers, secuencia y snapshots; solo RPC autenticados autorizados', async () => {
  await login('ana')
  await db.exec('set role authenticated')
  try {
    assert.equal((await documento(primera.operacionId)).total, 223)
    for (const t of [
      'harvest_impresion_codigos_lote',
      'harvest_impresion_lotes',
      'harvest_impresion_filas'
    ]) {
      await assert.rejects(db.query('select * from ' + t), /permission denied/)
      await assert.rejects(db.query('delete from ' + t), /permission denied/)
    }
    await assert.rejects(
      call("nextval('harvest_impresion_codigo_lote_seq')"),
      /permission denied/
    )
    await assert.rejects(
      call('harvest_impresion_reservar_lote($1::uuid)', [crypto.randomUUID()]),
      /permission denied/
    )
  } finally {
    await db.exec('reset role')
  }
  for (const rol of ['anon', 'service_role']) {
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_admin_documento_impresion(uuid,uuid,integer)','execute')",
        [rol]
      ),
      false
    )
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_admin_generacion(uuid,uuid)','execute')",
        [rol]
      ),
      false
    )
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_cultivos_editar(uuid,uuid,jsonb)','execute')",
        [rol]
      ),
      false
    )
  }
  assert.equal(
    await call(`(select bool_and(relrowsecurity) from pg_class where oid in
    ('harvest_impresion_codigos_lote'::regclass,'harvest_impresion_lotes'::regclass,'harvest_impresion_filas'::regclass))`),
    true
  )
})

test('agotamiento de seis dígitos falla claramente, sin ciclo ni generación parcial', async () => {
  // Last test: do not reset the production sequence or mask its exhaustion.
  await db.exec("select setval('harvest_impresion_codigo_lote_seq',999998,true)")
  const ultima = await generar()
  assert.equal(ultima.lotes[0].codigoLote, '999999')
  await assert.rejects(call("nextval('harvest_impresion_codigo_lote_seq')"), (e) => {
    assert.equal(e.code, '2200H')
    return true
  })
  const id = crypto.randomUUID()
  await assert.rejects(generar(1, 1, id), (e) => {
    assert.equal(e.code, '22003')
    assert.match(e.message, /agotaron.*000001\.\.999999/)
    return true
  })
  assert.equal(
    await call('(select count(*)::int from harvest_generaciones where id=$1)', [id]),
    0
  )
  assert.equal((await documento(ultima.operacionId)).filas[0].codigo, 'C99999901')
  assert.deepEqual(await generar(1, 1, ultima.operacionId), ultima)
})
