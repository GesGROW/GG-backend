# F7.3 — Campañas y personal agrícola en el Portal

F7.3 convierte Campañas y Personal en páginas funcionales del container
`portal`. Reutiliza las tablas, claves, triggers y catálogos de Campaign
Management y Workforce. No mueve ni cambia funcionalmente la Aplicación de Campo.

## Páginas y tareas

| Ruta               | Operaciones                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `/campanias`       | Listado paginado; búsqueda por código/nombre; filtros por estado y cultivo                      |
| `/campanias/nueva` | Alta con cultivo, fechas y estado inicial existente                                             |
| `/campanias/:id`   | Detalle, edición, activación/cierre, catálogo de variedades y configuración de lotes operativos |
| `/personal`        | Listado paginado; búsqueda por DNI/nombre; filtro de activo/inactivo                            |
| `/personal/nuevo`  | Alta de trabajador sin requerir cuenta                                                          |
| `/personal/:id`    | Detalle, edición, activación/desactivación y participación en campañas                          |

Cada lista pagina de 50 en 50. Búsqueda y filtros se ejecutan en servidor sobre el
Tenant autorizado. Las URLs directas usan la misma política de permisos y módulos
que la navegación. Las páginas operativas se cargan por separado mediante React.lazy.

## Casos de uso y arquitectura

```text
React Campanias / Personal
  → Application crearGestionPortal
    → API pública crearGestionCampanias / crearGestionPersonal
      → puertos de gestión Campaign / Workforce
        → gestionAdapters provisional
          → RPC autorizados y constraints del servidor
```

Las APIs públicas añadidas viven en los BC existentes, con validaciones puras de
datos y puertos propios. Presentation no importa BCs, SDK ni RPC. Application sólo
importa `index.js` públicos de Campaign, Workforce, Identity y Platform; no accede
a sus internos ni a infraestructura. Cambiar a HTTP/Spring requiere otros adapters.

Campaign expone `listar`, `obtener`, `crear`, `editar`, `activar`, `cerrar`,
`cultivos`, `variedades`, `guardarVariedad`, `lotes` y `configurarVariedadesLote`.
Workforce expone `listar`, `obtener`, `crear`, `editar`, `activar`, `desactivar`,
`catalogo`, `participaciones`, `asignarRol` y `retirarRol`.

El payload de edición se limita a los campos permitidos. No se reenvían Tenant,
ownership, actor, identificadores internos, estados de cuenta Identity ni estados
operativos arbitrarios recibidos en un formulario.

## Campañas y cultivo

Se mantienen los estados existentes ACTIVA/CERRADA; no se introduce BORRADOR.
El alta permite elegir uno de esos estados. Editar datos no cambia estado.
`activar` exige campaña CERRADA y cultivo activo, conserva el inicio y limpia el fin.
`cerrar` exige ACTIVA y fecha de cierre válida; sin fecha usa el día del servidor
en America/Lima. Una transición repetida al mismo estado se rechaza.

El índice existente limita las campañas activas por `(tenant_id,cultivo_id)`.
Activar una segunda campaña del mismo cultivo falla: nunca se cierra otra
silenciosamente. Se conserva la unicidad `(tenant_id,codigo)` y la validación de
inicio obligatorio/fin no anterior. El trigger existente impide cambiar cultivo
cuando ya hay lotes o personal; en campañas sin esas relaciones puede cambiarse.
Un cultivo inactivo puede conservarse en datos históricos, pero no elegirse como
nuevo cultivo ni usarse para activar una campaña.

Los cultivos son el catálogo global existente: se consultan y se seleccionan en
la campaña, sin permitir que un Tenant modifique el catálogo de todos los demás.
Las variedades reutilizan el catálogo por Tenant y cultivo. Se pueden crear,
renombrar, activar o desactivar, sin borrarlas ni cambiar su cultivo histórico.
La UI advierte que el catálogo es compartido por las campañas de ese cultivo en
la empresa. No se crea un catálogo duplicado por campaña.

## Lotes operativos provisionales

Se muestran los lotes existentes como **lotes operativos de campaña**. No se crea
Farm Structure ni conceptos de fundo, sector o parcela física, ni un CRUD de
estructura física.

Se pueden configurar las variedades de un lote existente. La operación exige
que pertenezcan a la misma empresa y cultivo y que haya al menos una selección.
Una variedad inactiva sólo puede conservarse si ya estaba asociada activamente.
Las relaciones retiradas se desactivan, nunca se borran: las sesiones históricas
mantienen su FK `(lote_id,variedad_id)`. El campo legacy `lotes.variedad_id` conserva
su valor si sigue seleccionado o pasa a una de las selecciones válidas. Ninguna
sesión histórica se reescribe.

## Trabajadores y participación

Un alta duplicada por DNI falla en vez de sobrescribir silenciosamente a una
persona. La misma identificación puede existir en otro Tenant gracias a la clave
`(tenant_id,dni)`. Se editan DNI, nombres y apellidos, conservando UUID e historial.
El estado activo se modifica mediante operaciones separadas. No hay borrado físico.

Un trabajador no requiere cuenta Identity. Desactivar un trabajador no suspende
las membresías de un Usuario. La asociación opcional Usuario–Trabajador continúa
administrándose desde Configuración F7.2.

La participación reutiliza `trabajador_campania_rol`: asignar/reactivar exige
campaña y trabajador activos; retirar desactiva la relación sin borrar su UUID.
Se administran SUPERVISORA y COSECHADOR. JABERO aparece con su fecha diaria y queda
de consulta: F7.3 no renueva su vigencia ni convierte el registro del PDA en CRUD.
La operación rechaza nombres de rol Identity y cualquier rol no administrable.

El catálogo de selección de campañas en Workforce es una proyección mínima del
catálogo persistido, limitada al Tenant. Sirve sólo para la participación; no
concede edición Campaign ni exige que el usuario posea campaign.manage. La gestión
de campañas sigue protegida por su permiso y módulo propios.

Las operaciones reutilizan `recalcular_acceso_app_trabajador` y
`recalcular_accesos_app_campania` para mantener el acceso legacy de campo coherente
al cambiar estados o roles. No crean Usuarios Identity ni nuevas dependencias del
Portal sobre login DNI, ni alteran fechas de asignaciones diarias ajenas.

## Servidor, autorización y aislamiento

Aplicar después de F7.2 la migración
`backend/supabase/migrations/202610141200_portal_campaign_workforce.sql`. No añade tablas,
columnas, índices duplicados, catálogos ni datos de negocio. Es transaccional e
idempotente mediante un marcador de función creado al completar la misma transacción.
No modifica los cuerpos o firmas de RPC existentes de Sheets, PDA o Identity.

Las nuevas APIs `campaign_admin_*` y `workforce_admin_*` verifican en cada llamada:

1. Sesión real y Usuario activo mediante Identity.
2. Membresía activa en el Tenant seleccionado y empresa activa.
3. Permiso efectivo campaign.manage o workforce.manage.
4. Entitlement vigente CAMPAIGN o WORKFORCE mediante Platform F6.3/F6.4.
5. Ownership de todos los IDs y relaciones, además de FKs compuestas F6.1.

Sólo authenticated recibe las APIs públicas. Helpers, DTO internos y mutaciones
internas no se conceden a navegador, anon ni service_role, cerrando también los
grants por defecto del proveedor. Las tablas conservan RLS y sus ACL existentes:
las escrituras del Portal pasan por RPC, nunca por DML del navegador.

Las mutaciones bloquean la campaña/trabajador correspondiente y conservan los
constraints de unicidad. La autorización del frontend facilita UX; el servidor
no confía en Tenant, permisos o módulos arbitrarios enviados por React.

Cada llamada Application obtiene de nuevo el TenantContext y consulta Platform.
Al cambiar de Tenant/sesión se desmontan formularios y se descartan respuestas
tardías, incluso en A → B → A. Una revocación de módulo detectada durante una
operación vuelve a proteger la ruta. Un ID ajeno produce rechazo sin repetir
indefinidamente la consulta ni perder un TenantContext todavía válido.

## Compatibilidad y validación

Se verifica con PostgreSQL embebido el alta/edición, transiciones, cultivos,
variedades, historial de lote, DNI por empresa, participación, permisos, módulos,
ACL e idempotencia. Las suites existentes de Identity, ciclo comercial y Sheets
aplican también F7.3 para comprobar que continúan funcionando después de migrar.
Hay pruebas Application/adapters, arquitectura e interfaz React con puertos controlados.

Ejecutar desde `scc`: `npm test`, `npm run build`, `git diff --check`.
Desde `portal`: `npm test`, `npm run build`.

El Portal cubre progresivamente las tareas de Sheets de campañas, maestros de
trabajadores, variedades del cultivo, configuración de variedades de lotes y roles
laborales administrables. Sheets y Apps Script siguen disponibles. La PWA,
IndexedDB v5, Harvest F5, cutover, reportes, F7.2 y administración comercial se
conservan. Los assets de la PWA resultantes mantienen sus hashes anteriores.

La migración está preparada en el repositorio; estas pruebas no la despliegan en
Supabase remoto. F7.4 queda para gestión administrativa de tickets Harvest. Cosecha
y Reportes conservan sus vistas base y las herramientas actuales siguen operando.
