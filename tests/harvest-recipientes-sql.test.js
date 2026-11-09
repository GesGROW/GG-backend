import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { prepararHarvestSql, A, B, OP, COSECHADOR } from './helpers/harvestSql.js'
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
  // Include the configured-lot subquery before the container migration, as in production.
  await db.exec(`do $$ declare d text; begin
   d:=pg_get_functiondef('public.harvest_proyectar_resumen(uuid,text)'::regprocedure);
   execute replace(d,'''total_jabas'',count(*)',
    '''total_lotes_configurados'',(select count(*) from public.lotes l where l.campania_id=p_campania),''total_jabas'',count(*)');
  end $$;`)
  await db.exec(read('20261107035139_harvest_recipientes_y_bonos.sql'))
  await db.exec(read('20261107042436_harvest_reportes_paquetes_general.sql'))
  await db.exec(read('20261107051630_harvest_correcciones_recipientes_y_peso_vacio.sql'))
  await db.exec(read('20261109125850_harvest_resumen_corregir_agregado_lotes.sql'))
})
after(() => db.close())


test('jarras y jabas tienen umbrales independientes, peso parcial e historial', async () => {
 const vacio=(await report(hoy,hoy)).datos
 assert.equal(vacio.totalKgEstimados,0)
 assert.equal((await call('harvest_reportes_recipiente($1,$2,$3,null,null,$4,$4,$5)',[T,A,'PRODUCCION',hoy,'GENERAL'])).datos.metricas.kgEstimados,0)
 const c=await config()
 const regla={...limpiar(c),habilitado:true,umbral:2,monto:2,jarrasHabilitado:true,jarrasUmbral:3,jarrasMonto:1.5}
 await save(regla)
 await assert.rejects(save({...regla,revision:(await config()).revision,jarrasUmbral:1.2}),/entero/)
 for (const tipo of ['JABA','JABA','JABA','JARRA','JARRA','JARRA','JARRA',null]) {
  const a=(await db.query('insert into asignaciones_ticket(tenant_id,campania_id,cosechador_rol_id,codigo_ticket) values($1,$2,$3,$4) returning id',[T,A,rol,crypto.randomUUID()])).rows[0].id
  await db.query("select set_config('harvest.tipo_recipiente',$1,false)",[tipo??''])
  await db.query('insert into lecturas_jaba(id,tenant_id,asignacion_ticket_id,sesion_id,fecha_hora) values($1,$2,$3,$4,statement_timestamp())',[crypto.randomUUID(),T,a,sesion.id])
 }
 await db.query("select set_config('harvest.tipo_recipiente','',false)")
 const d=(await report(hoy,hoy)).datos.detalle.find(x=>x.trabajadorId===trabajador)
 assert.equal(d.jabas,4);assert.equal(d.jarras,4)
 assert.equal(d.kgEstimados,12.4);assert.equal(d.lecturasSinPeso,1)
 assert.equal(d.bonoJabas,4);assert.equal(d.bonoJarras,1.5);assert.equal(d.bono,5.5)
 const resumen=await call("harvest_proyectar_resumen($1,'America/Lima')",[A])
 assert.equal(resumen.resumen.total_lotes_configurados,2)
 assert.equal(resumen.resumen.total_jabas,4)
 const produccion=(await call('harvest_reportes_recipiente($1,$2,$3,null,null,$4,$4,$5)',[T,A,'PRODUCCION',hoy,'JARRA'])).datos
 assert.equal(produccion.metricas.totalJabas,4)
 assert.equal(produccion.metricas.kgEstimados,5.2)
 for (const tipo of ['PRODUCCION','RENDIMIENTO']) {
  const general=(await call('harvest_reportes_recipiente($1,$2,$3,null,null,$4,$4,$5)',[T,A,tipo,hoy,'GENERAL'])).datos
  const jabas=(await call('harvest_reportes_recipiente($1,$2,$3,null,null,$4,$4,$5)',[T,A,tipo,hoy,'JABA'])).datos
  assert.equal(general.metricas.totalJabas,jabas.metricas.totalJabas+produccion.metricas.totalJabas)
  assert.equal(general.ranking.find(p=>p.id===trabajador).jabas,8)
  assert.equal(general.metricas.kgEstimados,12.4)
  assert.equal(general.metricas.lecturasSinPeso,1)
 }
 assert.equal((await report(hoy,hoy)).datos.detalle.find(x=>x.trabajadorId===trabajador).bono,5.5)
 assert.equal((await config()).historial[0].jarrasMonto,1.5)
 // Old clients preserve jar settings rather than disabling them.
 await save({...limpiar(await config()),monto:3})
 assert.equal((await config()).jarrasHabilitado,true)
 const id=crypto.randomUUID()
 await db.query('insert into sesiones_lectura(id,tenant_id,lote_id,variedad_id,jabero_rol_id,iniciada_por_usuario_id,fecha_inicio) values($1,$2,$3,$4,$5,$6,statement_timestamp())',[id,T,sesion.lote_id,sesion.variedad_id,sesion.jabero_rol_id,sesion.iniciada_por_usuario_id])
 await assert.rejects(save({...limpiar(await config()),jarrasHabilitado:false,jarrasUmbral:3,jarrasMonto:2}),/bloqueada/)
 await assert.rejects(config(A,crypto.randomUUID()))
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from harvest_bonos_privado.reglas'))
 await db.exec('reset role')
})

test('el RPC conserva el recipiente en reintentos y rechaza cambiarlo', async () => {
 // The integration credential boundary is not part of this database fixture.
 await db.exec('create function public.autorizar_integracion_hoja(uuid,boolean) returns void language plpgsql as $$ begin perform public.autorizar_integracion_gestion_maestros(); end $$;')
 await db.query("update sesiones_lectura set estado='ACTIVA',fecha_fin=null where id=$1",[sesion.id])
 const lote=crypto.randomUUID(), codigo='REC-001', operacion=crypto.randomUUID(), registro=crypto.randomUUID()
 await db.query('select harvest_crear_lotes_tickets($1,$2)',[A,[{id:lote,tickets:[codigo]}]])
 await db.query('insert into harvest_cutovers(campania_id,tenant_id,version,activado_en,activado_por) values($1,$2,1,statement_timestamp(),$3)',[A,T,actor])
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 await db.query('select harvest_asignar_lote_tickets($1,$2,$3,$4,$5)',[A,OP,COSECHADOR,codigo,crypto.randomUUID()])
 const registrar=(tipo,c=A)=>call('harvest_registrar_recipiente($1,$2,$3,$4,$5,$6,$7,$8)',[c,OP,sesion.id,codigo,registro,new Date().toISOString(),operacion,tipo])
 const r=await registrar('JARRA')
 assert.equal(r.registro.tipo_recipiente,'JARRA');assert.equal(Number(r.registro.peso_kg),1.3)
 assert.equal((await registrar('JARRA')).registro.id,registro)
 await assert.rejects(registrar('JABA'),/otro recipiente/)
 await assert.rejects(registrar('CAJA'),/Selecciona/)
 await assert.rejects(registrar('JARRA',B))
 assert.equal(await call('(select count(*) from harvest_registros_cosecha where operacion_id=$1)',[operacion]),1)
 await db.query('insert into harvest_bonos_privado.correcciones_recipientes(registro_id,tenant_id,campania_id,tipo_recipiente,original,motivo) values($1,$2,$3,$4,$5,$6)',[registro,T,A,'JABA',{},'Prueba de reclasificación auditada'])
 const corregido=await call('(select to_jsonb(p) from harvest_produccion_reportable p where hecho_id=$1)',[registro])
 assert.equal(corregido.tipo_recipiente,'JABA'); assert.equal(corregido.peso_kg,2.4)
 assert.equal(await call('(select tipo_recipiente from harvest_registros_cosecha where id=$1)',[registro]),'JARRA')
 await assert.rejects(db.query('delete from harvest_bonos_privado.correcciones_recipientes where registro_id=$1',[registro]),/inmutables/)
})
