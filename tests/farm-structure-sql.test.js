import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP, COSECHADOR } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T1 } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(),
  T2 = crypto.randomUUID(),
  cuentas = {},
  M = '202610141700_farm_structure.sql'
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const call = async (n, types = [], args = []) =>
  (
    await db.query(
      `select public.${n}(${types.map((t, i) => '$' + (i + 1) + '::' + t).join(',')}) r`,
      args
    )
  ).rows[0].r
const login = (n) =>
  db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    cuentas[n]?.sub ?? ''
  ])
const comercial = (t, tipo, parametros) =>
  call(
    'platform_solicitar_cambio',
    ['uuid', 'uuid', 'text', 'jsonb', 'text'],
    [crypto.randomUUID(), t, tipo, parametros, 'Prueba F8']
  )
const guardar = (tipo, codigo, padre = null, t = T1, id = null, activo = true) =>
  call(
    'farm_admin_guardar',
    ['uuid', 'text', 'uuid', 'text', 'text', 'boolean', 'uuid'],
    [t, tipo, id, codigo, 'Nombre ' + codigo, activo, padre]
  )
const estado = (tipo, id, activo, t = T1) =>
  call('farm_admin_estado', ['uuid', 'text', 'uuid', 'boolean'], [t, tipo, id, activo])
const listar = (tipo, t = T1, q = '', padre = null) =>
  call(
    'farm_admin_listar',
    ['uuid', 'text', 'text', 'boolean', 'uuid'],
    [t, tipo, q, null, padre]
  )
const vincular = (p, activo = true, t = T1, c = A, l = lote) =>
  call(
    'campaign_admin_vincular_parcela',
    ['uuid', 'uuid', 'uuid', 'uuid', 'boolean'],
    [t, c, l, p, activo]
  )
let fundo, sector, parcela, otra, ajena, lote, lote2, sesion, sccAntes, resumenAntes
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(
    "create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; create role service_role bypassrls; alter default privileges in schema public grant all on tables to service_role; alter default privileges in schema public grant execute on functions to service_role;"
  )
  const migraciones = readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((n) => n >= '202610140600' && n <= M)
    .sort()
  for (const n of migraciones) {
    if (n === M) sccAntes = await call('platform_estado_comercial', ['uuid'], [T1])
    await db.exec(read(n))
  }
  assert.deepEqual(await call('platform_estado_comercial', ['uuid'], [T1]), sccAntes)
  await db.query(
    "insert into tenants(id,nombre,codigo) values($1,'Empresa F8 B','F8-B')",
    [T2]
  )
  for (const [n, rol] of [
    ['admin', 'ADMIN_EMPRESA'],
    ['campaign', 'GESTOR'],
    ['consulta', 'CONSULTA']
  ]) {
    cuentas[n] = { sub: crypto.randomUUID() }
    await login(n)
    cuentas[n].id = (await call('iam_obtener_identidad')).usuario.id
    for (const t of n === 'admin' ? [T1, T2] : [T1])
      await db.query(
        `with m as (insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
      insert into identity_membresia_roles(tenant_id,membresia_id,rol_id) select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo=$3`,
        [t, cuentas[n].id, rol]
      )
  }
  await login('admin')
  for (const t of [T1, T2])
    await db.query(
      'insert into platform_delegaciones_comerciales(tenant_id,usuario_id) values($1,$2)',
      [t, cuentas.admin.id]
    )
  await comercial(T2, 'CREAR_SUSCRIPCION', {
    planId: '00000000-0000-4000-8000-000000000063'
  })
  // Habilitación comercial explícita posterior a migrar; no hay alta implícita.
  for (const t of [T1, T2])
    await comercial(t, 'HABILITAR_MODULO', { modulo: 'FARM_STRUCTURE' })
  const filas = (
    await db.query(
      'select l.id,s.id sesion from lotes l join sesiones_lectura s on s.lote_id=l.id where l.campania_id=$1',
      [A]
    )
  ).rows
  lote = filas[0].id
  sesion = filas[0].sesion
  lote2 = (await db.query('select id from lotes where campania_id=$1 limit 1', [B]))
    .rows[0].id
  resumenAntes = await call(
    'harvest_proyectar_resumen',
    ['uuid', 'text'],
    [A, 'America/Lima']
  )
})
after(() => db.close())

test('migración F8 idempotente, SCC e histórico sin conversión automática', async () => {
  assert.equal(sccAntes.suscripcion.estado, 'ACTIVA')
  assert.deepEqual(sccAntes.modulos.map((x) => x.modulo_codigo).sort(), [
    'CAMPAIGN',
    'HARVEST',
    'WORKFORCE'
  ])
  for (const t of [
    'farm_fundos',
    'farm_sectores',
    'farm_parcelas',
    'campaign_lote_parcelas'
  ])
    assert.equal((await db.query(`select count(*)::int n from ${t}`)).rows[0].n, 0)
  assert.deepEqual(
    await call('campaign_admin_parcelas_lote', ['uuid', 'uuid', 'uuid'], [T1, A, lote]),
    []
  )
  assert.ok(
    (await call('campaign_admin_lotes', ['uuid', 'uuid'], [T1, A])).some(
      (x) => x.id === lote
    )
  )
  const comercialAntes = await call('platform_estado_comercial', ['uuid'], [T1])
  await db.exec(read(M))
  assert.deepEqual(
    await call('platform_estado_comercial', ['uuid'], [T1]),
    comercialAntes
  )
})
test('crear Fundo, Sector y Parcela; búsqueda, edición y jerarquía persistente', async () => {
  fundo = await guardar('fundos', ' f1 ')
  sector = await guardar('sectores', 'S1', fundo.id)
  parcela = await guardar('parcelas', 'P1', sector.id)
  otra = await guardar('parcelas', 'P2', sector.id)
  assert.equal(fundo.codigo, 'F1')
  assert.equal(sector.fundoId, fundo.id)
  assert.equal(parcela.sectorId, sector.id)
  assert.equal(parcela.habilitado, true)
  assert.equal(parcela.padreCodigo, 'S1')
  assert.equal((await listar('parcelas', T1, 'P1', sector.id)).filas[0].id, parcela.id)
  const editada = await guardar('parcelas', 'P1-EDIT', sector.id, T1, parcela.id)
  assert.equal(editada.nombre, 'Nombre P1-EDIT')
  assert.equal(editada.createdAt, parcela.createdAt)
  await assert.rejects(guardar('fundos', 'F1'), /duplicate key/)
  const fB = await guardar('fundos', 'F1', null, T2),
    sB = await guardar('sectores', 'S1', fB.id, T2)
  ajena = await guardar('parcelas', 'P1', sB.id, T2)
  assert.equal(ajena.tenantId, T2)
  await assert.rejects(guardar('sectores', 'CRUZADO', fB.id), /otra empresa/)
  await assert.rejects(guardar('parcelas', 'CRUZADA', sB.id), /otra empresa/)
  await assert.rejects(
    guardar('parcelas', 'CAMBIO', sB.id, T1, parcela.id),
    /inmutable/
  )
  await assert.rejects(guardar('fundos', 'ROBO', null, T1, fB.id), /otra empresa/)
  assert.equal(
    (await listar('fundos')).filas.some((x) => x.id === fB.id),
    false
  )
})
test('lote operativo vincula varias parcelas, una parcela participa en varias campañas; cross-tenant rechazado', async () => {
  await vincular(parcela.id)
  await vincular(otra.id)
  assert.equal(
    (
      await call(
        'campaign_admin_parcelas_lote',
        ['uuid', 'uuid', 'uuid'],
        [T1, A, lote]
      )
    ).length,
    2
  )
  await vincular(parcela.id, true, T1, B, lote2)
  await assert.rejects(vincular(ajena.id), /otra empresa/)
  await assert.rejects(vincular(parcela.id, true, T1, B, lote), /otra campaña/)
  await assert.rejects(vincular(parcela.id, true, T2, A, lote), /no pertenece/)
  await assert.rejects(
    db.query(
      'insert into campaign_lote_parcelas(tenant_id,lote_id,parcela_id) values($1,$2,$3)',
      [T2, lote, ajena.id]
    ),
    /foreign key/
  )
  const desvinculo = await vincular(otra.id, false)
  assert.equal(desvinculo.find((x) => x.id === otra.id).vinculoActivo, false)
  await vincular(otra.id)
})
test('desactivar conserva jerarquía y vínculos; entidades inactivas no admiten nuevas relaciones', async () => {
  await estado('fundos', fundo.id, false)
  const d = (await listar('parcelas')).filas.find((x) => x.id === parcela.id)
  assert.equal(d.activo, true)
  assert.equal(d.habilitado, false)
  assert.deepEqual(await call('farm_parcelas_seleccionables', ['uuid'], [T1]), [])
  await assert.rejects(guardar('sectores', 'NO', fundo.id), /inactivo/)
  await assert.rejects(guardar('parcelas', 'NO', sector.id), /inactivo/)
  await vincular(otra.id, false)
  await assert.rejects(vincular(otra.id), /inactiva/)
  await estado('parcelas', parcela.id, false)
  await assert.rejects(estado('parcelas', parcela.id, true), /inactivo/)
  await estado('fundos', fundo.id, true)
  await estado('parcelas', parcela.id, true)
  await estado('sectores', sector.id, false)
  await estado('sectores', sector.id, true)
  assert.equal(
    (await listar('parcelas')).filas.find((x) => x.id === parcela.id).habilitado,
    true
  )
  await vincular(otra.id)
  for (const tabla of [
    'farm_fundos',
    'farm_sectores',
    'farm_parcelas',
    'campaign_lote_parcelas'
  ]) {
    await assert.rejects(db.exec(`delete from ${tabla}`), /activación\/desactivación/)
    await assert.rejects(
      db.exec(`truncate ${tabla} cascade`),
      /activación\/desactivación/
    )
  }
  assert.ok((await listar('parcelas')).filas.some((x) => x.id === parcela.id))
})
test('permisos efectivos separados: gestión física, selección Campaign y membresía autorizada', async () => {
  await login('consulta')
  await assert.rejects(listar('fundos'), /permiso/i)
  await assert.rejects(vincular(parcela.id), /permiso/i)
  await assert.rejects(listar('fundos', T2), /membresía|miembro|empresa/i)
  await login('campaign')
  await assert.rejects(listar('fundos'), /permiso/i)
  assert.ok(
    (await call('farm_parcelas_seleccionables', ['uuid'], [T1])).some(
      (x) => x.id === parcela.id
    )
  )
  await vincular(parcela.id)
  await login(null)
  await assert.rejects(listar('fundos'), /sesión|autentic/i)
  await login('admin')
  await db.query(
    'update identity_membresias set activo=false where tenant_id=$1 and usuario_id=$2',
    [T1, cuentas.admin.id]
  )
  await assert.rejects(listar('fundos'), /membresía|miembro|empresa/i)
  await db.query(
    'update identity_membresias set activo=true where tenant_id=$1 and usuario_id=$2',
    [T1, cuentas.admin.id]
  )
})
test('RLS/ACL bloquean tablas y helpers privados aun con privilegios Supabase por defecto', async () => {
  for (const rol of ['anon', 'authenticated', 'service_role']) {
    for (const tabla of [
      'farm_fundos',
      'farm_sectores',
      'farm_parcelas',
      'campaign_lote_parcelas'
    ]) {
      assert.equal(
        (
          await db.query(
            "select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,SELECT') ok",
            [rol, tabla]
          )
        ).rows[0].ok,
        false
      )
      assert.equal(
        (
          await db.query(
            'select relrowsecurity ok from pg_class where oid=$1::regclass',
            [tabla]
          )
        ).rows[0].ok,
        true
      )
    }
    assert.equal(
      (
        await db.query(
          "select has_function_privilege($1,'farm_describir_parcela(uuid,uuid)','EXECUTE') ok",
          [rol]
        )
      ).rows[0].ok,
      false
    )
  }
  await db.exec('set role authenticated')
  try {
    assert.equal((await listar('fundos')).total, 1)
    await assert.rejects(db.exec('select * from farm_fundos'), /permission denied/)
  } finally {
    await db.exec('reset role')
  }
})
test('Harvest conserva asignación/consumo y reportes F5.6, incluso con parcela/jerarquía inactiva', async () => {
  assert.deepEqual(
    await call('harvest_proyectar_resumen', ['uuid', 'text'], [A, 'America/Lima']),
    resumenAntes
  )
  await estado('fundos', fundo.id, false)
  await call('admin_activar_harvest_campania', ['uuid'], [A])
  await login(null) // PDA legacy no adquiere dependencia de Farm.
  const tickets = crypto.randomUUID(),
    codigo = 'F8-' + crypto.randomUUID()
  await db.query(
    'insert into harvest_lotes_tickets(id,tenant_id,campania_id) values($1,$2,$3)',
    [tickets, T1, A]
  )
  await db.query(
    'insert into harvest_tickets(codigo,lote_id,campania_id,tenant_id) values($1,$2,$3,$4)',
    [codigo, tickets, A, T1]
  )
  await call(
    'harvest_asignar_lote_tickets',
    ['uuid', 'varchar', 'varchar', 'text', 'uuid'],
    [A, OP, COSECHADOR, codigo, crypto.randomUUID()]
  )
  await call(
    'harvest_registrar_cosecha',
    ['uuid', 'varchar', 'uuid', 'text', 'uuid', 'text', 'uuid'],
    [
      A,
      OP,
      sesion,
      codigo,
      crypto.randomUUID(),
      new Date().toISOString(),
      crypto.randomUUID()
    ]
  )
  const reporte = await call(
    'harvest_proyectar_resumen',
    ['uuid', 'text'],
    [A, 'America/Lima']
  )
  assert.equal(reporte.resumen.total_jabas, resumenAntes.resumen.total_jabas + 1)
  await login('admin')
  await call('campaign_admin_cerrar', ['uuid', 'uuid'], [T1, A])
  assert.equal(
    (
      await call(
        'harvest_reportes_obtener',
        ['uuid', 'uuid', 'text'],
        [T1, A, 'RESUMEN']
      )
    ).datos.resumen.total_jabas,
    reporte.resumen.total_jabas
  )
  assert.ok(
    (await call('campaign_admin_lotes', ['uuid', 'uuid'], [T1, A])).some(
      (x) => x.id === lote
    )
  )
  await estado('fundos', fundo.id, true)
})
test('entitlement FARM_STRUCTURE se revalida sin alterar los módulos existentes del SCC', async () => {
  await login('admin')
  await comercial(T1, 'DESHABILITAR_MODULO', { modulo: 'FARM_STRUCTURE' })
  await assert.rejects(listar('fundos'), /módulo/i)
  await assert.rejects(vincular(parcela.id), /módulo/i)
  for (const m of ['HARVEST', 'CAMPAIGN', 'WORKFORCE'])
    assert.equal(
      await call('platform_puede_usar_modulo', ['uuid', 'text'], [T1, m]),
      true
    )
  assert.ok((await call('campaign_admin_lotes', ['uuid', 'uuid'], [T1, A])).length)
  assert.equal((await listar('fundos', T2)).total, 1)
})
