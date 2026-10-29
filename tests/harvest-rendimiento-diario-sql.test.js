import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const M = '20261029220107_harvest_rendimiento_diario_cosechadores.sql'
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const sub = crypto.randomUUID(),
  personas = []
let hoy, sesion
const fecha = (n) =>
  new Date(Date.parse(hoy + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const reporte = (f = {}) =>
  call(
    'harvest_reportes_campania($1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::date,$7::date)',
    [
      f.tenant ?? T,
      f.campania ?? A,
      f.tipo ?? 'RENDIMIENTO',
      f.lote ?? null,
      f.variedad ?? null,
      f.desde ?? null,
      f.hasta ?? null
    ]
  )

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  for (const n of readdirSync(dir)
    .filter(
      (n) =>
        n >= '202610140600_' &&
        n <= '20261025015953_harvest_tickets_lote_panel_ligero.sql' &&
        n.endsWith('.sql')
    )
    .sort())
    await db.exec(read(n))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub])
  const usuario = (await call('iam_obtener_identidad()')).usuario.id
  await db.query(
    `with m as(insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='SUPERVISOR_COSECHA'`,
    [T, usuario]
  )
  hoy = await call("((statement_timestamp() at time zone 'America/Lima')::date)::text")
  await db.query('update campanias set fecha_inicio=$1::date where id=$2', [
    fecha(-4),
    A
  ])
  sesion = (
    await db.query(
      'select s.id,l.id lote_id,l.variedad_id from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1 limit 1',
      [A]
    )
  ).rows[0]
  for (const [i, dias] of [
    [
      0,
      [
        [-4, 2],
        [-3, 3],
        [-1, 2]
      ]
    ],
    [
      1,
      [
        [-4, 2],
        [-1, 2]
      ]
    ]
  ]) {
    const t = (
      await db.query(
        "insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,$2,$3,'Prueba',true) returning id",
        [T, '8899010' + i, i ? 'Beta' : 'Alfa']
      )
    ).rows[0].id
    personas.push(t)
    const rol = (
      await db.query(
        "insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,'COSECHADOR',true) returning id",
        [T, t, A]
      )
    ).rows[0].id
    for (const [dia, jabas] of dias)
      for (let n = 0; n < jabas; n++) {
        const a = (
          await db.query(
            'insert into asignaciones_ticket(tenant_id,campania_id,cosechador_rol_id,codigo_ticket) values($1,$2,$3,$4) returning id',
            [T, A, rol, crypto.randomUUID()]
          )
        ).rows[0].id
        // Include both edges of the local day; UTC dates differ at 23:59 Lima.
        await db.query(
          "insert into lecturas_jaba(id,tenant_id,asignacion_ticket_id,sesion_id,fecha_hora) values($1,$2,$3,$4,$5::timestamp at time zone 'America/Lima')",
          [
            crypto.randomUUID(),
            T,
            a,
            sesion.id,
            fecha(dia) + (n ? ' 23:59:59' : ' 00:00:00')
          ]
        )
      }
  }
  await db.query('update trabajadores set activo=false where id=$1', [personas[1]])
  await db.exec(read(M))
})
after(() => db.close())

test('abre toda la campaña, reconcilia totales y promedia solo días con registros', async () => {
  const d = (await reporte()).datos
  assert.equal(d.desde, fecha(-4))
  assert.equal(d.hasta, hoy)
  assert.equal(d.metricas.totalJabas, 11)
  assert.deepEqual(
    d.ranking.map((p) => [p.id, p.jabas, p.diasRegistros, p.promedioDiario]),
    [
      [personas[0], 7, 3, 2.3],
      [personas[1], 4, 2, 2]
    ]
  )
  assert.equal(
    d.evolucionCosechadores.reduce((s, d) => s + d.jabas, 0),
    11
  )
  assert.equal(d.evolucionCosechadores.length, 5)
  assert.ok(
    d.evolucionCosechadores.every(
      (d) => d.jabas > 0 && ![fecha(-2), hoy].includes(d.fecha)
    )
  )
  assert.deepEqual(
    d.evolucion.map((d) => d.jabas),
    [4, 3, 0, 4, 0]
  )
})

test('los filtros se aplican por igual al ranking y las series, sin perder historia inactiva', async () => {
  const d = (
    await reporte({
      desde: fecha(-3),
      hasta: fecha(-1),
      lote: sesion.lote_id,
      variedad: sesion.variedad_id
    })
  ).datos
  assert.deepEqual(
    d.ranking.map((p) => [p.jabas, p.diasRegistros, p.promedioDiario]),
    [
      [5, 2, 2.5],
      [2, 1, 2]
    ]
  )
  assert.equal(
    d.evolucionCosechadores.reduce((s, d) => s + d.jabas, 0),
    7
  )
  assert.ok(d.ranking.some((p) => p.id === personas[1]))
  const vacio = (await reporte({ desde: fecha(-2), hasta: fecha(-2) })).datos
  assert.deepEqual(vacio.ranking, [])
  assert.deepEqual(vacio.evolucionCosechadores, [])
  assert.equal(vacio.metricas.totalJabas, 0)
  const produccion = (await reporte({ tipo: 'PRODUCCION' })).datos
  assert.equal(produccion.metricas.totalJabas, 11)
  assert.deepEqual(produccion.evolucionCosechadores, [])
})

test('mantiene permisos, aislamiento de campañas/empresas y reejecución segura', async () => {
  assert.deepEqual((await reporte({ campania: B })).datos.evolucionCosechadores, [])
  await assert.rejects(reporte({ tenant: crypto.randomUUID() }))
  await assert.rejects(reporte({ lote: crypto.randomUUID() }))
  await assert.rejects(reporte({ variedad: crypto.randomUUID() }))
  for (const [rol, esperado] of [
    ['anon', false],
    ['service_role', false],
    ['authenticated', true]
  ]) {
    assert.equal(
      await call(
        "has_function_privilege($1,'harvest_reportes_campania(uuid,uuid,text,uuid,uuid,date,date)','EXECUTE')",
        [rol]
      ),
      esperado
    )
  }
  const antes = (await reporte()).datos
  await db.exec(read(M))
  assert.deepEqual((await reporte()).datos, antes)
  await db.exec('set role authenticated')
  try {
    assert.equal((await reporte()).datos.metricas.totalJabas, 11)
  } finally {
    await db.exec('reset role')
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await assert.rejects(reporte())
})
