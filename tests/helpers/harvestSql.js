import { readFileSync } from 'node:fs'
export const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const SUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const OP = '47480378'
export const COSECHADOR = '81990410'
export const JABERO = '81990400'
const LA = '22222222-2222-4222-8222-222222222222'
const LB = '22222222-2222-4222-8222-000000000002'
const VB = '11111111-1111-4111-8111-000000000002'
const read = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
export async function prepararHarvestSql(db) {
  const S = crypto.randomUUID(),
    SB = crypto.randomUUID()

  await db.exec(read('../fixtures/provisionales.sql'))
  for (const nombre of [
    '20260930_admin_campanias.sql',
    '20261001_consistencia_acceso_app.sql',
    '202610030100_acceso_diario_jaberos.sql'
  ])
    await db.exec(read('../../supabase/migrations/' + nombre))
  await db.exec(read('../fixtures/multicultivo.sql'))
  for (const nombre of [
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
    await db.exec(read('../../supabase/migrations/' + nombre))
  await db.exec(
    'create function autorizar_integracion_reportes() returns void language plpgsql as $$ begin perform autorizar_integracion_gestion_maestros(); end $$;'
  )
  await db.exec(
    read('../../supabase/migrations/202610110200_produccion_lote_variedad.sql')
  )
  await db.exec(read('../../supabase/migrations/202610110400_rpc_por_campania.sql'))
  await db.query(
    "insert into campanias(id,codigo,nombre,estado,cultivo_id) values($1,'B','Campaña B','ACTIVA','a1000000-0000-4000-8000-000000000002')",
    [B]
  )
  await db.query(
    "insert into trabajador_campania_rol(trabajador_id,campania_id,rol,activo) values($1,$2,'SUPERVISORA',true)",
    [SUP, B]
  )
  await db.query(
    "insert into variedades(id,nombre,cultivo_id) values($1,'Variedad B','a1000000-0000-4000-8000-000000000002')",
    [VB]
  )
  await db.query(
    "insert into lotes(id,codigo,nombre,campania_id,variedad_id) values($1,'LB','Sur',$2,$3)",
    [LB, B, VB]
  )
  await db.query('insert into lote_variedades(lote_id,variedad_id) values($1,$2)', [
    LB,
    VB
  ])
  for (const [campania, lote, sesion, variedad] of [
    [A, LA, S, '11111111-1111-4111-8111-111111111111'],
    [B, LB, SB, VB]
  ]) {
    await db.query(
      'select registrar_jabero_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid)',
      [campania, OP, JABERO, crypto.randomUUID()]
    )
    await db.query(
      'select iniciar_sesion_lectura_campania($1::uuid,$2::varchar,$3::varchar,$4::uuid,$5::uuid,$6::uuid)',
      [campania, OP, JABERO, lote, sesion, variedad]
    )
  }
  for (const nombre of [
    '202610140100_harvest_tickets.sql',
    '202610140200_harvest_asignar_lote.sql',
    '202610140250_workforce_jabero_campania.sql',
    '202610140300_harvest_registrar_cosecha.sql',
    '202610140400_harvest_snapshot.sql',
    '202610140500_harvest_compatibilidad_v4.sql'
  ])
    await db.exec(read('../../supabase/migrations/' + nombre))
}
