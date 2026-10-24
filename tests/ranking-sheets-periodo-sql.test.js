import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
const sql = read('../supabase/migrations/202610030300_admin_ranking_por_periodo.sql')
const db = new PGlite()
const campania = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const trabajadores = {}

async function fijarHoy(fecha) {
  // Ejecuta el mismo SQL con un reloj determinista para probar cambios de calendario.
  await db.exec(sql.replace('statement_timestamp()', `'${fecha}T15:00:00Z'::timestamptz`))
}
async function ranking(periodo = 'HOY', zona = 'America/Lima') {
  return (await db.query(
    'select public.admin_obtener_ranking_cosechadores_periodo($1, $2) as resultado',
    [periodo, zona]
  )).rows[0].resultado
}
async function producir(nombre, fecha, jabas) {
  await db.query(`insert into lecturas_jaba (asignacion_ticket_id, fecha_hora)
    select $1::uuid, $2::timestamptz from generate_series(1, $3::int)`,
  [trabajadores[nombre], fecha, jabas])
}

before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  await db.exec(`
    create function public.autorizar_integracion_reportes() returns void language plpgsql as $$
    begin
      if current_setting('scc.test.reportes', true) is distinct from 'true' then
        raise exception 'Integración no autorizada para consultar reportes';
      end if;
    end $$;
    set scc.test.reportes = 'true';
    create table asignaciones_ticket (id uuid primary key, campania_id uuid, cosechador_rol_id uuid);
    create table lecturas_jaba (
      id uuid primary key default gen_random_uuid(), asignacion_ticket_id uuid, fecha_hora timestamptz
    );
    update campanias set fecha_inicio = '2026-08-01';
  `)
  for (const [i, nombre] of ['Ana', 'Beto', 'Caro', 'Dora', 'Eva'].entries()) {
    const trabajador = crypto.randomUUID()
    const rol = crypto.randomUUID()
    const ticket = crypto.randomUUID()
    await db.query('insert into trabajadores (id, dni, nombres, apellidos, activo) values ($1,$2,$3,\'\',true)',
      [trabajador, `0123456${i}`, nombre])
    await db.query(`insert into trabajador_campania_rol (id,trabajador_id,campania_id,rol,activo)
      values ($1,$2,$3,'COSECHADOR',true)`, [rol, trabajador, campania])
    await db.query('insert into asignaciones_ticket values ($1,$2,$3)', [ticket, campania, rol])
    trabajadores[nombre] = ticket
  }
  await fijarHoy('2026-10-03')
})
after(() => db.close())

test('hoy mantiene empates, usa todo el ranking anterior y respeta medianoche de Lima', async () => {
  await producir('Eva', '2026-10-02T12:00:00-05:00', 12) // solo en el anterior
  await producir('Ana', '2026-10-02T23:59:59.999-05:00', 8)
  await producir('Beto', '2026-10-02T12:00:00-05:00', 6)
  await producir('Dora', '2026-10-02T12:00:00-05:00', 4)
  await producir('Ana', '2026-10-03T00:00:00-05:00', 10)
  await producir('Caro', '2026-10-03T12:00:00-05:00', 10)
  await producir('Dora', '2026-10-03T12:00:00-05:00', 5)
  await producir('Beto', '2026-10-03T23:59:59.999-05:00', 1)
  await producir('Ana', '2026-10-04T00:00:00-05:00', 100) // fuera del actual
  const resultado = await ranking()
  assert.deepEqual(resultado.ranking.map((r) => [r.cosechador, r.posicion, r.posicion_anterior, r.cambio_posicion]),
    [['Ana', 1, 2, 1], ['Caro', 1, null, null], ['Dora', 2, 4, 2], ['Beto', 3, 3, 0]])
  assert.equal(resultado.ranking[0].total_jabas, 10)
  assert.equal(resultado.fecha_desde, '2026-10-03')
  assert.equal(resultado.fecha_anterior_desde, '2026-10-02')
})

test('un líder anterior puede bajar y conserva la diferencia firmada', async () => {
  await producir('Eva', '2026-10-03T12:00:00-05:00', 2)
  const fila = (await ranking()).ranking.find((r) => r.cosechador === 'Eva')
  assert.equal(fila.posicion_anterior, 1)
  assert.equal(fila.posicion, 3)
  assert.equal(fila.cambio_posicion, -2)
})

test('semana compara desde lunes hasta el mismo día de la semana anterior', async () => {
  const resultado = await ranking('SEMANA')
  assert.equal(resultado.fecha_desde, '2026-09-28')
  assert.equal(resultado.fecha_anterior_desde, '2026-09-21')
  assert.equal(resultado.fecha_anterior_hasta, '2026-09-26')
  assert.equal(resultado.ranking.find((r) => r.cosechador === 'Ana').total_jabas, 18)
})

test('mes compara igual cantidad de días y limita al cierre del mes anterior', async () => {
  let resultado = await ranking('MES')
  assert.equal(resultado.fecha_desde, '2026-10-01')
  assert.equal(resultado.fecha_anterior_desde, '2026-09-01')
  assert.equal(resultado.fecha_anterior_hasta, '2026-09-03')
  await fijarHoy('2028-03-31')
  resultado = await ranking('MES')
  assert.equal(resultado.fecha_anterior_desde, '2028-02-01')
  assert.equal(resultado.fecha_anterior_hasta, '2028-02-29')
  await fijarHoy('2026-03-31')
  resultado = await ranking('MES')
  assert.equal(resultado.fecha_anterior_hasta, '2026-02-28')
  await fijarHoy('2026-10-03')
})

test('campaña compara acumulado hasta ayer y excluye fechas posteriores a hoy', async () => {
  const resultado = await ranking('CAMPANIA')
  assert.equal(resultado.fecha_desde, '2026-08-01')
  assert.equal(resultado.fecha_anterior_desde, '2026-08-01')
  assert.equal(resultado.fecha_anterior_hasta, '2026-10-02')
  assert.equal(resultado.ranking.find((r) => r.cosechador === 'Ana').total_jabas, 18)
})

test('zona horaria determina días y períodos sin depender de la zona de ejecución', async () => {
  const resultado = await ranking('HOY', 'Pacific/Kiritimati')
  assert.equal(resultado.fecha_desde, '2026-10-04')
  assert.equal(resultado.zona_horaria, 'Pacific/Kiritimati')
})

test('sin producción conserva metadatos, y campaña en su primer día no inventa comparación', async () => {
  await db.exec('delete from lecturas_jaba; update campanias set fecha_inicio = \'2026-10-03\';')
  const resultado = await ranking('CAMPANIA')
  assert.deepEqual(resultado.ranking, [])
  assert.equal(resultado.comparacion_disponible, false)
  assert.equal(resultado.fecha_anterior_desde, null)
  assert.equal(resultado.fecha_anterior_hasta, null)
})

test('valida período, zona, campaña activa y permiso administrativo; anon no puede ejecutar', async () => {
  await assert.rejects(ranking('OTRO'), /Período de ranking inválido/)
  await assert.rejects(ranking('HOY', 'Zona/Inexistente'), /Zona horaria inválida/)
  const permisos = (await db.query(`select
    has_function_privilege('anon', 'public.admin_obtener_ranking_cosechadores_periodo(text,text)', 'EXECUTE') as anon,
    has_function_privilege('authenticated', 'public.admin_obtener_ranking_cosechadores_periodo(text,text)', 'EXECUTE') as autenticado
  `)).rows[0]
  assert.deepEqual(permisos, { anon: false, autenticado: true })
  await db.exec("set scc.test.reportes = 'false'")
  await assert.rejects(ranking(), /Integración no autorizada/)
  await db.exec("set scc.test.reportes = 'true'; update campanias set estado = 'CERRADA'")
  await assert.rejects(ranking(), /No hay una campaña activa/)
})
