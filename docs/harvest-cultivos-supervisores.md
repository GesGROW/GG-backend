# Cultivos administrados por supervisores

Migración local: `202610221000_harvest_cultivos_supervisores.sql`. Aplicar después de las migraciones existentes, incluida `202610211200_usuarios_accesos_modulo.sql`. No convierte cultivos ni campañas históricos y no activa automáticamente el cutover Harvest. No requiere cambios en los contratos RPC del frontend.

Antes de modificar el esquema o los datos, la migración verifica las firmas exactas de las fachadas IAM, Campaign, administración Harvest y reportes que necesita. Un esquema que solo llegó a F7.2 se rechaza con SQLSTATE `55000`, indicando los archivos pendientes de F7.3 (`202610141200_portal_campaign_workforce.sql`), F7.4 (`202610141300_portal_harvest_admin.sql`) y F7.5 (`202610141400_portal_reportes.sql`), además del detalle de las funciones ausentes. Los marcadores de versión por sí solos no sustituyen la comprobación de fachadas.

## Contrato RPC

Todos los endpoints son `SECURITY DEFINER`, tienen `search_path` fijo y requieren sesión autenticada, membresía activa del tenant, permiso efectivo `harvest.manage` y capacidad comercial `HARVEST`. La cuenta del actor se resuelve desde la sesión. Ser owner o tener un rol laboral `SUPERVISORA` no concede participación en un cultivo.

| RPC                          | Argumentos                                                                | Resultado                                                                          |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `harvest_cultivos_catalogo`  | `p_tenant_id uuid`                                                        | `{propios: Cultivo[], disponibles: CultivoDisponible[], solicitudes: Solicitud[]}` |
| `harvest_cultivos_crear`     | `p_tenant_id uuid, p_operacion_id uuid, p_datos jsonb`                    | `{cultivoId, campaniaId}`                                                          |
| `harvest_cultivos_campania`  | `p_tenant_id uuid, p_operacion_id uuid, p_cultivo_id uuid, p_datos jsonb` | `{cultivoId, campaniaId}`                                                          |
| `harvest_cultivos_solicitar` | `p_tenant_id uuid, p_cultivo_id uuid`                                     | `Solicitud`                                                                        |
| `harvest_cultivos_resolver`  | `p_tenant_id uuid, p_solicitud_id uuid, p_aceptar boolean`                | `Solicitud`                                                                        |

`harvest_cultivos_crear.p_datos`:

```json
{
  "nombre": "Arándanos",
  "color": "#3B64EC",
  "variedades": ["Ventura", "Biloxi"],
  "lotes": [
    { "nombre": "Norte", "variedades": ["Ventura", "Biloxi"] },
    { "nombre": "Sur", "variedades": ["Biloxi"] }
  ],
  "campania": {
    "nombre": "Temporada 2027",
    "fechaInicio": "2027-01-01",
    "fechaFin": "2027-12-31"
  }
}
```

`harvest_cultivos_campania.p_datos` es el objeto `campania` del ejemplo. `nombre`, `fechaInicio` y `fechaFin` son obligatorios. Las fechas usan `YYYY-MM-DD`: para operaciones nuevas el inicio debe ser hoy o posterior según el reloj del servidor en `America/Lima`, y el fin debe ser igual o posterior al inicio. Ni la zona horaria del cliente ni la de la sesión SQL cambian ese límite. Ajustar las fechas del ejemplo al día de uso. Los nombres tienen de 1 a 100 caracteres tras quitar espacios exteriores.

El color debe tener prefijo `#` y pertenecer exclusivamente a esta paleta: `#F92D2D`, `#FF8800`, `#1FD200`, `#137D15`, `#3B64EC`, `#6F1D79`, `#D54E4E`, `#F1E907`, `#ED3BB8`, `#D9D9D9`. Se aceptan minúsculas y se normalizan a mayúsculas. La restricción de paleta también existe en la tabla de cultivos administrados.

Se requieren de 1 a 100 variedades y de 1 a 100 lotes. Cada lote necesita al menos una variedad declarada en el cultivo. La comparación de nombres de variedades y lotes ignora mayúsculas y espacios exteriores; los duplicados se rechazan.

DTOs:

```text
Variedad = {id, nombre}
Lote = {id, nombre, variedades: Variedad[]}
Supervisor = {id, nombre, email}
Campania = {id, codigo, nombre, estado, fechaInicio, fechaFin}
Cultivo = {id, nombre, color, variedades: Variedad[], lotes: Lote[], supervisores: Supervisor[], campanias: Campania[]}
CultivoDisponible = Cultivo + {solicitudEstado: null | "PENDING" | "APPROVED" | "REJECTED"}
Solicitud = {id, cultivoId, cultivoNombre, nombre, email, estado: "PENDING" | "APPROVED" | "REJECTED"}
```

Los `id` de cultivo, variedad y campaña son los UUID de las tablas operativas existentes. Los lotes del catálogo son plantillas, con sus propios UUID; cada campaña materializa nuevos `lotes` operativos y sus asociaciones `lote_variedades`. Los códigos operativos se generan en el servidor. El creador queda registrado como supervisor participante sin crear un trabajador ni un rol laboral ficticio.

## Campañas e idempotencia

Crear cultivo confirma en una sola transacción el cultivo real, su propietario tenant, color, supervisor creador, variedades, plantillas, primera campaña, lotes operativos y recibo. Crear campaña adicional exige participación y reutiliza las mismas variedades y plantillas sin modificar campañas previas.

Una campaña nueva comienza `ACTIVA`. Si el cultivo ya tiene una campaña activa, se rechaza sin cambios con el mensaje: «Ya existe una campaña activa para este cultivo. Cierre la campaña activa antes de crear otra campaña.» No hay cierre automático.

**Limitación actual del cierre:** el RPC existente `campaign_admin_cerrar(p_tenant_id uuid, p_id uuid, p_fecha_fin date)` requiere `campaign.manage` y la capacidad `CAMPAIGN`; para un cultivo administrado también exige participación en ese cultivo. El rol `SUPERVISOR_COSECHA`, con acceso solo a `HARVEST`, no recibe ese permiso ni esa capacidad por crear el cultivo. Por tanto, este flujo permite crear la primera campaña, pero no ofrece al supervisor Harvest un cierre para continuar con otra mientras la anterior siga activa. El cierre requiere una cuenta participante que tenga además la autorización de Campaign. Una futura pantalla operativa podrá cubrir ese flujo; este cambio no agrega un RPC ni una interfaz de cierre, ni amplía los permisos del supervisor.

Los UUID de operación son globales. Reintentar con el mismo tenant, actor, tipo y JSON devuelve exactamente el resultado anterior. El recibo se consulta antes de validar las fechas y la paleta de una intención nueva: un reintento ya confirmado sigue funcionando aunque el inicio sea anterior a hoy, sin crear otra campaña. Reutilizarlos con otra intención se rechaza. El frontend debe conservar el UUID mientras reintenta la misma intención. Una transacción fallida no guarda recibo y puede reintentarse. Un bloqueo por cultivo y el índice existente de una campaña activa protegen la creación de campañas; las pruebas PGlite no demuestran concurrencia entre conexiones PostgreSQL independientes.

## Solicitudes y autorización

`disponibles` permite descubrir solo cultivos administrados del mismo tenant y devuelve el mismo DTO, con el estado de la solicitud del actor. Es una excepción explícita de descubrimiento de metadatos: no autoriza consultar producción, registros o tickets de esas campañas.

Solicitar crea `PENDING`; repetir conserva la misma solicitud. `solicitudes` muestra solo las pendientes de los cultivos donde el actor ya participa. Solo un supervisor participante, actualmente autorizado, puede aprobar o rechazar; el solicitante, otro supervisor ajeno al cultivo y el owner sin acceso operativo no pueden resolverla. Aprobar valida que el solicitante siga siendo supervisor activo y agrega la participación en la misma transacción. Repetir la misma decisión es idempotente; cambiar una decisión ya resuelta se rechaza. Un rechazo es definitivo en este contrato y no crea otra solicitud al reintentar.

Administración Harvest, listados de campañas, reportes y lecturas directas por UUID o ticket verifican la participación persistida. El índice administrativo se filtra antes de contar y paginar. Tener permisos de Campaign adicionales no evita la restricción. Revocar la membresía del tenant o `harvest.manage` revoca inmediatamente el acceso a cultivos administrados.

Se conserva una excepción de reportes organizacionales para cuentas con `company.manage` y `reports.view`: pueden consultar todas las campañas de su tenant mediante las fachadas de reportes y el catálogo IAM para el resumen del owner. Esta excepción no permite operar, administrar cultivos, resolver solicitudes ni leer recursos operativos. Los supervisores sin esos permisos organizacionales ven solo sus cultivos administrados y el universo legacy que ya podían consultar.

Las campañas sin registro en `harvest_cultivos` conservan la autorización anterior. Las políticas RLS restrictivas se intersectan con las políticas de lectura existentes; no conceden `SELECT` nuevo. Cuando una tabla todavía no tenía RLS, se conserva su visibilidad autenticada anterior para filas legacy y se exige participación para las administradas. Las tablas nuevas y los helpers de escritura permanecen privados, incluso ante privilegios por defecto de `service_role`.

## Verificación local

```powershell
cd backend
node --test tests/harvest-cultivos-supervisores-sql.test.js
npm test
```

Las pruebas usan las migraciones reales en PGlite y cubren las transacciones completas, fallos tardíos y recuperación, recibos por intención, operación Harvest real, aislamiento entre tenants y cultivos, aprobación exclusiva, conflictos de campaña activa, resumen del owner, permisos de Campaign, RLS con políticas permisivas preexistentes, revocación y capacidad comercial. No conectan ni despliegan a Supabase remoto.
