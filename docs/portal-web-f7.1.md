# F7.1 — Foundation del Portal Web de Gestión

Se crea `portal` sin mover la PWA del repositorio ni cambiar funcionalmente
sus entradas, componentes, comandos, login, dependencias o IndexedDB v5.
Portal Web y Aplicación de Campo son dos containers, con sus propios builds y
servidores. F7.1 añade únicamente la base del Portal; no reemplaza Sheets,
Apps Script ni la administración comercial existente.

## Stack y límites

React 19 + Vite 8 + React Router, JavaScript para compartir las APIs públicas
de los BC existentes sin crear una conversión masiva o duplicar entidades.
Las versiones instaladas están fijadas en el `package-lock.json` del Portal.

```text
Presentation React
  → Application crearPortal / política de rutas
    → puertos identity, acceso, entitlements
      → infrastructure/supabase
        → Identity F6.2 / Platform F6.3–F6.4 en servidor
```

`main.jsx` ensambla presentación con `bootstrap.js`; los componentes reciben la
Application por inyección. Presentation no importa BCs, SDK, cliente Auth ni
RPC. Application no importa DOM, almacenamiento del navegador ni infraestructura.
Reutiliza los contratos públicos `crearAccesoAutenticado`, `TenantContext` y
`crearEntitlements`. Pruebas de arquitectura comprueban también las dependencias
transitivas para impedir acceso indirecto a infraestructura.

## Sesión y empresa autorizada

1. El adapter inicia sesión mediante el proveedor provisional. Ningún componente
   React recibe JWT ni necesita DNI.
2. La restauración verifica sesión con `getUser`, y consulta `iam_obtener_identidad`.
3. El selector se construye desde membresías activas del perfil. Sin membresía,
   se muestra un estado sin acceso a áreas operativas.
4. Una única empresa se selecciona automáticamente. Con varias se requiere
   elegir una; la selección se mantiene en memoria y se solicita de nuevo al
   recargar, sin persistir autoridad en localStorage.
5. `iam_resolver_tenant_context` valida sesión, Usuario, membresía y empresa.
   Application contrasta además que el Tenant devuelto y el Usuario coincidan
   con la selección/perfil verificados.
6. El puerto Platform consulta los módulos del Tenant con
   `platform_puede_usar_modulo`. El servidor revalida la membresía y resuelve
   entitlements vigentes; las listas de UI no conceden capacidades.

El Portal distingue credenciales inválidas, sesión expirada, permiso denegado y
error de transporte mediante errores de puerto. Una sesión expirada limpia
Usuario, TenantContext, módulos, navegación y contenido, y vuelve al login.
Un fallo de conexión también elimina contenido protegido y ofrece reintento.
Un cierre que falla no se considera completado: mantiene la aplicación bloqueada
y permite reintentar el logout.

La suscripción a eventos Auth se realiza únicamente en el adapter. Sus callbacks
notifican fuera del lock del SDK y se liberan al desmontar Application. Logout
usa scope local y almacenamiento `gesgrow.portal.auth.v1`, separado de la PWA.
Login/logout se serializan para que una respuesta tardía de login no restaure
la sesión después del cierre solicitado.

## Rutas y navegación

BrowserRouter admite enlaces y URLs directas. Una política Application única
decide tanto menú visible como acceso lógico al contenido, sin comparar nombres
de roles. Mientras se valida una ruta no se renderiza el contenido anterior.

| Ruta | Permiso efectivo | Capacidad |
| --- | --- | --- |
| `/` Inicio | TenantContext válido | Base |
| `/campanias` Campañas | `campaign.manage` | CAMPAIGN |
| `/personal` Personal | `workforce.manage` | WORKFORCE |
| `/cosecha` Cosecha | `harvest.view` o `harvest.operate` | HARVEST |
| `/reportes` Reportes | `reports.view` | HARVEST |
| `/configuracion` Configuración | `company.manage` | Base |

Cada entrada de ruta vuelve a verificar contexto y entitlements, incluso para
URL oculta o modificada manualmente. Se revalida también al recuperar foco o
visibilidad. Las rutas inexistentes tienen un estado propio. Ocultar un enlace
no concede ni protege por sí mismo la operación: los RPC existentes siguen
siendo autoridad, y los shells de F7.1 no ejecutan CRUD.

No se habilitan planes, permisos o módulos desde query parameters, payloads de
presentación o un tenantId externo. La elección de empresa es una solicitud que
debe validar Identity; el UUID no es una credencial.

## Aislamiento de estado

Cambiar de empresa elimina inmediatamente contexto, capacidades, rutas y
Usuario presentado hasta terminar la validación. Se obtiene un nuevo perfil
y se resuelve el Tenant solicitado en servidor. Un contador de generación
descarta resultados y errores antiguos de otra empresa o sesión.

El scope de presentación cambia con la empresa/sesión y remonta los contenidos.
No hay caché de datos operativos ni stores del PDA compartidos con el Portal.
Después del cambio se navega al Inicio y se recalculan las áreas disponibles.
Revocar una membresía deja la aplicación en selección o sin empresas; cambiar
la cuenta autenticada invalida el contexto que pertenecía al Usuario anterior.

## Layout y adapters

Layout responsive con sidebar, navegación activa, header, empresa, Usuario,
selector entre empresas, logout, estados de carga/error y contenido. En móviles
la navegación se despliega mediante un botón; incluye foco visible, labels y
enlace para saltar al contenido. Inicio muestra sólo áreas permitidas; las otras
cinco secciones son shells y no incluyen dashboards o CRUD ficticios.

Los adapters del Portal se encuentran en
`portal/src/infrastructure/supabase/`:

- `crearConexion.js`: cliente propio, configuración pública y aislamiento de sesión.
- `adapters.js`: puerto Identity (login/verificación/logout/eventos), puerto Acceso
  (perfil/contexto) y puerto Entitlements (resolución de módulo).

Sólo esos adapters conocen SDK, nombres RPC y errores del proveedor. Posteriormente
pueden sustituirse por HTTP/Spring con los mismos puertos. No se duplican modelos
de Usuario, TenantContext ni reglas de suscripción dentro de React.

## Arranque, despliegue y validación

El [README del Portal](../portal/README.md) detalla instalación, variables,
puertos, comandos y fixtures locales. El Portal genera `portal/dist` y no
registra service worker. Debe hospedarse en un origen distinto de la PWA: su
service worker actual tiene scope `/`. BrowserRouter requiere fallback a
`index.html` para recargar rutas internas. F7.1 no cambia hosting ni despliega.

Las pruebas cubren login/restauración/logout, falta de membresías, una/múltiples
empresas, elección inválida, expiración, revocación, permisos/entitlements,
URL protegida, cambio de cuenta/Tenant, respuestas tardías, fallos de conexión,
estado aislado, adapters y límites de dependencias. Vitest con jsdom y React
Testing Library ejercita los componentes con Application real y puertos de
prueba. Se ejecutan además las suites y build originales de la PWA.

No se usaron cuentas de producción ni se verificó una sesión contra Supabase
remoto. La inspección visual manual en navegador queda para staging: no hay
navegador conectado en esta sesión. Los fixtures permiten realizarla sin datos
reales; no forman parte del build de producción.

## F7.2

Quedan las primeras vistas operativas completas, consultas/listados y CRUD
según el alcance que se autorice, con sus puertos, pruebas y controles servidor.
Los permisos y módulos se volverán a validar para cada operación, sin delegar
autoridad al menú ni al estado de React. La incorporación al Portal de reportes
y administración comercial F6.4 se planificará explícitamente; sus flujos actuales
permanecen disponibles. No se retira Sheets ni se implementan pagos en F7.1.

Referencias de stack: [Vite](https://vite.dev/guide/) y
[rutas declarativas React Router](https://reactrouter.com/start/declarative/routing).
