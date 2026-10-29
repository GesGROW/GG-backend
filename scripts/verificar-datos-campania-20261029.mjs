import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A } from '../tests/helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite()
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const seed = readFileSync(
  new URL('./datos-campania-arandano-20261029.sql', import.meta.url),
  'utf8'
)
  .replaceAll('e72f3272-105a-4da1-868a-0cc326e2bd4f', T)
  .replaceAll('9e030328-bba9-4622-a091-df0bdb4eadf0', A)
try {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; create role service_role bypassrls;`)
  for (const n of readdirSync(dir)
    .filter(
      (n) =>
        n >= '202610140600_' &&
        n <= '20261025015953_harvest_tickets_lote_panel_ligero.sql' &&
        n.endsWith('.sql')
    )
    .sort())
    await db.exec(read(n))
  await db.exec(read('20261029220107_harvest_rendimiento_diario_cosechadores.sql'))
  const sub = crypto.randomUUID()
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub])
  const usuario = (await call('iam_obtener_identidad()')).usuario.id
  await db.query(
    `with m as(insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='SUPERVISOR_COSECHA'`,
    [T, usuario]
  )
  await db.query(
    'insert into harvest_cutovers(campania_id,tenant_id,version,activado_por) values($1,$2,1,$3)',
    [A, T, sub]
  )
  const originales = await db.query(
    'select id,dni,nombres,apellidos,activo from trabajadores order by id'
  )
  // La carga completa se verifica primero sin confirmar; no debe dejar filas.
  const trabajadoresAntes = await call('(select count(*) from trabajadores)')
  await db.exec(seed.replace(/commit;\s*$/, 'rollback;'))
  assert.equal(await call('(select count(*) from trabajadores)'), trabajadoresAntes)
  await db.exec(seed)
  const reporte = (
    await call("harvest_reportes_campania($1::uuid,$2::uuid,'RENDIMIENTO')", [T, A])
  ).datos
  assert.equal(reporte.ranking.length, 24)
  assert.ok(reporte.evolucion.length >= 21)
  assert.ok(reporte.metricas.totalJabas > 5000)
  assert.equal(
    reporte.metricas.totalJabas,
    reporte.evolucionCosechadores.reduce((s, d) => s + d.jabas, 0)
  )
  assert.ok(
    reporte.ranking.every(
      (p) =>
        p.nombre.split(/\s+/).length === 4 &&
        p.diasRegistros < 21 &&
        p.promedioDiario > 0
    )
  )
  const cantidades = new Set(reporte.ranking.map((p) => p.jabas))
  assert.ok(cantidades.size > 15)
  const originalesDespues = await db.query(
    "select id,dni,nombres,apellidos,activo from trabajadores where id::text not like 'a6291029-2026-4000-%' order by id"
  )
  assert.deepEqual(originalesDespues.rows, originales.rows)
  await assert.rejects(db.exec(seed), /carga ya existe/)
  await db.exec('rollback')
  assert.equal(
    await call('(select count(*) from trabajadores)'),
    trabajadoresAntes + 26
  )
  console.log(
    JSON.stringify({
      cosechadores: reporte.ranking.length,
      jabas: reporte.metricas.totalJabas,
      dias: reporte.evolucion.length,
      diasConRegistros: reporte.metricas.diasProduccion,
      rollback: true,
      duplicadosBloqueados: true,
      originalesConservados: true
    })
  )
} finally {
  await db.close()
}
