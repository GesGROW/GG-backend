import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP, SUP, COSECHADOR } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const read = (name) =>
  readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const T = '00000000-0000-4000-8000-000000000002'
const C = '00000000-0000-4000-8000-000000000003'
const W = '00000000-0000-4000-8000-000000000004'
let antes, historico, recibos
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    'create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;'
  )
  await db.exec(read('202610140600_harvest_cutover.sql'))
  await db.exec(read('202610140610_harvest_proyecciones.sql'))
  const lote = crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    lote,
    A
  ])
  await db.query(
    "insert into harvest_tickets(codigo,lote_id,campania_id) values('HISTORICO-F61',$1,$2)",
    [lote, A]
  )
  await call(
    'harvest_asignar_lote_tickets',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [A, OP, COSECHADOR, 'HISTORICO-F61', crypto.randomUUID()]
  )
  await db.query(
    'insert into harvest_cutovers(campania_id,version,activado_en,activado_por) values($1,1,now(),$2)',
    [A, SUP]
  )
  const sesion = (
    await db.query(
      'select s.id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1',
      [A]
    )
  ).rows[0].id
  await call(
    'harvest_registrar_cosecha',
    ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid'],
    [
      A,
      OP,
      sesion,
      'HISTORICO-F61',
      crypto.randomUUID(),
      '2026-10-14T12:00:00Z',
      crypto.randomUUID()
    ]
  )
  historico = (
    await db.query('select to_jsonb(r) datos from harvest_registros_cosecha r')
  ).rows
  recibos = (
    await db.query('select id,resultado from operaciones_pda_procesadas order by id')
  ).rows
  antes = (await db.query('select id,dni from trabajadores order by id')).rows
  // Los RPC base desplegados pueden retornar TABLE/OUT además de JSONB/void.
  await db.exec(`create function public.fixture_contexto_tabla(p_campania_id uuid)
    returns table(tenant_id uuid) language plpgsql as $$
    begin return query select public.platform_tenant_operativo(); return; end $$;`)
  await db.exec(read('202610140700_platform_tenants.sql'))
})
after(() => db.close())
const call = async (name, types, args) =>
  (
    await db.query(
      `select ${name}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) resultado`,
      args
    )
  ).rows[0].resultado

test('migra datos SCC completos al Tenant inicial sin cambiar UUID/DNI', async () => {
  assert.deepEqual(
    (await db.query('select id,dni from trabajadores order by id')).rows,
    antes
  )
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(r)-'tenant_id' datos from harvest_registros_cosecha r"
      )
    ).rows,
    historico
  )
  assert.deepEqual(
    (await db.query('select id,resultado from operaciones_pda_procesadas order by id'))
      .rows,
    recibos
  )
  assert.equal(
    (await db.query('select codigo from tenants where id=$1', [TENANT_INICIAL_ID]))
      .rows[0].codigo,
    'SCC'
  )
  const tablas = (
    await db.query(
      "select table_name from information_schema.columns where table_schema='public' and column_name='tenant_id'"
    )
  ).rows
  assert.ok(tablas.length >= 17)
  for (const { table_name } of tablas)
    assert.equal(
      (
        await db.query(
          `select count(*)::integer n from ${table_name} where tenant_id is distinct from $1`,
          [TENANT_INICIAL_ID]
        )
      ).rows[0].n,
      0,
      table_name
    )
})

test('crea EmpresaCliente y asocia campaña y trabajador; mismo DNI entre tenants', async () => {
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa B','EMPRESA-B')",
    [T]
  )
  await db.query(
    "insert into campanias(id,tenant_id,codigo,nombre,estado) values($1,$2,'CAMP-ARA-2026','Campaña B','ACTIVA')",
    [C, T]
  )
  await db.query(
    "insert into trabajadores(id,tenant_id,dni,nombres,apellidos,activo) values($1,$2,$3,'Otra','Supervisora',true)",
    [W, T, OP]
  )
  assert.equal(
    (await db.query('select count(*)::integer n from trabajadores where dni=$1', [OP]))
      .rows[0].n,
    2
  )
  await assert.rejects(
    db.query(
      "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,$2,'Duplicada','',true)",
      [T, OP]
    ),
    /trabajadores_tenant_dni_key/
  )
  assert.equal(
    (await db.query('select tenant_id from campanias where id=$1', [C])).rows[0]
      .tenant_id,
    T
  )
})

test('FK compuestas rechazan Campaña A → Trabajador B y cambios de ownership', async () => {
  await assert.rejects(
    db.query(
      "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'COSECHADOR',true)",
      [W, A]
    ),
    /platform_tenant_fk/
  )
  await assert.rejects(
    db.query(
      "insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,'COSECHADOR',true)",
      [TENANT_INICIAL_ID, W, C]
    ),
    /cross-tenant/
  )
  await assert.rejects(
    db.query('update trabajadores set tenant_id=$1 where id=$2', [T, SUP]),
    /inmutable/
  )
})

test('Harvest resuelve el mismo DNI dentro de cada tenant y restaura contexto', async () => {
  await db.query('insert into usuarios_app(trabajador_id,activo) values($1,true)', [W])
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)",
    [W, C]
  )
  const lote = crypto.randomUUID()
  await db.query('insert into harvest_lotes_tickets(id,campania_id) values($1,$2)', [
    lote,
    C
  ])
  await db.query(
    "insert into harvest_tickets(codigo,lote_id,campania_id) values('TENANT-B-TICKET',$1,$2)",
    [lote, C]
  )
  await assert.rejects(
    db.query(
      'insert into harvest_asignaciones_lote(lote_id,campania_id,trabajador_id,operacion_id) values($1,$2,$3,$4)',
      [lote, C, SUP, crypto.randomUUID()]
    ),
    /platform_tenant_fk/
  )
  const r = await call(
    'harvest_asignar_lote_tickets',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [C, OP, COSECHADOR, 'TENANT-B-TICKET', crypto.randomUUID()]
  )
  assert.equal(r.asignacion.tenant_id, T)
  assert.equal(
    (
      await db.query('select tenant_id from trabajadores where id=$1', [
        r.asignacion.trabajador_id
      ])
    ).rows[0].tenant_id,
    T
  )
  await assert.rejects(
    call(
      'harvest_asignar_lote_tickets',
      ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
      [A, OP, COSECHADOR, 'TENANT-B-TICKET', crypto.randomUUID()]
    ),
    /campania_incorrecta/
  )
  assert.equal(
    (await db.query('select platform_tenant_operativo() id')).rows[0].id,
    TENANT_INICIAL_ID
  )
})

test('cache, snapshot, login provisional, reportes y comandos legacy siguen funcionando', async () => {
  const login = await call('validar_operador_campanias', ['varchar'], [OP])
  assert.ok(login.campanias.every((c) => c.tenant_id === TENANT_INICIAL_ID))
  const cache = await call(
    'obtener_cache_operativa_campania',
    ['uuid', 'varchar'],
    [A, OP]
  )
  assert.equal(cache.campania.tenant_id, TENANT_INICIAL_ID)
  assert.ok(cache.trabajadores.every((w) => w.tenant_id === TENANT_INICIAL_ID))
  const snapshot = await call('harvest_obtener_snapshot', ['uuid', 'varchar'], [C, OP])
  assert.equal(snapshot.tenantId, T)
  assert.ok(snapshot.identidadesTrabajadores.every((w) => w.tenantId === T))
  const legacy = await call(
    'asignar_ticket_campania',
    ['uuid', 'varchar', 'varchar', 'varchar', 'uuid'],
    [B, OP, '87654320', 'LEGACY-F61', crypto.randomUUID()]
  )
  assert.ok(legacy)
  assert.ok(
    await call(
      'obtener_resumen_campania_campania',
      ['uuid', 'varchar', 'text'],
      [A, OP, 'America/Lima']
    )
  )
})

test('cosecha admite únicamente sesión, jabero, trabajador y tickets del mismo Tenant', async () => {
  const variedad = crypto.randomUUID(),
    lote = crypto.randomUUID(),
    sesion = crypto.randomUUID()
  await db.query(
    "insert into variedades(id,tenant_id,nombre) values($1,$2,'Variedad B')",
    [variedad, T]
  )
  await db.query(
    "insert into lotes(id,campania_id,variedad_id,codigo) values($1,$2,$3,'LB')",
    [lote, C, variedad]
  )
  await db.query('insert into lote_variedades(lote_id,variedad_id) values($1,$2)', [
    lote,
    variedad
  ])
  await call(
    'registrar_jabero_campania',
    ['uuid', 'varchar', 'varchar', 'uuid'],
    [C, OP, '81990400', crypto.randomUUID()]
  )
  await call(
    'iniciar_sesion_lectura_campania',
    ['uuid', 'varchar', 'varchar', 'uuid', 'uuid', 'uuid'],
    [C, OP, '81990400', lote, sesion, variedad]
  )
  await db.query(
    'insert into harvest_cutovers(campania_id,version,activado_en,activado_por) values($1,1,now(),$2)',
    [C, W]
  )
  const ajena = (
    await db.query(
      'select s.id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1',
      [A]
    )
  ).rows[0].id
  const tipos = ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid']
  await assert.rejects(
    call('harvest_registrar_cosecha', tipos, [
      C,
      OP,
      ajena,
      'TENANT-B-TICKET',
      crypto.randomUUID(),
      '2026-10-14T12:00:00Z',
      crypto.randomUUID()
    ]),
    /sesion_invalida/
  )
  const r = await call('harvest_registrar_cosecha', tipos, [
    C,
    OP,
    sesion,
    'TENANT-B-TICKET',
    crypto.randomUUID(),
    '2026-10-14T12:00:00Z',
    crypto.randomUUID()
  ])
  assert.equal(r.registro.tenant_id, T)
  assert.equal(r.registro.sesion_id, sesion)
  const snapshot = await call('harvest_obtener_snapshot', ['uuid', 'varchar'], [C, OP])
  for (const campo of [
    'lotesDeTickets',
    'tickets',
    'asignacionesDeLote',
    'registrosCosecha'
  ])
    assert.ok(snapshot[campo].every((f) => f.tenantId === T))
})

test('F6.1 no usa proconfig scc y restaura contextos anidados, retornos anticipados y errores', async () => {
  assert.deepEqual(
    (
      await db.query(`
    select p.oid::regprocedure::text firma, valor
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral unnest(p.proconfig) valor
    where n.nspname='public' and valor like 'scc.%'
  `)
    ).rows,
    []
  )
  await db.exec('begin')
  try {
    await db.query(
      "select set_config('scc.campania_id',$1,true),set_config('scc.hoja_campania_id',$2,true)",
      [B, A]
    )
    const contexto = async () =>
      (
        await db.query(
          "select current_setting('scc.campania_id',true) campania,current_setting('scc.hoja_campania_id',true) hoja"
        )
      ).rows[0]
    const anterior = await contexto()
    assert.equal(
      (await db.query('select * from fixture_contexto_tabla($1)', [C])).rows[0]
        .tenant_id,
      T
    )
    assert.deepEqual(await contexto(), anterior)
    // Void y llamadas anidadas resuelven por la campaña explícita, no por la GUC previa.
    await call('autorizar_operador_campania', ['varchar', 'uuid'], [OP, C])
    assert.deepEqual(await contexto(), anterior)
    const cache = await call(
      'obtener_cache_operativa_campania',
      ['uuid', 'varchar'],
      [C, OP]
    )
    assert.equal(cache.campania.tenant_id, T)
    assert.deepEqual(await contexto(), anterior)
    const recibo = (
      await db.query(
        "select id from operaciones_pda_procesadas where tipo='REGISTRAR_JABA' and resultado->'registro'->>'campania_id'=$1",
        [C]
      )
    ).rows[0].id
    const registro = (
      await db.query('select * from harvest_registros_cosecha where operacion_id=$1', [
        recibo
      ])
    ).rows[0]
    // El reintento retorna el recibo antes de recorrer tickets o sesión.
    await call(
      'harvest_registrar_cosecha',
      ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid'],
      [
        C,
        OP,
        registro.sesion_id,
        registro.codigo_ticket,
        registro.id,
        registro.fecha_hora,
        recibo
      ]
    )
    assert.deepEqual(await contexto(), anterior)
    // La excepción se captura en el mismo comando SQL: no usar ROLLBACK como
    // sustituto de verificar que el wrapper devuelve el contexto al llamador.
    await db.query(
      `do $test$ begin
      begin perform public.obtener_cache_operativa_campania($1::uuid,'00000000'::varchar);
      exception when others then null; end;
    end $test$;`.replace('$1::uuid', "'" + C + "'::uuid")
    )
    assert.deepEqual(await contexto(), anterior)
  } finally {
    await db.exec('rollback')
  }
})

test('F6.1 se reejecuta sobre F5.2–F5.6 sin duplicar ni reasignar datos o constraints', async () => {
  const snapshot = async () => {
    const tablas = (
      await db.query(
        "select table_name from information_schema.columns where table_schema='public' and column_name='tenant_id' order by table_name"
      )
    ).rows
    const datos = {
      tenants: (await db.query('select * from tenants order by id')).rows
    }
    for (const { table_name } of tablas)
      datos[table_name] = (
        await db.query(
          `select to_jsonb(t) fila from ${table_name} t order by to_jsonb(t)::text`
        )
      ).rows
    return {
      datos,
      constraints: (
        await db.query(
          "select c.conrelid::regclass::text tabla,c.conname,pg_get_constraintdef(c.oid) definicion from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' order by tabla,c.conname"
        )
      ).rows,
      funciones: (
        await db.query(
          "select p.oid::regprocedure::text firma,pg_get_functiondef(p.oid) definicion from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by firma"
        )
      ).rows
    }
  }
  const antes = await snapshot()
  await db.exec(read('202610140700_platform_tenants.sql'))
  assert.deepEqual(await snapshot(), antes)
  const cache = await call(
    'obtener_cache_operativa_campania',
    ['uuid', 'varchar'],
    [C, OP]
  )
  assert.equal(cache.campania.tenant_id, T)
})
