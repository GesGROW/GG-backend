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
let hoy, ayer, actor, sesion, otraSesion, trabajador, rol, funcionesAntes
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
  await db.exec(read('20261109130537_harvest_reportes_periodo_campania.sql'))
  await db.exec(read('20261109142155_harvest_reportes_pda_paquetes.sql'))
  await db.exec(read('20261109142553_harvest_reportes_pda_credencial_dispositivo.sql'))
  funcionesAntes = await call("(select jsonb_object_agg(proname,pg_get_functiondef(oid)) from pg_proc where oid in ('public.workforce_admin_dto(uuid,uuid)'::regprocedure,'public.workforce_cosecha_listar(uuid,jsonb)'::regprocedure,'public.harvest_admin_trabajador_campania(uuid,uuid,text,uuid)'::regprocedure))")
  await db.exec(read('20261109203912_harvest_tareo_exportacion.sql'))
})
after(() => db.close())


test('reportes PDA suman ambos recipientes y conservan la autorización por campaña', async () => {
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 const consultar = (tipo, c=A, periodo='CAMPANIA') => call('harvest_reportes_pda($1,$2,$3,$4)',[c,OP,tipo,periodo])
 const esperado = (await db.query(`select count(*)::int paquetes,
  count(*) filter(where tipo_recipiente='JARRA')::int jarras,
  count(*) filter(where coalesce(tipo_recipiente,'JABA')='JABA')::int jabas
  from harvest_produccion_reportable where campania_id=$1`,[A])).rows[0]
 const resumen=(await consultar('RESUMEN')).resumen
 assert.equal(resumen.total_paquetes,esperado.paquetes)
 assert.equal(resumen.total_jabas,esperado.jabas)
 assert.equal(resumen.total_jarras,esperado.jarras)
 for (const tipo of ['DIARIA','LOTES','RANKING']) {
  const r=await consultar(tipo)
  const filas=r.produccion ?? r.ranking
  assert.equal(filas.reduce((s,f)=>s+f.total_paquetes,0),esperado.paquetes)
  for (const f of filas) assert.equal(f.total_paquetes,f.total_jabas+f.total_jarras)
 }
 await assert.rejects(consultar('RESUMEN',crypto.randomUUID()))
 await assert.rejects(consultar('RANKING',A,'OTRO'))
 await assert.rejects(consultar('OTRO'))
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub])
})


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
 const inicio=await call('harvest_reportes_inicio($1,$2,$3,$4)',[T,A,'DASHBOARD','GENERAL'])
 assert.equal(inicio.datos.resumen.total_jabas,8)
 for (const [recipiente,cantidad] of [['GENERAL',8],['JARRA',4],['JABA',4]]) {
  const ranking=await call('harvest_reportes_inicio($1,$2,$3,$4)',[T,A,'RANKING',recipiente])
  assert.equal(ranking.datos.ranking.find(p=>p.cosechador_dni==='88990099').total_jabas,cantidad)
 }
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

test('tareo semanal deduplica lecturas y guarda códigos exactos con permisos', async () => {
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub])
 const jueves=await call("($1::date-((extract(isodow from $1::date)::int+3)%7))::text",[hoy])
 const consulta=()=>call('harvest_reportes_tareo($1,$2,$3,$4)',[T,A,jueves,trabajador])
 const antes=await consulta()
 assert.equal(antes.datos.filas.length,1)
 assert.equal(antes.datos.filas[0].codigoTrabajador,null)
 assert.equal(antes.datos.filas[0].nombre,'Bono Ana')
 // Supervisor can configure crop mappings but cannot change the workforce master.
 await assert.rejects(call('workforce_admin_codigo_externo($1,$2,$3)',[T,trabajador,'000123']))
 const f=antes.datos.filas[0]
 await call('harvest_admin_tareo_guardar($1,$2,$3)',[T,A,{trabajadores:[],imputaciones:[{
  loteId:f.loteId,variedadId:f.variedadId,actividad:'004',labor:'004041',consumidor:'TR0110006'
 }]}])
 await db.query(`insert into identity_rol_permisos(tenant_id,rol_id,permiso)
  select $1,id,'workforce.manage' from identity_roles where tenant_id=$1 and codigo='SUPERVISOR_COSECHA'
  on conflict do nothing`,[T])
 await call('workforce_admin_codigo_externo($1,$2,$3)',[T,trabajador,'000123'])
 const despues=(await consulta()).datos.filas[0]
 assert.equal(despues.codigoTrabajador,'000123')
 assert.equal(despues.actividad,'004');assert.equal(despues.labor,'004041');assert.equal(despues.consumidor,'TR0110006')
 const otro=(await db.query('select id from trabajadores where tenant_id=$1 and id<>$2 limit 1',[T,trabajador])).rows[0].id
 await assert.rejects(call('workforce_admin_codigo_externo($1,$2,$3)',[T,otro,'000123']),/ya está asignado/)
 await assert.rejects(call('harvest_reportes_tareo($1,$2,$3,$4)',[crypto.randomUUID(),A,jueves,trabajador]))
 await assert.rejects(call('harvest_reportes_tareo($1,$2,$3,$4)',[T,A,'2026-11-06',trabajador]),/jueves/)
 await assert.rejects(call('harvest_admin_tareo_guardar($1,$2,$3)',[T,B,{trabajadores:[],imputaciones:[{
  loteId:f.loteId,variedadId:f.variedadId,actividad:'004',labor:'004041',consumidor:'TR0110006'
 }]}]))
 await db.exec('set role authenticated')
 try {
  assert.equal((await consulta()).datos.filas[0].codigoTrabajador,'000123')
  await assert.rejects(db.query('select * from harvest_bonos_privado.tareo_imputaciones'))
 } finally { await db.exec('reset role') }
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 await assert.rejects(consulta())
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub])
})

test('tareo interno incluye jaberos, carga códigos al alta y edita nombre y código atómicamente', async () => {
 await db.exec(read('20261109212036_harvest_tareo_interno.sql'))
 await db.query('insert into harvest_bonos_privado.padron_trabajadores(tenant_id,dni,codigo) values($1,$2,$3)',[T,'88990088','000888'])
 const nuevo=(await db.query("insert into trabajadores(tenant_id,dni,nombres,apellidos,activo) values($1,'88990088','Nueva','Persona',true) returning codigo_externo",[T])).rows[0]
 assert.equal(nuevo.codigo_externo,'000888')
 const ficha=await call('harvest_admin_trabajador_campania($1,$2,$3,$4)',[T,A,'COSECHADOR',rol])
 assert.equal(ficha.codigoExterno,'000123')
 await call('harvest_admin_editar_trabajador_con_codigo($1,$2,$3,$4,$5,$6,$7,$8,$9)',[T,A,'COSECHADOR',rol,ficha.dni,'Ana','Bono',true,'000124'])
 assert.equal((await call('harvest_admin_trabajador_campania($1,$2,$3,$4)',[T,A,'COSECHADOR',rol])).codigoExterno,'000124')
 await assert.rejects(call('harvest_admin_editar_trabajador_con_codigo($1,$2,$3,$4,$5,$6,$7,$8,$9)',[T,A,'COSECHADOR',rol,ficha.dni,'No guardar','Bono',true,'000888']),/código/)
 assert.equal((await call('harvest_admin_trabajador_campania($1,$2,$3,$4)',[T,A,'COSECHADOR',rol])).nombres,'Ana')
 await db.query("insert into harvest_bonos_privado.labores_rol(tenant_id,rol,labor) values($1,'COSECHADOR','101333'),($1,'JABERO','160003')",[T])
 await db.query("insert into harvest_bonos_privado.consumidores(tenant_id,codigo,nombre,cultivo_codigo) values($1,'TR011003','Ventura','TR0110')",[T])
 await db.query("insert into harvest_bonos_privado.consumidores_lote(tenant_id,campania_id,lote_id,variedad_id,consumidor) values($1,$2,$3,$4,'TR011003')",[T,A,sesion.lote_id,sesion.variedad_id])
 const r=await call('harvest_reportes_tareo_rango($1,$2,$3,$4)',[T,A,hoy,hoy])
 const cosechador=r.datos.filas.find(x=>x.trabajadorId===trabajador)
 assert.equal(cosechador.labor,'101333');assert.equal(cosechador.consumidor,'TR011003')
 assert.equal(cosechador.actividad,null)
 assert.ok(r.datos.filas.some(x=>x.rol==='JABERO' && x.labor==='160003' && x.consumidor==='TR011003'))
 assert.equal(r.datos.filas.filter(x=>x.trabajadorId===trabajador).length,1)
 await db.exec('set role authenticated')
 try { await assert.rejects(db.query('select * from harvest_bonos_privado.padron_trabajadores')) }
 finally { await db.exec('reset role') }
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 await assert.rejects(call('harvest_reportes_tareo_rango($1,$2,$3,$4)',[T,A,hoy,hoy]))
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub])
})

test('las correspondencias se mantienen desde configuración con revisión y catálogo por empresa', async () => {
 await db.exec(read('20261109212353_harvest_tareo_consumidores_configuracion.sql'))
 const consulta=()=>call('harvest_admin_tareo_consumidores($1,$2)',[T,A])
 const inicial=await consulta()
 assert.ok(inicial.catalogo.some(c=>c.codigo==='TR011003'))
 const fila=inicial.filas.find(f=>f.loteId===sesion.lote_id && f.variedadId===sesion.variedad_id)
 assert.equal(fila.consumidor,'TR011003')
 const cambiado=await call('harvest_admin_tareo_consumidores($1,$2,$3)',[T,A,{revision:inicial.revision,filas:[{...fila,consumidor:''}]}])
 assert.notEqual(cambiado.revision,inicial.revision)
 await assert.rejects(call('harvest_admin_tareo_consumidores($1,$2,$3)',[T,A,{revision:inicial.revision,filas:[fila]}]),/Recarga/)
 await assert.rejects(call('harvest_admin_tareo_consumidores($1,$2,$3)',[T,A,{revision:cambiado.revision,filas:[{...fila,consumidor:'NO-EXISTE'}]}]),/catálogo/)
 await call('harvest_admin_tareo_consumidores($1,$2,$3)',[T,A,{revision:cambiado.revision,filas:[fila]}])
 await assert.rejects(call('harvest_admin_tareo_consumidores($1,$2)',[crypto.randomUUID(),A]))
})

test('revierte el tareo y conserva exactamente funciones anteriores, producción y bonos', async () => {
 const antes = await call("jsonb_build_object('produccion',(select count(*) from harvest_produccion_reportable),'reglas',(select count(*) from harvest_bonos_privado.reglas),'trabajadores',(select count(*) from trabajadores))")
 const bonos = (await report()).datos
 await db.exec(read('20261109220933_revertir_tareo_quijas.sql'))
 assert.equal(await call("to_regclass('harvest_bonos_privado.padron_trabajadores')"),null)
 assert.equal(await call("to_regclass('harvest_bonos_privado.consumidores')"),null)
 assert.equal(await call("to_regclass('harvest_bonos_privado.consumidores_lote')"),null)
 assert.equal(await call("to_regclass('harvest_bonos_privado.labores_rol')"),null)
 assert.equal(await call("to_regclass('harvest_bonos_privado.tareo_imputaciones')"),null)
 assert.equal(await call("(select count(*) from information_schema.columns where table_name='trabajadores' and column_name='codigo_externo')"),0)
 const despues = await call("jsonb_build_object('produccion',(select count(*) from harvest_produccion_reportable),'reglas',(select count(*) from harvest_bonos_privado.reglas),'trabajadores',(select count(*) from trabajadores))")
 assert.deepEqual(despues,antes)
 assert.deepEqual((await report()).datos,bonos)
 assert.deepEqual(await call("(select jsonb_object_agg(proname,pg_get_functiondef(oid)) from pg_proc where oid in ('public.workforce_admin_dto(uuid,uuid)'::regprocedure,'public.workforce_cosecha_listar(uuid,jsonb)'::regprocedure,'public.harvest_admin_trabajador_campania(uuid,uuid,text,uuid)'::regprocedure))"),funcionesAntes)
})

test('Excel semanal usa el bono diario autorizado una sola vez y conserva filtros y reglas', async () => {
 const antes=(await report(hoy,hoy)).datos
 await db.exec(read('20261111035453_bonos_excel_semanal.sql'))
 const r=await call('harvest_reportes_tareo_rango($1,$2,$3,$4,$5)',[T,A,hoy,hoy,trabajador])
 const esperado=antes.detalle.find(f=>f.trabajadorId===trabajador)
 assert.equal(r.datos.filas.length,1)
 assert.equal(r.datos.filas[0].dias[0].bono,esperado.bonoJabas+esperado.bonoJarras)
 assert.equal(r.datos.filas[0].totalSemanal,esperado.bono)
 assert.equal(r.datos.totalBono,esperado.bono)
 assert.deepEqual((await report(hoy,hoy)).datos,antes)
 const sinFiltro=await call('harvest_reportes_tareo_rango($1,$2,$3,$4)',[T,A,hoy,hoy])
 assert.equal(sinFiltro.datos.filas.reduce((s,f)=>s+f.totalSemanal,0),antes.totalBono)
 assert.ok(sinFiltro.datos.filas.every(f=>Array.isArray(f.dias)))
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 await assert.rejects(call('harvest_reportes_tareo_rango($1,$2,$3,$4)',[T,A,hoy,hoy]))
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub])
})

test('primer consumidor semanal y actividad conservan bonos y permisos', async () => {
 const antes=(await report(hoy,hoy)).datos
 await db.exec(read('20261111053330_bonos_primer_consumidor_actividad.sql'))
 await db.query("insert into harvest_bonos_privado.labores_rol(tenant_id,rol,labor,actividad) values($1,'COSECHADOR','101333','016') on conflict(tenant_id,rol) do update set actividad='016'",[T])
 await db.query("insert into harvest_bonos_privado.consumidores(tenant_id,codigo,nombre,cultivo_codigo) values($1,'PRIMERO','Primero','TR0110') on conflict do nothing",[T])
 await db.query(`insert into harvest_bonos_privado.consumidores_lote(tenant_id,campania_id,lote_id,variedad_id,consumidor)
 select distinct $1::uuid,$2::uuid,p.lote_id,p.variedad_id,'PRIMERO' from harvest_produccion_reportable p where p.campania_id=$2
 on conflict(tenant_id,campania_id,lote_id,variedad_id) do update set consumidor='PRIMERO'`,[T,A])
 const consulta=()=>call('harvest_reportes_tareo_rango($1,$2,$3,$4,$5)',[T,A,hoy,hoy,trabajador])
 let r=await consulta()
 assert.equal(r.datos.filas[0].consumidor,'PRIMERO')
 assert.equal(r.datos.filas[0].actividad,'016')
 assert.equal(r.datos.totalBono,antes.detalle.filter(f=>f.trabajadorId===trabajador).reduce((s,f)=>s+f.bono,0))
 await db.query('delete from harvest_bonos_privado.consumidores_lote where tenant_id=$1 and campania_id=$2',[T,A])
 assert.equal((await consulta()).datos.filas[0].consumidor,'')
 assert.deepEqual((await report(hoy,hoy)).datos,antes)
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 await assert.rejects(consulta())
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub])
})
