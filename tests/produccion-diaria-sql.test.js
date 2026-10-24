import { crearSupabaseBackend } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/backendAdapter.js'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { obtenerProduccionDiaria } from '@gesgrow/core/contexts/harvest/application/reports/produccionDiaria.js'

const db = new PGlite()
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
before(async () => {
  await db.exec(read('./fixtures/provisionales.sql'))
  const anterior = await db.query(
    "select to_regprocedure('public.obtener_produccion_diaria(varchar,text)') as rpc"
  )
  assert.equal(anterior.rows[0].rpc, null)
  await db.exec(`
    create table asignaciones_ticket (
      id uuid primary key, campania_id uuid, cosechador_rol_id uuid
    );
    create table lecturas_jaba (
      id uuid primary key default gen_random_uuid(), asignacion_ticket_id uuid,
      sesion_id uuid, fecha_hora timestamptz
    );
    insert into asignaciones_ticket values
      ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
    insert into lecturas_jaba (asignacion_ticket_id,sesion_id,fecha_hora) values
      ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2026-10-01T04:30:00Z'),
      ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2026-10-01T05:15:00Z'),
      ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','2026-10-01T05:30:00Z');
  `)
  await db.exec(
    read('../supabase/migrations/202610020200_restaurar_produccion_diaria.sql')
  )
})
after(() => db.close())

const consultar = async (dni, timezone) =>
  (
    await db.query(
      'select obtener_produccion_diaria($1::varchar,$2::text) as resultado',
      [dni, timezone]
    )
  ).rows[0].resultado

test('restauración expone la firma exacta de la PWA y recarga la caché de PostgREST', async () => {
  const { rows } = await db.query(
    "select pg_get_function_arguments('public.obtener_produccion_diaria(varchar,text)'::regprocedure) as args, has_function_privilege('anon','public.obtener_produccion_diaria(varchar,text)','EXECUTE') as autorizado"
  )
  assert.match(rows[0].args, /p_dni_operador character varying, p_zona_horaria text/)
  assert.equal(rows[0].autorizado, true)
  assert.match(
    read('../supabase/migrations/202610020200_restaurar_produccion_diaria.sql'),
    /notify pgrst, 'reload schema'/
  )
})

test('PWA consulta producción restaurada: cuenta lecturas repetidas y agrupa por día de Lima', async () => {
  const resultado = await obtenerProduccionDiaria(
    '47480378',
    crearSupabaseBackend({
      rpc: async (name, args) => {
        assert.equal(name, 'obtener_produccion_diaria')
        return { data: await consultar(args.p_dni_operador, args.p_zona_horaria) }
      }
    }).obtenerProduccionDiaria,
    () => 'America/Lima'
  )
  assert.deepEqual(resultado.produccion, [
    { fecha: '2026-10-01', total_jabas: 2, total_cosechadores: 1, total_sesiones: 2 },
    { fecha: '2026-09-30', total_jabas: 1, total_cosechadores: 1, total_sesiones: 1 }
  ])
  assert.equal(resultado.campania.nombre, 'Arándanos 2026')
  assert.equal((await consultar('47480378', 'UTC')).produccion.length, 1)
})

test('reporte restaurado conserva autorización de operador y valida la zona horaria', async () => {
  await assert.rejects(consultar('12345678', 'America/Lima'), /no autorizado/)
  await assert.rejects(
    consultar('47480378', 'zona-inexistente'),
    /Zona horaria inválida/
  )
})
