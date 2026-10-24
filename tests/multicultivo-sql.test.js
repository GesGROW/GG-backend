import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const db = new PGlite()
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002'
const CULTIVO_B = 'a1000000-0000-4000-8000-000000000002'
const VA = '11111111-1111-4111-8111-111111111111'
const VB = '11111111-1111-4111-8111-000000000002'
const LA = '22222222-2222-4222-8222-222222222222'
const LB = '22222222-2222-4222-8222-000000000002'
const supervisor = '47480378'
const otro = '81000001'
const compartido = '81000002'
const cosechador = '81000003'
const call = async (query, args = []) => (await db.query(query, args)).rows[0].resultado
const login = (dni) =>
  call('select validar_operador_campanias($1::varchar) resultado', [dni])
const cache = (campania, dni = supervisor) =>
  call('select obtener_cache_operativa_campania($1::uuid,$2::varchar) resultado', [
    campania,
    dni
  ])
const jabero = (campania, dni, id = crypto.randomUUID(), op = supervisor) =>
  call(
    'select registrar_jabero_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid) resultado',
    [campania, op, dni, id]
  )
const ticket = (campania, codigo, id = crypto.randomUUID()) =>
  call(
    'select asignar_ticket_campania($1::uuid,$2::varchar,$3::varchar,$4::varchar,$5::uuid) resultado',
    [campania, supervisor, cosechador, codigo, id]
  )
const iniciar = (
  campania,
  lote,
  variedad,
  dni = compartido,
  id = crypto.randomUUID()
) =>
  call(
    'select iniciar_sesion_lectura_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid,$6::uuid) resultado',
    [campania, supervisor, dni, lote, id, variedad]
  )
const lectura = (
  campania,
  sesion,
  codigo,
  id = crypto.randomUUID(),
  op = crypto.randomUUID()
) =>
  call(
    'select registrar_lectura_jaba_campania($1::uuid,$2::varchar,$3::uuid,$4::varchar,$5::uuid,$6::text,$7::uuid) resultado',
    [campania, supervisor, sesion, codigo, id, new Date().toISOString(), op]
  )

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  for (const name of [
    '20260930_admin_campanias.sql',
    '20261001_consistencia_acceso_app.sql',
    '202610030100_acceso_diario_jaberos.sql'
  ])
    await db.exec(read('../supabase/migrations/' + name))
  await db.exec(read('./fixtures/multicultivo.sql'))
  for (const name of [
    '20260930_admin_variedades.sql',
    '20260928_iniciar_sesion_lectura_pda.sql',
    '20260929_idempotencia_cola_pda.sql',
    '202610020100_jabero_provisional.sql',
    '202610010230_cosechador_provisional_asignar_ticket.sql',
    '20260930_admin_lotes.sql',
    '20260930_resumen_campania.sql',
    '202610020200_restaurar_produccion_diaria.sql',
    '202610030200_ranking_por_periodo.sql',
    '202610110100_lotes_variedades.sql',
    '202610110300_cultivos_campanias.sql'
  ])
    await db.exec(read('../supabase/migrations/' + name))
  // El reporte administrativo no se usa en este alcance; crear su dependencia
  // para aplicar la migración anterior completa de producción por variedad.
  await db.exec(`create function autorizar_integracion_reportes() returns void language plpgsql as $$
    begin perform autorizar_integracion_gestion_maestros(); end $$;`)
  await db.exec(
    read('../supabase/migrations/202610110200_produccion_lote_variedad.sql')
  )
  // Reproduce un RPC desplegado sin la expresión c.estado='ACTIVA' esperada.
  // La migración debe funcionar y la PWA nunca debe delegar en este legacy.
  await db.exec(`create or replace function obtener_cache_operativa_legacy(p_dni_operador varchar)
    returns jsonb language plpgsql security definer as $$
    begin raise exception 'La caché legacy no debe ejecutarse'; end $$;`)
  await db.exec(read('../supabase/migrations/202610110400_rpc_por_campania.sql'))
  await db.query(
    "insert into campanias(id,codigo,nombre,estado,cultivo_id) values($1,'MAND-2026','Mandarina 2026','ACTIVA',$2)",
    [B, CULTIVO_B]
  )
  await db.query('insert into variedades(id,nombre,cultivo_id) values($1,$2,$3)', [
    VB,
    'W. Murcott',
    CULTIVO_B
  ])
  await db.query(
    'insert into lotes(id,codigo,nombre,campania_id,variedad_id) values($1,$2,$3,$4,$5)',
    [LB, 'L1', 'Sur', B, VB]
  )
  await db.query('insert into lote_variedades(lote_id,variedad_id) values($1,$2)', [
    LB,
    VB
  ])
  // Un supervisor compartido y otro exclusivo de mandarina.
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) select id,$1,'SUPERVISORA',true from trabajadores where dni=$2",
    [B, supervisor]
  )
  await db.query(
    "insert into trabajadores(dni,nombres,apellidos,activo) values($1,'Rosa','Torres',true)",
    [otro]
  )
  await db.query(
    'insert into usuarios_app(trabajador_id,activo) select id,true from trabajadores where dni=$1',
    [otro]
  )
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) select id,$1,'SUPERVISORA',true from trabajadores where dni=$2",
    [B, otro]
  )
})
after(() => db.close())

test('permite una campaña activa de cada cultivo, pero rechaza dos del mismo cultivo', async () => {
  assert.equal(
    (await db.query("select count(*)::int n from campanias where estado='ACTIVA'"))
      .rows[0].n,
    2
  )
  await assert.rejects(
    db.query(
      "insert into campanias(codigo,nombre,estado) values('ARA-2','Segunda','ACTIVA')"
    ),
    /unique/
  )
  assert.equal(
    (await db.query('select cultivo_id from variedades where id=$1', [VA])).rows[0]
      .cultivo_id,
    'a1000000-0000-4000-8000-000000000001'
  )
})
test('el DNI recibe solo sus campañas activas, sin duplicar opciones por rol', async () => {
  assert.equal((await login(supervisor)).campanias.length, 2)
  assert.deepEqual(
    (await login(otro)).campanias.map((c) => c.id),
    [B]
  )
  await assert.rejects(login('00000000'), /no autorizado/)
})

test('los maestros existentes permiten editar mandarina con arándanos activo y repetir nombres entre cultivos', async () => {
  const campaña = await call(
    "select admin_guardar_campania($1::uuid,'MAND-2026'::varchar,'Mandarina 2026'::varchar,current_date,null::date,'ACTIVA'::estado_campania) resultado",
    [B]
  )
  assert.equal(campaña.campania.id, B)
  const nombreArandano = (
    await db.query('select nombre from variedades where id=$1', [VA])
  ).rows[0].nombre
  const variedad = await call(
    'select admin_guardar_variedad($1::uuid,$2::varchar,true) resultado',
    [VB, nombreArandano]
  )
  assert.equal(variedad.variedad.id, VB)
  await call('select admin_guardar_variedad($1::uuid,$2::varchar,true) resultado', [
    VB,
    'W. Murcott'
  ])
})
test('la caché del mismo supervisor separa lotes y variedades por cultivo', async () => {
  const a = await cache(A)
  const b = await cache(B)
  assert.equal(a.campania.id, A)
  assert.equal(b.campania.id, B)
  assert.deepEqual(
    a.lotes.map((l) => l.lote_id),
    [LA]
  )
  assert.deepEqual(
    b.lotes.map((l) => l.lote_id),
    [LB]
  )
  assert.equal(b.lotes[0].variedades[0].nombre, 'W. Murcott')
  assert.equal(b.campania.cultivo_nombre, 'Mandarina')
  // La fecha persistida usa la zona horaria de PostgreSQL; no el día UTC de JS.
  const inicio = (
    await db.query('select fecha_inicio::text from campanias where id=$1', [B])
  ).rows[0].fecha_inicio
  assert.equal(b.campania.fecha_inicio, inicio)
  assert.ok(b.sincronizado_en)
  assert.ok(
    b.trabajadores.some((t) => t.dni === otro && t.roles.includes('SUPERVISORA'))
  )
  assert.ok(!a.trabajadores.some((t) => t.dni === otro))
  await assert.rejects(cache(A, otro), /no está autorizado/)
  await assert.rejects(
    call('select obtener_cache_operativa($1::varchar) resultado', [supervisor]),
    /indicar la campaña/
  )
})

test('la migración funciona con una caché legacy sin el patrón esperado y conserva sus permisos privados', async () => {
  await assert.rejects(
    call('select obtener_cache_operativa_legacy($1::varchar) resultado', [supervisor]),
    /legacy no debe ejecutarse/
  )
  assert.equal((await cache(B)).campania.id, B)
  const { rows } = await db.query(
    "select has_function_privilege('anon','obtener_cache_operativa_legacy(varchar)','EXECUTE') legacy, has_function_privilege('anon','obtener_cache_operativa(varchar)','EXECUTE') cache"
  )
  assert.deepEqual(rows[0], { legacy: false, cache: true })
})
test('un jabero puede participar en ambas campañas con un solo trabajador y usuario', async () => {
  await jabero(A, compartido)
  await jabero(B, compartido)
  assert.equal((await login(compartido)).campanias.length, 2)
  assert.equal(
    (
      await db.query('select count(*)::int n from trabajadores where dni=$1', [
        compartido
      ])
    ).rows[0].n,
    1
  )
  await db.query(
    `update trabajador_campania_rol set fecha_asignacion_jabero=(clock_timestamp() at time zone 'America/Lima')::date-1
    where campania_id=$1 and trabajador_id=(select id from trabajadores where dni=$2)`,
    [A, compartido]
  )
  assert.deepEqual(
    (await login(compartido)).campanias.map((c) => c.id),
    [B]
  )
  await jabero(A, compartido)
})
test('tickets y personal provisional se asignan a la campaña explícita', async () => {
  const a = await ticket(A, 'T-ARA')
  const b = await ticket(B, 'T-MAND')
  assert.equal(a.campania_id, A)
  assert.equal(b.campania_id, B)
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from trabajador_campania_rol r join trabajadores t on t.id=r.trabajador_id where t.dni=$1 and r.rol='COSECHADOR'",
        [cosechador]
      )
    ).rows[0].n,
    2
  )
  assert.deepEqual(
    (await cache(A)).tickets.map((t) => t.codigo_ticket),
    ['T-ARA']
  )
  assert.deepEqual(
    (await cache(B)).tickets.map((t) => t.codigo_ticket),
    ['T-MAND']
  )
})
test('un UUID de operación no puede trasladarse a otra campaña', async () => {
  const id = crypto.randomUUID()
  const primero = await jabero(A, '81000004', id)
  assert.deepEqual(await jabero(A, '81000004', id), primero)
  await assert.rejects(jabero(B, '81000004', id), /otra campaña/)
})
let sa, sb
test('el mismo jabero puede tener sesiones en dos campañas y los límites se validan en servidor', async () => {
  sa = (await iniciar(A, LA, VA)).sesion_id
  sb = (await iniciar(B, LB, VB)).sesion_id
  await assert.rejects(iniciar(A, LB, VB), /lote no pertenece/)
  await assert.rejects(iniciar(A, LA, VB), /variedad no está activa o no pertenece/)
  await assert.rejects(lectura(A, sb, 'T-ARA'), /sesión no pertenece/)
  await assert.rejects(lectura(A, sa, 'T-MAND'), /ticket no pertenece/)
})
test('lecturas y todos los reportes se mantienen separados entre cultivos', async () => {
  await lectura(A, sa, 'T-ARA')
  await lectura(B, sb, 'T-MAND')
  await lectura(B, sb, 'T-MAND')
  for (const [campania, total] of [
    [A, 1],
    [B, 2]
  ]) {
    const lotes = await call(
      'select obtener_produccion_lotes_campania($1::uuid,$2::varchar) resultado',
      [campania, supervisor]
    )
    assert.equal(lotes.campania.id, campania)
    assert.equal(lotes.produccion[0].total_jabas, total)
    const resumen = await call(
      'select obtener_resumen_campania_campania($1::uuid,$2::varchar,$3::text) resultado',
      [campania, supervisor, 'America/Lima']
    )
    assert.equal(resumen.resumen.total_jabas, total)
    const ranking = await call(
      'select obtener_ranking_cosechadores_periodo_campania($1::uuid,$2::varchar,$3::text) resultado',
      [campania, supervisor, 'CAMPANIA']
    )
    assert.equal(ranking.ranking[0].total_jabas, total)
    const diaria = await call(
      'select obtener_produccion_diaria_campania($1::uuid,$2::varchar,$3::text) resultado',
      [campania, supervisor, 'America/Lima']
    )
    assert.equal(diaria.produccion[0].total_jabas, total)
  }
})
test('no permite asociar variedades de otro cultivo ni cambiar el cultivo del histórico', async () => {
  await assert.rejects(
    db.query('update lotes set campania_id=$1 where id=$2', [B, LA]),
    /variedades del lote/
  )
  await assert.rejects(
    db.query('update lotes set variedad_id=$1 where id=$2', [VB, LA]),
    /variedades del lote/
  )
  await assert.rejects(
    db.query('insert into lote_variedades(lote_id,variedad_id) values($1,$2)', [
      LA,
      VB
    ]),
    /pertenecer al cultivo/
  )
  await assert.rejects(
    db.query('update variedades set cultivo_id=$1 where id=$2', [CULTIVO_B, VA]),
    /cambiar el cultivo/
  )
  await assert.rejects(
    db.query('update campanias set cultivo_id=$1 where id=$2', [CULTIVO_B, A]),
    /cambiar el cultivo/
  )
})
test('restaura contexto después de cada RPC y protege helpers internos', async () => {
  assert.equal(
    (await db.query("select nullif(current_setting('scc.campania_id',true),'') id"))
      .rows[0].id,
    null
  )
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','autorizar_operador_campania(varchar,uuid)','EXECUTE') permiso"
      )
    ).rows[0].permiso,
    false
  )
  await assert.rejects(
    call('select obtener_produccion_lotes_campania($1::uuid,$2::varchar) resultado', [
      A,
      otro
    ]),
    /no está autorizado/
  )
})
