import assert from 'node:assert/strict'
import test, { before, after, beforeEach, afterEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from './helpers/harvestSql.js'

const db = new PGlite()
const M = '20261022174649_portal_alta_empresa_owner.sql'
const read = (n) =>
  readFileSync(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const crear = (
  id = crypto.randomUUID(),
  empresa = 'Fundo nuevo',
  nombre = 'Ana Owner'
) =>
  call('public.iam_crear_empresa_inicial($1::uuid,$2::text,$3::text)', [
    id,
    empresa,
    nombre
  ])
async function admin(fn) {
  await db.exec('reset role')
  try {
    return await fn()
  } finally {
    await db.exec('set local role authenticated')
  }
}
async function rechaza(fn, pattern) {
  await db.exec('savepoint rechazo')
  await assert.rejects(fn, pattern)
  await db.exec('rollback to savepoint rechazo; release savepoint rechazo')
}
async function cuenta({ confirmada = true, invitada = false } = {}) {
  const id = crypto.randomUUID()
  await db.query(
    `insert into auth.users(id,email,email_confirmed_at,invited_at)
    values($1,$2,case when $3 then now() end,case when $4 then now() end)`,
    [id, id + '@example.test', confirmada, invitada]
  )
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
  await db.exec('set local role authenticated')
  return id
}
const stats = () =>
  admin(
    async () =>
      (
        await db.query(`select
  (select count(*)::int from tenants) empresas,
  (select count(*)::int from identity_membresias) membresias,
  (select count(*)::int from identity_altas_empresas) altas,
  (select count(*)::int from identity_usuarios) usuarios`)
      ).rows[0]
  )

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  for (const n of [
    '202610140600_harvest_cutover.sql',
    '202610140610_harvest_proyecciones.sql',
    '202610140700_platform_tenants.sql',
    '202610140800_identity_access.sql',
    '202610140900_platform_suscripciones.sql',
    '202610141000_platform_ciclo_vida.sql',
    '202610141100_portal_identity_admin.sql',
    '202610141200_portal_campaign_workforce.sql',
    '202610141300_portal_harvest_admin.sql',
    '202610141400_portal_reportes.sql',
    '202610211000_portal_activacion_cuenta.sql',
    '202610211100_owner_modulos.sql',
    '202610211200_usuarios_accesos_modulo.sql',
    M
  ])
    await db.exec(read(n))
})
beforeEach(() => db.exec('begin'))
afterEach(() => db.exec('rollback'))
after(() => db.close())

test('alta atómica: identidad, empresa y owner; ningún módulo ni permiso operativo', async () => {
  await cuenta()
  const antes = await stats()
  const r = await crear(undefined, '  Fundo nuevo  ', '  Ana Owner  ')
  const p = await call('public.iam_obtener_identidad()')
  assert.equal(p.usuario.id, r.usuarioId)
  assert.equal(p.usuario.nombre, 'Ana Owner')
  assert.deepEqual(
    p.empresas.map((e) => e.nombre),
    ['Fundo nuevo']
  )
  const ctx = await call('public.iam_resolver_tenant_context($1::uuid)', [r.tenantId])
  assert.deepEqual(ctx.permisos, ['company.manage', 'reports.view'])
  assert.equal(
    await call("public.platform_puede_usar_modulo($1::uuid,'HARVEST')", [r.tenantId]),
    false
  )
  assert.deepEqual(await stats(), {
    empresas: antes.empresas + 1,
    membresias: antes.membresias + 1,
    altas: 1,
    usuarios: antes.usuarios + 1
  })
  await admin(async () => {
    assert.equal(
      await call(
        '(select count(*) from public.platform_suscripciones where tenant_id=$1)',
        [r.tenantId]
      ),
      0
    )
    assert.equal(
      await call(
        '(select count(*) from public.platform_delegaciones_comerciales where tenant_id=$1)',
        [r.tenantId]
      ),
      0
    )
    assert.equal(
      await call(
        '(select count(*) from public.identity_membresia_roles where membresia_id=$1)',
        [r.membresiaId]
      ),
      1
    )
  })
})

test('reintentos devuelven el recibo original y no duplican; otra intención se rechaza', async () => {
  await cuenta()
  const id = crypto.randomUUID(),
    r = await crear(id),
    antes = await stats()
  assert.deepEqual(await crear(id), r)
  await rechaza(() => crear(id, 'Otra empresa'), /reutilizado/)
  await rechaza(() => crear(), /ya está vinculada/)
  assert.deepEqual(await stats(), antes)
})

test('otro actor no puede reutilizar ni recuperar un recibo ajeno', async () => {
  await cuenta()
  const id = crypto.randomUUID()
  await crear(id)
  await db.exec('reset role')
  await cuenta()
  await rechaza(() => crear(id), /otro usuario/)
  assert.equal((await call('public.iam_obtener_identidad()')).empresas.length, 0)
})

test('sin sesión, con correo no confirmado o cuenta invitada no puede crear empresa', async () => {
  await db.exec('set local role authenticated')
  await rechaza(() => crear(), /Sesión autenticada/)
  await db.exec('reset role')
  await cuenta({ confirmada: false })
  await rechaza(() => crear(), /Confirme su correo/)
  await db.exec('reset role')
  await cuenta({ invitada: true })
  await rechaza(() => crear(), /cuenta fue invitada/)
  await db.exec('set local role anon')
  await rechaza(() => crear(), /permission denied/)
})

test('membresías y usuarios inactivos no pueden usar el alta para recuperar privilegios', async () => {
  await cuenta()
  const op = crypto.randomUUID(),
    r = await crear(op)
  await admin(() =>
    db.query('update identity_membresias set activo=false where id=$1', [r.membresiaId])
  )
  await rechaza(() => crear(op), /membresía|Membresía|permiso|Permiso|empresa/i)
  await rechaza(() => crear(), /ya está vinculada/)
  await admin(() =>
    db.query('update identity_usuarios set activo=false where id=$1', [r.usuarioId])
  )
  await rechaza(() => crear(), /Usuario inactivo/)
})

test('validación y fallo de provisión no dejan empresas, recibos ni perfiles huérfanos', async () => {
  await cuenta()
  const antes = await stats()
  await rechaza(() => crear(null), /ID de operación/)
  await rechaza(() => crear(undefined, ' '), /Indique la empresa/)
  await rechaza(() => crear(undefined, 'X'.repeat(121)), /120 caracteres/)
  await rechaza(() => crear(undefined, 'Fundo', ''), /Indique la empresa/)
  // Simular una plantilla mal desplegada: la operación entera debe revertirse.
  await admin(() =>
    db.exec(`create or replace function public.iam_sembrar_roles(p_tenant uuid)
    returns void language plpgsql security definer set search_path=pg_catalog,public as $$ begin
      insert into public.identity_roles(tenant_id,codigo) values(p_tenant,'ADMIN_EMPRESA') on conflict do nothing;
      insert into public.identity_rol_permisos(tenant_id,rol_id,permiso)
        select p_tenant,id,'harvest.view' from public.identity_roles where tenant_id=p_tenant and codigo='ADMIN_EMPRESA' on conflict do nothing;
    end $$;`)
  )
  await rechaza(() => crear(), /plantilla de permisos/)
  assert.deepEqual(await stats(), antes)
})

test('recibos privados y RPC restringida, incluso frente a privilegios por defecto de Supabase', async () => {
  await cuenta()
  await crear()
  await rechaza(
    () => db.query('select * from public.identity_altas_empresas'),
    /permission denied/
  )
  await rechaza(
    () =>
      db.query("insert into public.tenants(nombre,codigo) values('Ajena','FORJADO')"),
    /permission denied|row-level security/
  )
  await admin(async () => {
    assert.equal(
      await call(
        "has_function_privilege('service_role','public.iam_crear_empresa_inicial(uuid,text,text)','EXECUTE')"
      ),
      false
    )
    assert.equal(
      await call(
        "has_table_privilege('service_role','public.identity_altas_empresas','SELECT')"
      ),
      false
    )
    assert.equal(
      await call(
        "(select relrowsecurity from pg_class where oid='public.identity_altas_empresas'::regclass)"
      ),
      true
    )
  })
})
