import assert from 'node:assert/strict'
import test, { before, after, beforeEach, afterEach } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql } from './helpers/harvestSql.js'

const db = new PGlite()
const script = readFileSync(
  new URL('../scripts/limpieza-total-quijas-scc.sql', import.meta.url),
  'utf8'
)
const call = async (sql, args = []) =>
  (await db.query('select ' + sql + ' r', args)).rows[0].r
const autorizar = () =>
  db.exec("set local gesgrow.reset_confirmation='LIMPIAR:mavecfdsrnyfozzukytl'")
const triggers = () =>
  db.query(`select t.oid,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) def
  from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace order by t.oid`)
const catalogos = async () => {
  const result = {}
  for (const name of [
    'identity_permisos',
    'platform_modulos',
    'platform_planes',
    'platform_plan_modulos'
  ])
    result[name] = (
      await db.query(
        `select to_jsonb(t) fila from public.${name} t order by to_jsonb(t)::text`
      )
    ).rows
  return result
}
async function rechaza(pattern) {
  await db.exec('savepoint rechazo')
  await assert.rejects(() => db.exec(script), pattern)
  await db.exec('rollback to savepoint rechazo; release savepoint rechazo')
}

before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    create role service_role bypassrls;
    create table public.integraciones_api(id uuid primary key default gen_random_uuid(),auth_user_id uuid references auth.users(id) on delete cascade);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
    create table auth.refresh_tokens(id uuid primary key,session_id uuid references auth.sessions(id) on delete cascade);
    create table auth.mfa_amr_claims(id uuid primary key,session_id uuid references auth.sessions(id) on delete cascade);
    create schema storage;
    create table storage.objects(id uuid);
    create table storage.buckets(id text);
    create table storage.s3_multipart_uploads(id uuid);
    create table auth.schema_migrations(version text);
    insert into auth.schema_migrations values('preservada');`)
  for (const name of [
    'identities',
    'mfa_factors',
    'mfa_challenges',
    'mfa_recovery_code_sets',
    'mfa_recovery_codes',
    'one_time_tokens',
    'oauth_authorizations',
    'oauth_consents',
    'oauth_client_states',
    'flow_state',
    'saml_relay_states',
    'scim_users',
    'webauthn_challenges',
    'webauthn_credentials'
  ])
    await db.exec(
      `create table auth.${name}(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade)`
    )
  for (const name of readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter(
      (n) => n >= '202610140600' && n <= '20261022174649_portal_alta_empresa_owner.sql'
    )
    .sort())
    await db.exec(
      readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
    )
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'original@example.test',now());
    insert into auth.sessions select gen_random_uuid(),id from auth.users;
    insert into auth.refresh_tokens select gen_random_uuid(),id from auth.sessions;
    insert into auth.mfa_amr_claims select gen_random_uuid(),id from auth.sessions;`)
  for (const name of [
    'identities',
    'mfa_factors',
    'one_time_tokens',
    'oauth_client_states',
    'flow_state'
  ])
    await db.exec(`insert into auth.${name}(user_id) select id from auth.users`)
})
beforeEach(() => db.exec('begin'))
afterEach(() => db.exec('rollback'))
after(() => db.close())

test('limpieza exige confirmación del proyecto y rechaza tablas nuevas o referencias externas', async () => {
  await rechaza(/confirmación explícita/)
  await autorizar()
  await db.exec('savepoint esquema; create table public.no_revisada(id uuid)')
  await rechaza(/esquema public cambió/)
  await db.exec('rollback to savepoint esquema; release savepoint esquema')
  await db.exec(
    'create schema externo; create table externo.no_borrar(id uuid references public.tenants(id))'
  )
  await rechaza(/referencias externas/)
  assert.ok((await call('(select count(*) from public.campanias)')) > 0)
})

test('ensayo vacía las 45 tablas y Auth, conserva catálogos, esquema y estados exactos de triggers', async () => {
  await autorizar()
  await db.exec(`alter table platform_suscripciones enable always trigger platform_suscripciones_no_truncate;
    alter table platform_tenant_modulos enable replica trigger platform_entitlements_no_truncate;
    alter table platform_eventos_comerciales disable trigger platform_eventos_no_truncate;`)
  const antes = await catalogos(),
    antesTriggers = await triggers()
  await db.exec(script)
  const tablas = (
    await db.query(`select relname from pg_class where relnamespace='public'::regnamespace and relkind='r'
    and relname not in ('identity_permisos','platform_modulos','platform_planes','platform_plan_modulos')`)
  ).rows
  assert.equal(tablas.length, 45)
  for (const { relname } of tablas)
    assert.equal(
      await call(`(select count(*)::int from public.${relname})`),
      0,
      relname
    )
  for (const name of [
    'users',
    'sessions',
    'refresh_tokens',
    'identities',
    'mfa_amr_claims',
    'mfa_factors',
    'one_time_tokens',
    'flow_state'
  ])
    assert.equal(await call(`(select count(*)::int from auth.${name})`), 0, name)
  assert.deepEqual(await catalogos(), antes)
  assert.deepEqual(await triggers(), antesTriggers)
  assert.equal(await call('(select version from auth.schema_migrations)'), 'preservada')
})

test('tras limpieza el alta desde cero crea owner y los triggers de auditoría siguen protegiendo', async () => {
  await autorizar()
  await db.exec(script)
  const sub = crypto.randomUUID()
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
    [sub, 'nuevo@example.test']
  )
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [sub])
  await db.exec('set local role authenticated')
  const r = await call(
    "public.iam_crear_empresa_inicial($1::uuid,'Empresa desde cero','Nuevo Owner')",
    [crypto.randomUUID()]
  )
  const ctx = await call('public.iam_resolver_tenant_context($1::uuid)', [r.tenantId])
  assert.deepEqual(ctx.permisos, ['company.manage', 'reports.view'])
  await db.exec('reset role; savepoint auditoria')
  await assert.rejects(
    () => db.exec('truncate public.platform_eventos_comerciales'),
    /Historial comercial inmutable/
  )
  await db.exec('rollback to savepoint auditoria; release savepoint auditoria')
})

test('Storage no vacío cancela todo antes de borrar', async () => {
  await autorizar()
  await db.exec('insert into storage.objects values(gen_random_uuid())')
  const antes = await triggers()
  await rechaza(/Storage contiene datos/)
  assert.equal(await call('(select count(*)::int from auth.users)'), 1)
  assert.ok((await call('(select count(*) from public.campanias)')) > 0)
  assert.deepEqual(await triggers(), antes)
})

test('un fallo tardío en Auth revierte también truncado y suspensión de triggers', async () => {
  await autorizar()
  await db.exec(`create function auth.qa_no_borrar() returns trigger language plpgsql as $$ begin raise exception 'Fallo Auth simulado'; end $$;
    create trigger qa_no_borrar before delete on auth.users for each row execute function auth.qa_no_borrar();`)
  const antes = await triggers(),
    campanias = await call('(select count(*) from public.campanias)')
  await rechaza(/Fallo Auth simulado/)
  assert.deepEqual(await triggers(), antes)
  assert.equal(await call('(select count(*) from public.campanias)'), campanias)
  assert.equal(await call('(select count(*)::int from auth.sessions)'), 1)
})
