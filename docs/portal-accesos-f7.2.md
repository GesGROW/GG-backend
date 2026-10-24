# F7.2 — Empresa, usuarios, membresías y accesos

La pantalla y los recorridos de invitación se actualizan en [Activación de cuenta](portal-activacion-cuenta.md), con la migración `202610211000_portal_activacion_cuenta.sql` y un correo de acceso para cuentas existentes.

El Portal mantiene su container `portal`, React + Vite y su build independiente.
La PWA conserva sus entradas, IndexedDB v5, login DNI provisional, Harvest, cutover,
reportes, Sheets y Apps Script. No se añade CRUD operativo ni lógica comercial.

## Páginas y casos de uso

Todas estas rutas requieren sesión, membresía activa y permiso efectivo
`company.manage`; no requieren un módulo comercial para administrar Identity.

| Ruta                                        | Uso                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/configuracion` y `/configuracion/empresa` | Consultar empresa; editar únicamente nombre                                           |
| `/configuracion/usuarios`                   | Listar, buscar por nombre/correo y paginar de 50 en 50                                |
| `/configuracion/usuarios/:usuarioId`        | Detalle, nombre en esta empresa, roles, suspensión/reactivación y trabajador opcional |
| `/configuracion/invitaciones`               | Invitar o vincular una cuenta, consultar altas y reintentar pendientes                |
| `/configuracion/roles`                      | Catálogo fijo de roles y sus permisos efectivos                                       |
| `/configuracion/modulos`                    | Consulta de HARVEST, CAMPAIGN y WORKFORCE vigentes                                    |
| `/aceptar-invitacion`                       | Completar el enlace de Identity y establecer contraseña propia                        |

El catálogo conserva ADMIN_EMPRESA, GESTOR, OPERADOR_CAMPO y CONSULTA. Las
comparaciones de estos códigos limitan el catálogo de asignación; la autorización
se realiza por `company.manage`, nunca por el nombre de un rol. Una membresía puede
tener varios roles o ninguno. Los permisos efectivos son la unión de los roles
activos; una membresía o cuenta inactiva devuelve una lista vacía.

`Usuario` sigue siendo global e independiente de `Trabajador`. Se administra el
nombre visible **en una membresía**, su estado y sus accesos. No se cambia el estado
global de la cuenta ni el nombre mostrado en otras empresas. La asociación con un
trabajador permite elegir sólo trabajadores de la empresa, incluidos trabajadores
sin cuenta; se puede dejar vacía o retirar. No se crean ni editan trabajadores.

## Application y adapters

```text
Configuracion.jsx / Portal.jsx
  → crearPortal.configuracion / crearConfiguracion
    → TenantContext + puerto administracion + puerto entitlements
      → administracionAdapter / invitacionAdapter
        → Identity RPC autorizados / backend invitar-usuario
```

Application vuelve a resolver el TenantContext y exige `company.manage` antes de
cada llamada, y construye payloads limitados: ignora Tenant, propietario, actor,
credenciales y campos internos procedentes del formulario. El servidor verifica
de nuevo la sesión real, Usuario, Tenant, membresía, permiso y relaciones. Un ID
de empresa es una selección que se valida, no una autoridad.

Las rutas directas aplican la misma política que el menú. Al cambiar empresa o
sesión se desmontan formularios y resultados; se descartan respuestas tardías,
incluso al hacer A → B → A. Un recurso ajeno muestra un error sin repetir su
consulta automáticamente. La sesión expirada elimina el contenido protegido.

Presentation y Application no importan SDK, nombres de RPC ni secretos. Los
adapters pueden sustituirse por HTTP/Spring conservando los puertos y casos de uso.

## Persistencia y operaciones Identity

Aplicar después de F6.4 la migración idempotente
`backend/supabase/migrations/202610141100_portal_identity_admin.sql`.

- Añade `identity_membresias.nombre_empresa`, opcional, sin reescribir usuarios.
- Crea `identity_invitaciones`: intención con UUID idempotente, empresa, emisor,
  correo normalizado, nombre, roles, trabajador opcional, fechas del servidor,
  estado PENDIENTE/COMPLETADA y recibo persistido.
- Añade RPC `iam_admin_listar_usuarios`, `iam_admin_obtener_usuario`,
  `iam_admin_catalogo_accesos`, `iam_admin_guardar_membresia`,
  `iam_preparar_invitacion` e `iam_listar_invitaciones` para usuarios autorizados.
- Reutiliza `iam_obtener_empresa` y `iam_guardar_empresa`, cuyo contrato sólo
  permite editar el nombre.
- `iam_destinatario_invitacion` e `iam_completar_invitacion` son privados del
  backend confiable. No se conceden al navegador ni siquiera con company.manage.

Las búsquedas se limitan a miembros del Tenant seleccionado, sin descubrir cuentas
globales. Las FKs compuestas contrastan trabajador, actor y membresía resultante
con la empresa de la invitación. Los roles se comprueban activos y del mismo
Tenant al preparar y confirmar. La suspensión no borra Usuario ni otras membresías.
RLS filtra invitaciones; no hay DML directo de navegador. Se revocan también los
privilegios por defecto de `service_role` sobre la tabla y los RPC administrativos.

## Invitación y aprovisionamiento confiable

`crearProvisionarUsuario` es un caso de uso puro de Identity con puertos inyectados:
autorización, registro y proveedor. Lo compone únicamente el backend
`backend/supabase/functions/invitar-usuario/index.ts`.

1. El backend verifica el JWT con Auth y prepara la intención mediante un cliente
   con el JWT del emisor. SQL exige company.manage en la empresa solicitada.
2. Sólo el backend puede consultar si el correo de la intención ya tiene identidad
   de proveedor. El navegador no elige un sujeto Auth ni consulta auth.users.
3. Si existe, se vincula. Si no existe, el adapter privilegiado invita por correo
   con un destino fijo configurado por el servidor.
4. SQL vuelve a comprobar que el emisor siga activo y autorizado, que sujeto y
   correo coincidan con Auth persistido y que roles/trabajador pertenezcan al Tenant.
5. Crea el Usuario si falta, la identidad de proveedor y la membresía con sus roles.
   Una cuenta puede pertenecer a varias empresas. Una membresía existente conserva
   sus roles y estado, incluso si estaba suspendida: se edita desde su detalle.
6. Persiste un recibo. Repetir el mismo UUID y la misma intención devuelve el mismo
   resultado. Reutilizarlo con otro actor, Tenant o payload se rechaza. Después de
   una respuesta perdida, se recupera la identidad existente sin duplicarla.

El receptor completa `/aceptar-invitacion`. Sólo infraestructura procesa el token
de invitación o el fragmento Auth, limpia la URL y verifica la cuenta antes de
establecer la contraseña. Los tokens no pasan al estado React. Después se resuelve
de nuevo Identity y su TenantContext. No se envía ni solicita una contraseña al
administrador. Un enlace expirado no permite establecerla.

Las credenciales privilegiadas residen exclusivamente en variables del backend.
No hay service-role key ni API Auth administrativa en `portal/src` o su env.
El handler limita campos, usa CORS con origen fijo, respuestas sin caché y errores
sanitizados. CORS no sustituye la autorización del JWT y de SQL.

## Despliegue

El código no aplica migraciones remotas, no despliega funciones ni envía correos
reales durante las pruebas. Para habilitar altas en un entorno:

1. Aplicar `202610141100_portal_identity_admin.sql` después de F6.1–F6.4.
2. Configurar en secretos de la función `PORTAL_ORIGIN`, por ejemplo
   `https://portal.su-dominio.example`, sin ruta ni slash final. Las variables
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` se resuelven
   exclusivamente en el runtime confiable de Supabase.
3. Desplegar `invitar-usuario` con Supabase CLI desde `scc/backend`, indicando el proyecto
   correspondiente. `backend/supabase/config.toml` desactiva la validación JWT automática
   de gateway para esta función; la función verifica obligatoriamente la sesión
   mediante `auth.getUser(jwt)` antes de acceder a la intención.
4. Configurar en Auth el correo/SMTP y permitir el redirect exacto
   `<PORTAL_ORIGIN>/aceptar-invitacion`. El enlace estándar con fragmento Auth se
   admite; una plantilla con token_hash debe dirigir a esa misma ruta con
   `?type=invite&token_hash={{ .TokenHash }}`. El hosting necesita fallback SPA.
5. El env del Portal conserva únicamente URL y clave pública; no añadir secretos.

El primer administrador de una empresa sigue requiriendo una asignación confiable
inicial F6.2. F7.2 permite a ese administrador gestionar el resto sin SQL. No se
crean Tenants desde una pantalla ordinaria ni se concede autoridad comercial.

## Platform y compatibilidad

Los módulos se consultan mediante `crearEntitlements` y los contratos públicos
Platform F6.3/F6.4. No hay escritura en planes, suscripciones o entitlements.
`company.manage` no concede `subscription.manage`: la delegación comercial de
confianza continúa siendo necesaria. El SCC conserva su suscripción piloto y sus
tres módulos; se verifica reejecución de la migración y acceso legacy por DNI.

Las pruebas cubren SQL real embebido con RLS/ACL, el caso de aprovisionamiento,
transporte HTTP, puertos, adapters, aislamiento de respuestas y UI con React
Testing Library. La función tiene comprobación de tipos con Deno. Ejecutar:

```powershell
# scc
npm.cmd test
npm.cmd run build
git diff --check
# scc/portal
npm.cmd test
npm.cmd run build
```

Para inspección local con datos ficticios: `/tests/visual.html?settings` desde el
servidor de desarrollo del Portal. La fixture no entra al build de producción.

F7.3 podrá desarrollar los siguientes flujos operativos del Portal según su alcance.
Campañas, Personal, Cosecha y Reportes mantienen sus shells F7.1; esta fase no añade
su CRUD ni sustituye las herramientas operativas actuales.
