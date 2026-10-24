import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const sql = fs.readFileSync(
  path.join(dirname, '..', 'supabase', 'migrations', '20261001_consistencia_acceso_app.sql'),
  'utf8'
)

function cuerpo(nombre) {
  const patron = new RegExp(
    `create or replace function public\\.${nombre}\\([\\s\\S]*?end;\\s*\\$\\$;`,
    'i'
  )
  const resultado = sql.match(patron)?.[0]
  assert.ok(resultado, `No se encontró ${nombre}`)
  return resultado
}

const helperTrabajador = cuerpo('recalcular_acceso_app_trabajador')
const helperCampania = cuerpo('recalcular_accesos_app_campania')
const guardarRol = cuerpo('admin_guardar_rol_campania')
const guardarCampania = cuerpo('admin_guardar_campania')
const guardarTrabajador = cuerpo('admin_guardar_trabajador')

test('1. SUPERVISORA activa en campaña ACTIVA habilita acceso', () => {
  assert.match(helperTrabajador, /v_trabajador_activo is true/i)
  assert.match(helperTrabajador, /tcr\.activo = true/i)
  assert.match(helperTrabajador, /'SUPERVISORA'::public\.rol_trabajador/i)
  assert.match(helperTrabajador, /c\.estado = 'ACTIVA'::public\.estado_campania/i)
  assert.match(helperTrabajador, /values \(p_trabajador_id, true\)/i)
})

test('2. JABERO activo en campaña ACTIVA habilita acceso', () => {
  assert.match(helperTrabajador, /'JABERO'::public\.rol_trabajador/i)
  assert.match(helperTrabajador, /c\.estado = 'ACTIVA'::public\.estado_campania/i)
})

test('3. COSECHADOR por sí solo no concede acceso', () => {
  assert.doesNotMatch(helperTrabajador, /'COSECHADOR'::public\.rol_trabajador/i)
  assert.match(helperTrabajador, /else\s+update public\.usuarios_app\s+set activo = false/i)
})

test('4. trabajador inactivo fuerza acceso false', () => {
  const inicioCondicion = helperTrabajador.indexOf('if v_trabajador_activo is true then')
  const consultaRoles = helperTrabajador.indexOf('from public.trabajador_campania_rol tcr')
  assert.ok(inicioCondicion >= 0 && consultaRoles > inicioCondicion)
  assert.match(helperTrabajador, /v_debe_tener_acceso boolean := false/i)
})

test('5. cambio de estado de campaña dispara recálculo de sus trabajadores', () => {
  assert.match(
    guardarCampania,
    /v_estado_cambio := v_estado_anterior is distinct from v_campania\.estado;/i
  )
  assert.match(
    guardarCampania,
    /if v_estado_cambio then\s+perform public\.recalcular_accesos_app_campania\(v_campania\.id\);/i
  )
})

test('6. cerrar una campaña conserva acceso si otra campaña sigue autorizando', () => {
  assert.match(helperCampania, /perform public\.recalcular_acceso_app_trabajador\(v_trabajador_id\);/i)
  assert.doesNotMatch(helperCampania, /update public\.usuarios_app/i)
  assert.doesNotMatch(helperTrabajador, /tcr\.campania_id = p_campania_id/i)
})

test('7. reactivar campaña reconsidera SUPERVISORA histórica activa', () => {
  assert.match(helperCampania, /'SUPERVISORA'::public\.rol_trabajador/i)
  assert.doesNotMatch(helperCampania, /tcr\.activo = true/i)
  assert.match(helperTrabajador, /tcr\.activo = true/i)
})

test('8. reactivar campaña reconsidera JABERO histórico activo', () => {
  assert.match(helperCampania, /'JABERO'::public\.rol_trabajador/i)
  assert.match(helperTrabajador, /'JABERO'::public\.rol_trabajador/i)
})

test('9. reactivar campaña no habilita trabajador inactivo', () => {
  assert.match(helperTrabajador, /if v_trabajador_activo is true then/i)
  assert.match(helperTrabajador, /else\s+update public\.usuarios_app\s+set activo = false/i)
})

test('10. desactivar el último rol recalcula inmediatamente el acceso', () => {
  const updateRol = guardarRol.indexOf('update public.trabajador_campania_rol')
  const recalculo = guardarRol.indexOf('perform public.recalcular_acceso_app_trabajador(p_trabajador_id);')
  assert.ok(updateRol >= 0 && recalculo > updateRol)
})

test('11. reactivar rol mantiene reglas de vigencia y recalcula', () => {
  assert.match(guardarRol, /v_reactivacion := v_rol\.activo is not true and p_activo is true;/i)
  assert.match(guardarRol, /if v_es_nuevo or v_reactivacion or v_cambio_identidad then/i)
  assert.match(guardarRol, /perform public\.recalcular_acceso_app_trabajador\(p_trabajador_id\);/i)
})

test('12. cambiar trabajador en un rol recalcula trabajador anterior y nuevo', () => {
  assert.match(guardarRol, /v_trabajador_id_anterior := v_rol\.trabajador_id;/i)
  assert.match(guardarRol, /perform public\.recalcular_acceso_app_trabajador\(p_trabajador_id\);/i)
  assert.match(
    guardarRol,
    /if v_trabajador_id_anterior is distinct from p_trabajador_id then\s+perform public\.recalcular_acceso_app_trabajador\(v_trabajador_id_anterior\);/i
  )
})

test('13. admin_guardar_trabajador recalcula al cambiar activo', () => {
  const persistencia = guardarTrabajador.lastIndexOf("v_accion := 'ACTUALIZADO'")
  const recalculo = guardarTrabajador.indexOf(
    'perform public.recalcular_acceso_app_trabajador(v_trabajador.id);'
  )
  assert.ok(persistencia >= 0 && recalculo > persistencia)
})

test('14. usuarios_app nunca se elimina', () => {
  assert.doesNotMatch(sql, /delete\s+from\s+public\.usuarios_app/i)
  assert.match(helperTrabajador, /update public\.usuarios_app\s+set activo = false\s+where trabajador_id = p_trabajador_id;/i)
})

test('15. helpers internos no tienen EXECUTE para anon ni authenticated', () => {
  assert.match(
    sql,
    /revoke all\s+on function public\.recalcular_acceso_app_trabajador\(uuid\)\s+from public, anon, authenticated;/i
  )
  assert.match(
    sql,
    /revoke all\s+on function public\.recalcular_accesos_app_campania\(uuid\)\s+from public, anon, authenticated;/i
  )
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*recalcular_acceso_app_trabajador[\s\S]*to\s+(anon|authenticated)/i)
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*recalcular_accesos_app_campania[\s\S]*to\s+(anon|authenticated)/i)
})

test('16. firmas públicas de las RPC administrativas permanecen iguales', () => {
  assert.match(
    sql,
    /admin_guardar_rol_campania\(\s*p_rol_id uuid,\s*p_trabajador_id uuid,\s*p_campania_id uuid,\s*p_rol public\.rol_trabajador,\s*p_activo boolean\s*\)/i
  )
  assert.match(
    sql,
    /admin_guardar_campania\(\s*p_campania_id uuid,\s*p_codigo varchar,\s*p_nombre varchar,\s*p_fecha_inicio date,\s*p_fecha_fin date,\s*p_estado public\.estado_campania\s*\)/i
  )
  assert.match(
    sql,
    /admin_guardar_trabajador\(\s*p_trabajador_id uuid,\s*p_dni varchar,\s*p_nombres varchar,\s*p_apellidos varchar,\s*p_activo boolean\s*\)/i
  )
})

test('17. autorización administrativa y grants públicos se mantienen', () => {
  assert.match(guardarRol, /perform public\.autorizar_integracion_gestion_maestros\(\);/i)
  assert.match(guardarCampania, /perform public\.autorizar_integracion_gestion_maestros\(\);/i)
  assert.match(guardarTrabajador, /perform public\.autorizar_integracion_gestion_maestros\(\);/i)
  assert.doesNotMatch(sql, /grant\s+execute[\s\S]*?\bto\s+anon\b/i)
})

test('18. la migración no normaliza usuarios_app de forma masiva al aplicarse', () => {
  const fueraDeFunciones = sql
    .replace(/create or replace function[\s\S]*?\$\$;/gi, '')
  assert.doesNotMatch(fueraDeFunciones, /update\s+public\.usuarios_app/i)
  assert.doesNotMatch(fueraDeFunciones, /insert\s+into\s+public\.usuarios_app/i)
})

