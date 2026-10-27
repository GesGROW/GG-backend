# Backend de vinculación de PDA

Migración: `supabase/migrations/20261027152741_pda_vinculacion_dispositivos.sql`.
Primera entrega local, 2026-10-27. No modifica por defecto el acceso de los PDA
actuales. El portal consume los RPC de gestión; la integración operativa de
la PWA sigue pendiente.

## Autenticación y almacenamiento

Todos los RPC nuevos requieren una sesión de cuenta Supabase Auth y el rol
`authenticated`. El actor se resuelve desde `auth.uid()` e Identity & Access;
no se acepta un DNI, usuario, rol ni conjunto de permisos como autoridad.
En esta entrega se reutiliza el acceso de cuenta existente con correo y
contraseña. El futuro formulario DNI y PIN no está implementado.

El QR permite vincular nuevas instalaciones de una empresa; no es una sesión.
Un administrador con `company.manage` o supervisor con `harvest.manage` lo genera.
Esta autorización se incorpora mediante `20261027175118_pda_supervisores_gestion.sql`,
que debe aplicarse después de la migración inicial. El usuario que vincula debe
tener una membresía activa y `harvest.operate`, con HARVEST habilitado.
Los cultivos y campañas siguen sujetos a las reglas de participación existentes.

La PWA debe generar y conservar antes de enviar la vinculación:

```js
const dispositivoId = crypto.randomUUID()
const credencial = Array.from(crypto.getRandomValues(new Uint8Array(32)),
  (byte) => byte.toString(16).padStart(2, '0')).join('')
```

La credencial es un secreto de la instalación, independiente de la cuenta del
supervisor. No usar el número de serie, el DNI, un PIN ni el UUID como secreto.
En el servidor solo se almacenan hashes SHA-256 del token QR y de la credencial.
Las tablas viven en `pda_privado`, con RLS y sin permisos de lectura o escritura
para clientes. No añadir ese esquema a los expuestos en la Data API.

## RPC administrativos

| RPC | Parámetros | Respuesta |
| --- | --- | --- |
| `pda_generar_vinculacion` | `p_tenant_id`, `p_vigencia_horas` (1–168, predeterminado 24) | `id`, `tenantId`, `token`, `venceEn` |
| `pda_administrar_dispositivos` | `p_tenant_id` | `tenantId`, `accesoVinculadoObligatorio`, `vinculacion`, `dispositivos` |
| `pda_revocar_dispositivo` | `p_tenant_id`, `p_dispositivo_id` | Dispositivo con estado `REVOCADO` |
| `pda_configurar_acceso` | `p_tenant_id`, `p_obligatorio` | Empresa y estado del acceso obligatorio |

Generar, listar y revocar admiten `company.manage` o `harvest.manage` en la empresa.
`pda_configurar_acceso` sigue requiriendo `company.manage`. Generar el QR o activar el acceso obligatorio
también exige HARVEST habilitado. Consultar o revocar equipos no exige que el
módulo continúe contratado.

Generar invalida los QR anteriores, conserva su historial y devuelve el nuevo
token una sola vez. El portal debe convertir ese token en un enlace/QR de su
PWA con una URL de confianza configurada para el despliegue. No hay URL de
descarga ni destino de aplicación fijados en SQL. Los listados no contienen el
token, la credencial ni sus hashes. Si se pierde el token, generar otro.

Revocar es idempotente. Regenerar el QR no revoca dispositivos y revocar un
equipo no invalida el QR. Una instalación revocada no se reactiva al escanearlo.
No hay una función de cambio de empresa ni de borrado de historial en esta fase.

## RPC de la aplicación

`pda_vincular_dispositivo(p_token, p_dispositivo_id, p_credencial, p_nombre)`
devuelve `dispositivo` y `contexto`. El nombre admite de 1 a 80 caracteres.
Exige QR activo y no vencido, sesión autenticada, permiso operativo y HARVEST.
Repetir la solicitud con el mismo identificador y credencial conserva el equipo
y su autor original; no crea una segunda vinculación. Otra credencial o empresa
para ese identificador se rechaza. Si el QR cambió durante un reintento, intentar
`pda_obtener_contexto` con la credencial conservada para comprobar si el primer
envío ya vinculó el equipo.

`pda_obtener_contexto(p_dispositivo_id, p_credencial)` devuelve:

- `dispositivo`: identidad, empresa, nombre, estado y fechas del equipo.
- `contexto`: usuario, membresía, empresa y permisos efectivos actuales.
- `campanias`: las campañas que puede consultar el usuario en esa empresa.
- `validadoEn` y `autorizadoHasta`: última validación y próxima medianoche de Lima.

Cada llamada revalida equipo, usuario, membresía, permisos, empresa y módulo.
La fecha orienta la futura autorización local diaria; no es una credencial
firmada ni permite saltarse las comprobaciones online. El backend no puede
notificar una revocación a un PDA desconectado.

`pda_operar(p_dispositivo_id, p_credencial, p_campania_id, p_operacion_id,
p_tipo, p_datos)` ejecuta las operaciones IAM existentes con control de empresa,
equipo, permisos, módulo y participación en la campaña:

| `p_tipo` | Campos de `p_datos` | Identificador del hecho |
| --- | --- | --- |
| `ASIGNAR_LOTE` | `trabajadorId`, `codigo` | `p_operacion_id` identifica la asignación |
| `INICIAR_SESION` | `loteId`, `variedadId`, `jaberoRolId` | `p_operacion_id` es también el ID de sesión |
| `REGISTRAR_COSECHA` | `sesionId`, `codigo`, `fecha` | `p_operacion_id` es también el ID del registro |
| `CERRAR_SESION` | `sesionId` | `p_operacion_id` identifica el comando de cierre |

Los IDs son UUID y `fecha` debe incluir zona horaria. Las validaciones de Harvest
siguen exigiendo asignación, sesión válida, cutover y consumo único del ticket.
El resultado mantiene la forma devuelta por el RPC IAM correspondiente.

La operación y su recibo se confirman en la misma transacción. Un reintento debe
conservar UUID, tipo, datos, campaña, usuario y dispositivo; recibe el resultado
original sin repetir el hecho. No se pueden adoptar comandos previos de otra
ruta ni cambiar el autor al iniciar sesión con otro supervisor. Los rechazos
revierten todas las escrituras. La revocación y los permisos se comprueban
también antes de devolver recibos existentes.

El nuevo contrato todavía no sustituye la descarga de snapshots/caché, el alta
de jaberos ni los payloads de la cola antigua. La integración PWA debe resolver
esos contratos antes de activar el acceso obligatorio.

## Transición por empresa

La migración deja `accesoVinculadoObligatorio = false`. En ese estado los nuevos
RPC ya comprueban el equipo, mientras las rutas existentes conservan su acceso.
La revocación de un dispositivo afecta al contrato nuevo; no convierte por sí
sola las rutas antiguas de DNI en acceso autenticado.

Después de migrar los flujos de la PWA y resolver su cola pendiente, el
administrador puede activar `pda_configurar_acceso(tenant, true)`:

- Las operaciones IAM que exigen `harvest.operate` deben entrar por `pda_operar`.
- La autorización legacy por campaña y `validar_operador` rechazan el acceso
  por DNI sin sesión y equipo verificados, incluido el alta legacy de jaberos.
- Unas cabeceras enviadas por el cliente no habilitan una ruta IAM sin recibo.
- La administración del portal y las consultas con otros permisos conservan
  sus propias reglas; este control está dirigido a la escritura operativa.

La lista legacy de campañas por DNI no se sustituye en esta fase; el control
bloquea las rutas de operación, no convierte ese listado en una consulta privada.
La desactivación administrativa permite volver al modo de compatibilidad y debe
tratarse como una decisión de transición, no como una acción rutinaria del PDA.

## Verificación

```sh
node --test tests/pda-vinculacion-sql.test.js
npm test
```

Las pruebas ejecutan las migraciones y los RPC contra PGlite; comprueban ACL con
roles `anon` y `authenticated`, hashes, vencimiento, revocación, aislamiento,
permisos actuales, reintentos, las cuatro operaciones reales y las guardas de
transición. El proveedor Auth se simula con `auth.uid()` en la fixture.

Resultado de esta entrega: 629 pruebas aprobadas, 0 fallidas, incluidas las nueve
pruebas nuevas de vinculación. `npm run verify:core` confirma que los 109 archivos
del paquete instalado coinciden con la fuente canónica de las Edge Functions.

El CLI se usó para crear la migración. `db advisors --local` y `migration list
--local` no pudieron conectar porque no hay un servidor Supabase local en
`127.0.0.1:54322`. Los controles de catálogo, grants y RLS están cubiertos por las
pruebas locales; queda pendiente el análisis del CLI en un entorno Supabase y
la prueba de extremo a extremo con Auth y la PWA. No se aplicó nada en producción.

La organización de funciones y privilegios sigue la
[documentación de funciones de Supabase](https://supabase.com/docs/guides/database/functions).
