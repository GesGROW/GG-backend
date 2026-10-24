import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import {
  guardarCache,
  seleccionarCampaniaLocal,
  obtenerLotes,
  iniciarSesionOffline,
  obtenerSesionLocal,
  obtenerColaCompleta
} from '@gesgrow/harvest-client-contracts/src/offline/db.js'
import { seleccionarVariedadLote } from '@gesgrow/core/contexts/campaign-management/domain/variedadesLote.js'
import {
  normalizarProduccionLotes,
  resumirProduccionLotes
} from '@gesgrow/core/contexts/harvest/application/reports/produccionLotes.js'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
const sql = (file) => read('../supabase/migrations/' + file)
const db = new PGlite()
const CAMP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'
const V3 = '33333333-3333-4333-8333-333333333333'
const LOTE = '44444444-4444-4444-8444-444444444444'
const HIST = '55555555-5555-4555-8555-555555555555'
const operador = '47480378'
const call = async (query, args = []) => (await db.query(query, args)).rows[0].resultado
const guardar = (ids, { id = LOTE, codigo = 'L1', campania = CAMP } = {}) =>
  call(
    'select admin_guardar_lote_variedades($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid[],$6::boolean) as resultado',
    [id, codigo, 'Norte', campania, ids, true]
  )
const iniciar = (id, variedad = V2, lote = LOTE, dni = '81000001', op = operador) =>
  call(
    'select iniciar_sesion_lectura($1::varchar,$2::varchar,$3::uuid,$4::uuid,$5::uuid) as resultado',
    [op, dni, lote, id, variedad]
  )

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  await db.exec(sql('202610030100_acceso_diario_jaberos.sql'))
  await db.exec(`
    create table variedades (id uuid primary key, nombre varchar(100), activo boolean not null);
    create table lotes (
      id uuid primary key default gen_random_uuid(), codigo varchar(30), nombre varchar(100),
      campania_id uuid references campanias(id), variedad_id uuid not null references variedades(id),
      activo boolean not null, unique(campania_id,codigo)
    );
    create table sesiones_lectura (
      id uuid primary key, lote_id uuid not null references lotes(id),
      jabero_rol_id uuid references trabajador_campania_rol(id),
      iniciada_por_usuario_id uuid references usuarios_app(id),
      estado text default 'ACTIVA', fecha_inicio timestamptz default now()
    );
    create table asignaciones_ticket (id uuid primary key, cosechador_rol_id uuid);
    create table lecturas_jaba (
      id uuid primary key default gen_random_uuid(), sesion_id uuid references sesiones_lectura(id),
      asignacion_ticket_id uuid references asignaciones_ticket(id), fecha_hora timestamptz default now()
    );
    create function autorizar_integracion_reportes() returns void language plpgsql as $$
      begin perform autorizar_integracion_gestion_maestros(); end $$;
    -- Contrato mínimo del RPC original no versionado; los otros campos deben preservarse.
    create function obtener_cache_operativa(p_dni_operador varchar) returns jsonb
    language plpgsql security definer as $$ begin
      perform autorizar_operador_del_dia(p_dni_operador);
      return jsonb_build_object(
        'campania', jsonb_build_object('id','${CAMP}'),
        'sincronizado_en', '2026-10-11T12:00:00Z',
        'trabajadores', jsonb_build_array(jsonb_build_object('dni','81000001','nombre','Ana','roles',jsonb_build_array('JABERO'))),
        'tickets', '[]'::jsonb, 'lotes', '[]'::jsonb
      );
    end $$;
    insert into variedades values ('${V1}','Ventura',true),('${V2}','Biloxi',true),('${V3}','Inactiva',false);
    insert into lotes values ('${LOTE}','L1','Norte','${CAMP}','${V1}',true);
    insert into trabajadores (dni,nombres,apellidos,activo) values ('81000001','Ana','Torres',true);
    insert into trabajador_campania_rol (trabajador_id,campania_id,rol,activo)
      select id,'${CAMP}','JABERO',true from trabajadores where dni='81000001';
    insert into sesiones_lectura (id,lote_id,jabero_rol_id,iniciada_por_usuario_id,estado)
      select '${HIST}','${LOTE}',r.id,ua.id,'CERRADA' from trabajador_campania_rol r
      cross join usuarios_app ua where r.rol='JABERO';
    insert into asignaciones_ticket values ('${V1}','${V2}');
    insert into lecturas_jaba (sesion_id,asignacion_ticket_id) values ('${HIST}','${V1}'),('${HIST}','${V1}');
  `)
  await db.exec(sql('20260928_iniciar_sesion_lectura_pda.sql'))
  await db.exec(sql('20260930_admin_lotes.sql'))
  await db.exec(sql('20260930_produccion_lotes.sql'))
  const adminReporte = sql('20260930_admin_reportes_sheets.sql').match(
    /create or replace function public\.admin_obtener_produccion_lotes\(\)[\s\S]*?\$\$;/
  )[0]
  await db.exec(adminReporte)
  await db.exec(sql('202610110100_lotes_variedades.sql'))
  await db.exec(sql('202610110200_produccion_lote_variedad.sql'))
})
after(() => db.close())

test('migra la variedad anterior del lote y las sesiones sin cambiar sus UUID', async () => {
  assert.equal(
    (await db.query('select variedad_id from sesiones_lectura where id=$1', [HIST]))
      .rows[0].variedad_id,
    V1
  )
  assert.deepEqual(
    (await db.query('select lote_id,variedad_id,activo from lote_variedades')).rows,
    [{ lote_id: LOTE, variedad_id: V1, activo: true }]
  )
})

test('administración usa los permisos existentes y las asociaciones no son accesibles directamente', async () => {
  const permisos = (
    await db.query(`select
    has_function_privilege('anon','admin_guardar_lote_variedades(uuid,varchar,varchar,uuid,uuid[],boolean)','EXECUTE') as admin,
    has_function_privilege('authenticated','admin_guardar_lote_variedades(uuid,varchar,varchar,uuid,uuid[],boolean)','EXECUTE') as integracion,
    has_function_privilege('anon','obtener_cache_operativa_legacy(varchar)','EXECUTE') as legacy,
    has_table_privilege('anon','lote_variedades','SELECT') as tabla
  `)
  ).rows[0]
  assert.deepEqual(permisos, {
    admin: false,
    integracion: true,
    legacy: false,
    tabla: false
  })
  await db.exec("set scc.test.integracion = 'false'")
  await assert.rejects(guardar([V1, V2]), /Integración no autorizada/)
  await db.exec("set scc.test.integracion = 'true'")
})

test('un lote admite varias variedades y deduplica UUID repetidos', async () => {
  const resultado = await guardar([V1, V2, V2])
  assert.equal(resultado.lote.id, LOTE)
  assert.deepEqual(
    new Set(resultado.lote.variedades.map((v) => v.id)),
    new Set([V1, V2])
  )
  assert.equal((await db.query('select count(*)::int n from lotes')).rows[0].n, 1)
  const natural = await guardar([V1, V2], { id: null })
  assert.equal(natural.lote.id, LOTE)
})

test('rechaza conjuntos vacíos, UUID inexistentes e inactivos sin actualizar parcialmente el lote', async () => {
  await assert.rejects(guardar([]), /al menos una variedad/)
  await assert.rejects(guardar([null]), /al menos una variedad/)
  await assert.rejects(guardar([crypto.randomUUID()]), /no existe/)
  await assert.rejects(guardar([V1, V3]), /no está activa/)
  assert.equal(
    (await db.query('select count(*)::int n from lote_variedades where activo')).rows[0]
      .n,
    2
  )
})

test('la caché conserva trabajadores, tickets y fecha e incluye ambas variedades bajo un solo lote', async () => {
  const cache = await call('select obtener_cache_operativa($1::varchar) as resultado', [
    operador
  ])
  assert.equal(cache.sincronizado_en, '2026-10-11T12:00:00Z')
  assert.equal(cache.trabajadores[0].dni, '81000001')
  assert.deepEqual(cache.tickets, [])
  await guardarCache(cache)
  await seleccionarCampaniaLocal(CAMP)
  const lotes = await obtenerLotes()
  assert.equal(lotes.length, 1)
  assert.deepEqual(new Set(lotes[0].variedades.map((v) => v.id)), new Set([V1, V2]))
  await assert.rejects(
    call('select obtener_cache_operativa($1::varchar) as resultado', ['00000000']),
    /no autorizado/
  )
})

test('no elige implícitamente una variedad en lotes múltiples y conserva cachés anteriores', () => {
  const lote = {
    variedades: [
      { id: V1, nombre: 'Ventura' },
      { id: V2, nombre: 'Biloxi' }
    ]
  }
  assert.throws(() => seleccionarVariedadLote(lote, ''), /Seleccione una variedad/)
  assert.throws(() => seleccionarVariedadLote(lote, V3), /Seleccione una variedad/)
  assert.equal(seleccionarVariedadLote(lote, V2).nombre, 'Biloxi')
  assert.deepEqual(seleccionarVariedadLote({ variedad: 'Ventura' }, ''), {
    id: null,
    nombre: 'Ventura'
  })
})

let nuevaSesion
test('la selección offline persiste en la sesión y en la operación que llegará al servidor', async () => {
  nuevaSesion = crypto.randomUUID()
  await iniciarSesionOffline(
    {
      id: nuevaSesion,
      lote_id: LOTE,
      variedad_id: V2,
      variedad: 'Biloxi',
      dni_jabero: '81000001',
      dni_operador: operador,
      estado: 'ACTIVA'
    },
    operador
  )
  assert.equal((await obtenerSesionLocal(nuevaSesion)).variedad_id, V2)
  const op = (await obtenerColaCompleta()).find(
    (item) => item.payload.sesionId === nuevaSesion
  )
  assert.equal(op.payload.variedadId, V2)
  const resultado = await iniciar(op.payload.sesionId, op.payload.variedadId)
  assert.equal(resultado.variedad_id, V2)
  assert.equal(resultado.variedad, 'Biloxi')
})

test('el servidor rechaza variedades ajenas, inactivas y otra sesión activa del mismo jabero', async () => {
  await assert.rejects(
    iniciar(crypto.randomUUID(), V3),
    /no está activa o no pertenece/
  )
  await assert.rejects(
    iniciar(crypto.randomUUID(), crypto.randomUUID()),
    /no está activa o no pertenece/
  )
  await assert.rejects(iniciar(crypto.randomUUID(), V1), /ya tiene una sesión/)
  await assert.rejects(
    iniciar(crypto.randomUUID(), V1, LOTE, '81000001', '00000000'),
    /no autorizado/
  )
})

test('los reintentos son idempotentes y no permiten reutilizar el UUID con otra variedad o jabero', async () => {
  assert.equal((await iniciar(nuevaSesion)).sesion_id, nuevaSesion)
  assert.equal(
    (
      await db.query('select count(*)::int n from sesiones_lectura where id=$1', [
        nuevaSesion
      ])
    ).rows[0].n,
    1
  )
  await assert.rejects(iniciar(nuevaSesion, V1), /otros datos/)
  await assert.rejects(iniciar(nuevaSesion, V2, LOTE, '81000002'), /otros datos/)
})

test('los reportes de PWA y Sheets separan producción por variedad sin contar dos veces el lote', async () => {
  await db.query(
    `insert into lecturas_jaba (sesion_id,asignacion_ticket_id)
    values ($1,$2),($1,$2),($1,$2)`,
    [nuevaSesion, V1]
  )
  const pwa = await call('select obtener_produccion_lotes($1::varchar) as resultado', [
    operador
  ])
  const sheets = await call('select admin_obtener_produccion_lotes() as resultado')
  assert.deepEqual(pwa.produccion, sheets.produccion)
  assert.deepEqual(
    pwa.produccion.map((fila) => [fila.variedad, fila.total_jabas]),
    [
      ['Biloxi', 3],
      ['Ventura', 2]
    ]
  )
  assert.deepEqual(resumirProduccionLotes(normalizarProduccionLotes(pwa).produccion), {
    lotes: 1,
    jabas: 5
  })
})

test('el administrador antiguo no puede borrar múltiples variedades por accidente', async () => {
  await assert.rejects(
    call(
      'select admin_guardar_lote($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid,true) as resultado',
      [LOTE, 'L1', 'Norte', CAMP, V1]
    ),
    /Actualice Apps Script/
  )
})

test('retirar una variedad conserva las sesiones y producción, y bloquea nuevas asignaciones', async () => {
  await db.query("update sesiones_lectura set estado='CERRADA' where id=$1", [
    nuevaSesion
  ])
  await guardar([V1])
  const lv = (
    await db.query(
      'select activo from lote_variedades where lote_id=$1 and variedad_id=$2',
      [LOTE, V2]
    )
  ).rows[0]
  assert.equal(lv.activo, false)
  assert.equal((await iniciar(nuevaSesion, V2)).variedad, 'Biloxi')
  await assert.rejects(
    iniciar(crypto.randomUUID(), V2),
    /no está activa o no pertenece/
  )
  const reporte = await call(
    'select obtener_produccion_lotes($1::varchar) as resultado',
    [operador]
  )
  assert.equal(
    reporte.produccion.find((fila) => fila.variedad_id === V2).total_jabas,
    3
  )
  await assert.rejects(
    db.query('delete from lote_variedades where lote_id=$1 and variedad_id=$2', [
      LOTE,
      V2
    ]),
    /foreign key/
  )
})

test('las operaciones pendientes con la firma antigua siguen usando la variedad original', async () => {
  const id = crypto.randomUUID()
  const resultado = await call(
    'select iniciar_sesion_lectura($1::varchar,$2::varchar,$3::uuid,$4::uuid) as resultado',
    [operador, '81000001', LOTE, id]
  )
  assert.equal(resultado.variedad_id, V1)
  assert.equal(
    (await db.query('select variedad_id from sesiones_lectura where id=$1', [id]))
      .rows[0].variedad_id,
    V1
  )
})

test('no permite mover producción histórica a otra campaña', async () => {
  const otra = crypto.randomUUID()
  await db.query(
    "insert into campanias(id,codigo,nombre,estado) values($1,'OTRA','Otra','ACTIVA')",
    [otra]
  )
  await assert.rejects(
    guardar([V1], { campania: otra }),
    /campaña de un lote con sesiones/
  )
})

test('crea lotes con varias variedades y conserva la identidad natural sin permitir códigos duplicados', async () => {
  const nuevo = await guardar([V1, V2], { id: null, codigo: 'L2' })
  assert.equal(nuevo.accion, 'CREADO')
  assert.equal(nuevo.lote.variedades.length, 2)
  const repetido = await guardar([V1, V2], { id: null, codigo: 'L2' })
  assert.equal(repetido.lote.id, nuevo.lote.id)
  assert.equal(repetido.accion, 'ACTUALIZADO')
  await assert.rejects(
    guardar([V1, V2], { id: nuevo.lote.id, codigo: 'L1' }),
    /Ya existe otro lote/
  )
  assert.equal(
    (await db.query('select codigo from lotes where id=$1', [nuevo.lote.id])).rows[0]
      .codigo,
    'L2'
  )
})

test('editar metadatos conserva variedades históricas inactivas y campañas cerradas', async () => {
  await db.query('update variedades set activo=false where id=$1', [V1])
  await guardar([V1])
  await db.query("update campanias set estado='CERRADA' where id=$1", [CAMP])
  const resultado = await guardar([V1])
  assert.equal(resultado.lote.campania_estado, 'CERRADA')
  assert.equal(resultado.lote.variedades[0].activo, false)
  await assert.rejects(
    guardar([V1], { id: null, codigo: 'NUEVO' }),
    /campaña seleccionada no está activa/
  )
})
