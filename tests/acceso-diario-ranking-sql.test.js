import { crearSupabaseBackend } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { fechaOperativa } from '@gesgrow/core/contexts/identity-access/domain/fechaOperativa.js'
import { obtenerRankingCosechadores } from '@gesgrow/core/contexts/harvest/application/reports/rankingCosechadores.js'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
const migration = (name) => read('../supabase/migrations/' + name)
const db = new PGlite()
const CAMP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const supervisor = '47480378'
const jabero = '81000001'
const login = async (dni = jabero) =>
  (
    await db.query('select public.validar_operador_diario($1::varchar) as resultado', [
      dni
    ])
  ).rows[0].resultado
const registrar = async (id = crypto.randomUUID()) =>
  (
    await db.query(
      'select public.registrar_jabero($1::varchar,$2::varchar,$3::uuid) as resultado',
      [supervisor, jabero, id]
    )
  ).rows[0].resultado
let rol

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  await db.exec(migration('20261001_consistencia_acceso_app.sql'))
  await db.exec(migration('202610020100_jabero_provisional.sql'))
  await db.exec(migration('202610030100_acceso_diario_jaberos.sql'))
  await db.exec(`
    create table asignaciones_ticket (id uuid primary key, campania_id uuid, cosechador_rol_id uuid);
    create table lecturas_jaba (
      id uuid primary key default gen_random_uuid(), asignacion_ticket_id uuid,
      fecha_hora timestamptz
    );
  `)
  await db.exec(migration('202610030200_ranking_por_periodo.sql'))
})
after(() => db.close())

test('SQL autoriza supervisor y jabero registrado hoy, preservando el DNI del RPC original', async () => {
  assert.equal((await login(supervisor)).dni, supervisor)
  rol = (await registrar()).rol_id
  const resultado = await login()
  assert.equal(resultado.dni, jabero)
  assert.equal(resultado.autorizado_para_fecha, fechaOperativa())
  const permisos = (
    await db.query(`select
    has_function_privilege('anon','public.validar_operador_base(varchar)','EXECUTE') as base,
    has_function_privilege('anon','public.autorizar_operador_del_dia(varchar)','EXECUTE') as interno,
    has_function_privilege('anon','public.validar_operador_diario(varchar)','EXECUTE') as diario
  `)
  ).rows[0]
  assert.deepEqual(permisos, { base: false, interno: false, diario: true })
})

test('SQL rechaza otro día aunque usuarios_app siga activo; una reasignación renueva el mismo rol', async () => {
  const idOperacion = crypto.randomUUID()
  await registrar(idOperacion)
  await db.query(
    `update trabajador_campania_rol
    set fecha_asignacion_jabero = (clock_timestamp() at time zone 'America/Lima')::date - 1
    where id = $1`,
    [rol]
  )
  await assert.rejects(login(), /asignado para el día de hoy/)
  await assert.rejects(
    db.query('select public.validar_operador($1::varchar)', [jabero]),
    /asignado para el día de hoy/
  )
  // Reintentar un recibo de ayer no equivale a una nueva asignación.
  await registrar(idOperacion)
  await assert.rejects(login(), /asignado para el día de hoy/)
  assert.equal((await registrar()).rol_id, rol)
  assert.equal((await login()).dni, jabero)
  await db.query('update trabajador_campania_rol set activo=false where id=$1', [rol])
  await assert.rejects(login(), /no autorizado/)
  await registrar()
})

test('ranking calcula hoy, semana desde lunes, mes y campaña según Lima con límites exclusivos', async () => {
  const ahora = (await db.query('select statement_timestamp() as ahora')).rows[0].ahora
  const [y, m, d] = fechaOperativa(new Date(ahora)).split('-').map(Number)
  const hoy = Date.UTC(y, m - 1, d, 5)
  const dia = 86400000
  const semana = hoy - ((new Date(hoy).getUTCDay() + 6) % 7) * dia
  const mes = Date.UTC(y, m - 1, 1, 5)
  const fechas = [
    hoy - 1,
    hoy,
    hoy + dia - 1,
    hoy + dia,
    semana - 1,
    mes - 1,
    mes - 400 * dia
  ]
  const asignacion = crypto.randomUUID()
  await db.query('insert into asignaciones_ticket values ($1,$2,$3)', [
    asignacion,
    CAMP,
    rol
  ])
  for (const fecha of fechas) {
    await db.query(
      'insert into lecturas_jaba (asignacion_ticket_id,fecha_hora) values ($1,$2)',
      [asignacion, new Date(fecha).toISOString()]
    )
  }
  const ajena = crypto.randomUUID()
  await db.query('insert into asignaciones_ticket values ($1,$2,$3)', [
    ajena,
    crypto.randomUUID(),
    rol
  ])
  await db.query(
    'insert into lecturas_jaba (asignacion_ticket_id,fecha_hora) values ($1,$2)',
    [ajena, new Date(hoy).toISOString()]
  )
  for (const [periodo, desde] of [
    ['HOY', hoy],
    ['SEMANA', semana],
    ['MES', mes],
    ['CAMPANIA', null]
  ]) {
    const resultado = await obtenerRankingCosechadores(
      supervisor,
      crearSupabaseBackend({
        rpc: async (name, args) => {
          assert.equal(name, 'obtener_ranking_cosechadores_periodo')
          const { rows } = await db.query(
            'select public.obtener_ranking_cosechadores_periodo($1::varchar,$2::text) as resultado',
            [args.p_dni_operador, args.p_periodo]
          )
          return { data: rows[0].resultado }
        }
      }).obtenerRankingCosechadores,
      periodo
    )
    const esperado =
      desde === null
        ? fechas.length
        : fechas.filter((f) => f >= desde && f < hoy + dia).length
    assert.equal(resultado.ranking[0].total_jabas, esperado, periodo)
    assert.equal(resultado.ranking[0].posicion, 1)
  }
  await assert.rejects(
    db.query("select public.obtener_ranking_cosechadores_periodo($1::varchar,'AYER')", [
      supervisor
    ]),
    /Período de ranking inválido/
  )
})

test('la migración conserva también un validar_operador con retorno TABLE', async () => {
  const otra = new PGlite()
  try {
    await otra.exec(read('./fixtures/provisionales.sql'))
    await otra.exec(`
      drop function public.validar_operador(varchar);
      create function public.validar_operador(p_dni varchar)
      returns table (dni varchar, nombre text) language sql as $$
        select t.dni, concat_ws(' ', t.nombres, t.apellidos)
        from trabajadores t where t.dni = p_dni
      $$;
    `)
    await otra.exec(migration('202610030100_acceso_diario_jaberos.sql'))
    const { rows } = await otra.query(
      'select public.validar_operador_diario($1::varchar) as resultado',
      [supervisor]
    )
    assert.equal(rows[0].resultado.dni, supervisor)
    assert.equal(rows[0].resultado.nombre, 'Deysi Regalado')
  } finally {
    await otra.close()
  }
})
