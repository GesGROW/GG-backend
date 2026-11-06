import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B } from './helpers/harvestSql.js'
import { TENANT_INICIAL_ID as T } from '@gesgrow/core/contexts/platform/index.js'

const db = new PGlite(), sub = crypto.randomUUID()
const dir = new URL('../supabase/migrations/', import.meta.url)
const read = (n) => readFileSync(new URL(n, dir), 'utf8')
const call = async (sql, args = []) => (await db.query('select ' + sql + ' r', args)).rows[0].r
const config = (c = A, t = T) => call('harvest_admin_bono_configuracion($1,$2)', [t,c])
const save = (d, c = A, t = T) => call('harvest_admin_bono_guardar($1,$2,$3)', [t,c,d])
const report = (d = null, h = null, trabajador = null, c = A) => call('harvest_reportes_bonos($1,$2,$3,$4,$5)', [T,c,d,h,trabajador])
let hoy, ayer, actor, sesion, otraSesion, trabajador, rol
const limpiar = (c) => ({ habilitado: c.habilitado, umbral: c.umbral, monto: c.monto, revision: c.revision, hoy: c.hoy })
before(async () => {
  await prepararHarvestSql(db)
  await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text unique,invited_at timestamptz,encrypted_password text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;`)
  for (const n of readdirSync(dir).filter(n => n >= '202610140600_' && n <= '20261025015953_harvest_tickets_lote_panel_ligero.sql' && n.endsWith('.sql')).sort()) await db.exec(read(n))
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub])
  actor = (await call('iam_obtener_identidad()')).usuario.id
  await db.query(`with m as(insert into identity_membresias(tenant_id,usuario_id) values($1,$2) returning id)
    insert into identity_membresia_roles(tenant_id,membresia_id,rol_id)
    select $1,m.id,r.id from m cross join identity_roles r where r.tenant_id=$1 and r.codigo='SUPERVISOR_COSECHA'`, [T,actor])
  hoy = await call("((statement_timestamp() at time zone 'America/Lima')::date)::text")
  await db.query(`insert into harvest_cultivos(id,tenant_id,color,creador_usuario_id)
    select distinct cultivo_id,$1::uuid,'#3B64EC',$2::uuid from campanias where id in ($3,$4)`,[T,actor,A,B])
  await db.query('insert into harvest_cultivo_supervisores(tenant_id,cultivo_id,usuario_id) select tenant_id,id,$1::uuid from harvest_cultivos',[actor])
  ayer = await call("((statement_timestamp() at time zone 'America/Lima')::date-1)::text")
  await db.query('update campanias set fecha_inicio=$1::date where id=$2', [ayer,A])
  await db.exec("update sesiones_lectura set estado='CERRADA',fecha_inicio=statement_timestamp()-interval '2 days',fecha_fin=statement_timestamp()-interval '1 day'")
  sesion = (await db.query('select s.* from sesiones_lectura s join lotes l on l.id=s.lote_id where l.campania_id=$1 limit 1',[A])).rows[0]
  const lote = crypto.randomUUID()
  await db.query(`insert into lotes(id,tenant_id,campania_id,codigo,nombre,variedad_id,activo)
    values($1,$2,$3,'BONO-2','Segundo lote',$4,true)`,[lote,T,A,sesion.variedad_id])
  await db.query('insert into lote_variedades(tenant_id,lote_id,variedad_id) values($1,$2,$3)',[T,lote,sesion.variedad_id])
  otraSesion=crypto.randomUUID()
  await db.query(`insert into sesiones_lectura(id,tenant_id,lote_id,variedad_id,jabero_rol_id,iniciada_por_usuario_id,fecha_inicio,fecha_fin,estado)
    values($1,$2,$3,$4,$5,$6,statement_timestamp()-interval '2 days',statement_timestamp()-interval '1 day','CERRADA')`,
    [otraSesion,T,lote,sesion.variedad_id,sesion.jabero_rol_id,sesion.iniciada_por_usuario_id])
  trabajador = (await db.query("insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'88990099','Ana','Bono',true) returning id",[T])).rows[0].id
  rol = (await db.query("insert into trabajador_campania_rol(tenant_id,trabajador_id,campania_id,rol,activo) values($1,$2,$3,'COSECHADOR',true) returning id",[T,trabajador,A])).rows[0].id
  await db.exec(read('20261106154420_harvest_bonos_diarios.sql'))
  await db.exec(read('20261106160001_harvest_bonos_api_privada.sql'))
})
after(() => db.close())

test('nace deshabilitado y valida importes, revisiones, actor y día del servidor', async () => {
  const c = await config()
  assert.equal(c.habilitado,false); assert.equal(c.bloqueado,false)
  for (const d of [{umbral:1.5},{umbral:-1},{monto:0},{monto:2.001},{habilitado:'true'},{revision:'ajena'},{hoy:ayer},{actor:'intruso'}])
    await assert.rejects(save({...limpiar(c),...d}))
  const r = await save({...limpiar(c),habilitado:true})
  assert.equal(r.habilitado,true); assert.equal(r.historial.length,1)
  assert.equal(r.historial[0].usuarioId,actor); assert.equal(r.historial[0].fecha,hoy)
  assert.equal((await save(limpiar(r))).historial.length,1)
  await assert.rejects(save({...limpiar(c),umbral:31}), /cambiaron/)
})

test('calcula 32 jabas = S/4, suma días y conserva la regla histórica y trabajadores inactivos', async () => {
  await db.query(`insert into harvest_bonos_privado.reglas(tenant_id,campania_id,fecha,habilitado,umbral,monto,usuario_id)
    values($1,$2,$3,true,30,3,$4)`,[T,A,ayer,actor])
  for (const [dia,cantidad] of [[ayer,31],[hoy,32]]) for(let i=0;i<cantidad;i++) {
    const a = (await db.query('insert into asignaciones_ticket(tenant_id,campania_id,cosechador_rol_id,codigo_ticket) values($1,$2,$3,$4) returning id',[T,A,rol,crypto.randomUUID()])).rows[0].id
    await db.query("insert into lecturas_jaba(id,tenant_id,asignacion_ticket_id,sesion_id,fecha_hora) values($1,$2,$3,$4,$5::timestamp at time zone 'America/Lima')",[crypto.randomUUID(),T,a,i%2?otraSesion:sesion.id,dia+(i%2?' 23:59:59':' 00:00:00')])
  }
  await db.query('update trabajadores set activo=false where id=$1',[trabajador])
  const r = (await report()).datos
  assert.equal(r.totalBono,7); assert.equal(r.totalAdicionales,3)
  assert.equal(r.detalle.find(x=>x.fecha===hoy).bono,4)
  assert.equal(r.detalle.find(x=>x.fecha===ayer).bono,3)
  assert.equal(r.resumen[0].bono,7)
  const antes = (await report(ayer,ayer)).datos
  const c=await config(); await save({...limpiar(c),umbral:35,monto:5})
  assert.deepEqual((await report(ayer,ayer)).datos,antes)
  assert.equal((await report(hoy,hoy)).datos.totalBono,0)
  assert.equal((await report(null,null,null,B)).datos.totalBono,0)
  assert.equal((await report(null,null,trabajador)).datos.totalBono,3)
})

test('una apertura sin lecturas bloquea y cerrar la sesión no desbloquea ese día', async () => {
  const c=await config()
  const id=crypto.randomUUID()
  await db.query(`insert into sesiones_lectura(id,tenant_id,lote_id,variedad_id,jabero_rol_id,iniciada_por_usuario_id,fecha_inicio)
    values($1,$2,$3,$4,$5,$6,statement_timestamp())`,[id,T,sesion.lote_id,sesion.variedad_id,sesion.jabero_rol_id,sesion.iniciada_por_usuario_id])
  assert.equal((await config()).bloqueado,true)
  await assert.rejects(save({...limpiar(c),monto:8}),/bloqueada/)
  await db.query("update sesiones_lectura set estado='CERRADA',fecha_fin=statement_timestamp() where id=$1",[id])
  assert.equal((await config()).bloqueado,true)
  await assert.rejects(save({...limpiar(c),habilitado:false}),/bloqueada/)
  assert.equal((await config(B)).bloqueado,false)
  // Simula mañana moviendo la sesión al pasado, sin cambiar el reloj del servidor.
  await db.query("update sesiones_lectura set fecha_inicio=statement_timestamp()-interval '1 day' where id=$1",[id])
  assert.equal((await config()).bloqueado,false)
})

test('deshabilitar conserva los bonos previos; permisos y aislamiento cierran acceso directo', async () => {
  const antes=(await report(ayer,ayer)).datos
  const c=await config(); await save({...limpiar(c),habilitado:false})
  assert.equal((await report(hoy,hoy)).datos.totalBono,0)
  assert.deepEqual((await report(ayer,ayer)).datos,antes)
  await assert.rejects(config(A,crypto.randomUUID()))
  await assert.rejects(report(hoy,ayer)); await assert.rejects(report(null,null,crypto.randomUUID()))
  for(const role of ['anon','service_role']) assert.equal(await call("has_function_privilege($1,'harvest_reportes_bonos(uuid,uuid,date,date,uuid)','EXECUTE')",[role]),false)
  assert.equal(await call("(select prosecdef from pg_proc where oid='public.harvest_reportes_bonos(uuid,uuid,date,date,uuid)'::regprocedure)"),false)
  await db.exec('set role authenticated')
  try { assert.equal((await report()).datos.totalBono,3); await assert.rejects(db.query('select * from harvest_bonos_privado.reglas')) }
  finally { await db.exec('reset role') }
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await assert.rejects(config()); await assert.rejects(report())
})
