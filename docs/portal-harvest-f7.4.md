# F7.4 — Administración y consulta Harvest en el Portal

El Portal prepara/genera y consulta. La PWA mantiene la asignación física y el
registro de cosecha, incluidos sus comandos offline, IndexedDB v5, consumo único,
reconciliación y compatibilidad legacy. No se cambian los RPC operativos F5.

## Páginas

| Ruta                                 | Responsabilidad                                          |
| ------------------------------------ | -------------------------------------------------------- |
| `/cosecha` y `/cosecha/lotes`        | Listado, filtros, asignación y progreso de consumo       |
| `/cosecha/lotes/:id`                 | Detalle de LoteDeTickets y enlaces a tickets/asignación  |
| `/cosecha/tickets`                   | Búsqueda por código, campaña, lote, trabajador y consumo |
| `/cosecha/tickets/:codigo`           | Ticket → lote → asignación → trabajador → registro       |
| `/cosecha/asignaciones` y `/:loteId` | Consulta de asignaciones existentes                      |
| `/cosecha/registros` y `/:id`        | Consulta de RegistroCosecha y contexto histórico         |
| `/cosecha/generar`                   | Generación por campaña, cantidad total y tamaño de lote  |

Los listados paginan de 50 en 50. Los estados de lotes y tickets, los tickets
utilizados y el progreso se derivan de asignaciones/registros; no se añaden columnas
de estado ni contadores persistentes. El detalle de un lote enlaza su lista filtrada
de tickets. El selector de trabajadores usa sólo personas con asignaciones en la
empresa/campaña autorizada, incluyendo quienes luego fueron desactivados.

Las vistas consultan los agregados Harvest F5. No convierten tickets individuales
legacy en lotes ficticios. El histórico anterior sigue en sus tablas y reportes
actuales; las páginas lo indican para evitar confundir ausencia de catálogo nuevo
con pérdida de información. Los registros piloto anteriores a la frontera se
muestran como histórico no admitido en producción cuando version_produccion es null.

## Generación con autoridad en servidor

La API pública nueva `crearAdministracionHarvest` ofrece un equivalente servidor
de `GenerarLotesDeTickets`. La implementación pura F5 original continúa disponible
sin cambios; una prueba compara su partición con la respuesta del servidor.

```text
React Cosecha
  → crearCosechaPortal
    → crearAdministracionHarvest (API pública Harvest)
      → puerto administracionHarvest
        → adapter provisional
          → harvest_admin_generar en servidor
```

React envía únicamente campaña, cantidad, tamaño e ID de operación. No decide ni
serializa códigos, identidades de lotes o agrupaciones. El servidor:

1. Revalida identidad, Tenant, permiso y módulo; contrasta la campaña persistida.
2. Bloquea el UUID de operación y recupera el recibo si es un reintento idéntico.
3. Exige campaña ACTIVA para una generación nueva, igual que la API F5 existente.
4. Crea UUID de lotes y códigos únicos `GG-<uuid>` y distribuye los tickets.
5. Confirma todos los agregados y el recibo en una misma transacción sobre las
   tablas/PK/FK existentes de F5. Un error revierte también los primeros lotes.

43 tickets con tamaño 10 producen **10 + 10 + 10 + 10 + 3**. Un tamaño mayor que el
total produce un único lote incompleto. Por solicitud se admiten entre 1 y 100000
tickets y un tamaño entre 1 y 100000; el límite del adapter servidor no cambia el
contrato puro F5 ni la operación de campo.

El resultado confirma IDs, cantidades reales, actor y reloj del servidor. El recibo
se conserva en `harvest_generaciones` y es inmutable frente a UPDATE/DELETE/TRUNCATE.
Reintentar devuelve el mismo resultado; reutilizar UUID con otro Tenant, campaña,
actor o cantidades se rechaza. La UI conserva la intención enviada y exige una
acción explícita para preparar otra. No interpreta un fallo de transporte como una
nueva generación ni como una orden de impresión.

## Permisos y seguridad

Se añade el permiso explícito `harvest.manage` al catálogo Identity:

| Permiso         | Uso                                                                |
| --------------- | ------------------------------------------------------------------ |
| harvest.view    | Consulta administrativa                                            |
| harvest.manage  | Generación y consulta administrativa                               |
| harvest.operate | Operación de campo; por sí solo no concede estas vistas del Portal |

La migración lo asigna inicialmente a ADMIN_EMPRESA existentes. El seeder Identity
ya asigna todo el catálogo a ADMIN_EMPRESA de nuevas empresas. GESTOR/CONSULTA
conservan consulta, OPERADOR_CAMPO conserva sus permisos existentes de operar y
consultar. Los nombres de rol intervienen únicamente en ese aprovisionamiento;
las operaciones autorizan por permisos efectivos. Un rol de cualquier nombre con
harvest.manage funciona sin adquirir harvest.operate ni permisos comerciales.

Todas las APIs revalidan sesión, Usuario activo, membresía activa y Tenant activo,
el permiso adecuado y el entitlement HARVEST mediante Platform F6.3/F6.4. La campaña
enviada se contrasta con el Tenant autorizado; un ID no concede autoridad. Lotes,
códigos, trabajadores y registros se consultan con ownership persistido y FKs
compuestas. Las relaciones anidadas también se acotan al Tenant.

La protección se aplica a URLs directas, casos de uso y servidor. Cada llamada
Application resuelve nuevamente TenantContext y Platform. Al cambiar empresa se
eliminan formularios/resultados y se descartan respuestas anteriores. Una lista
de permisos o módulos enviada por el formulario nunca se reenvía como autoridad.

Presentation y Application no conocen SDK, nombres de RPC ni credenciales. El
Portal importa únicamente APIs públicas de Harvest, Identity y Platform. El puerto
neutral de administración puede sustituirse por HTTP/Spring sin cambiar la UI.
No se añaden funciones privilegiadas ejecutadas en navegador ni secretos al env.

## Persistencia y despliegue

Aplicar después de F7.3:
`backend/supabase/migrations/202610141300_portal_harvest_admin.sql`.

- Amplía el CHECK del catálogo Identity con harvest.manage y sus grants iniciales.
- Añade `harvest_generaciones` con Tenant, campaña, actor, cantidades, fecha y recibo.
- Sus FKs compuestas contrastan campaña y membresía del actor con el Tenant.
- Activa RLS y revoca DML/lectura directa a navegador y service_role sobre recibos.
- Expone sólo `harvest_admin_campanias`, `harvest_admin_filtros`,
  `harvest_admin_generar`, `harvest_admin_listar` y `harvest_admin_obtener` a
  authenticated. Helpers/DTO internos no son APIs públicas ni accesibles por anon.
- Cierra también los grants por defecto de Supabase sobre las nuevas funciones.

La migración es transaccional e idempotente con un marcador de finalización dentro
de la misma transacción. No aplica GUC permanentes ni cambia firmas/cuerpos de F5,
Sheets, Identity o administración comercial. No modifica el contrato de suscripción,
entitlements ni datos operativos existentes del SCC. Las pruebas no la despliegan
en el Supabase remoto.

## Cutover y hechos históricos

Generar prepara catálogo antes o después del cutover, como F5. No confirma ni revierte
la frontera. El catálogo usa `modeloOperativoHarvest` con el cutover persistido de
F5.6; no compara relojes del cliente ni inventa una política paralela.

Las pruebas generan antes de la frontera, verifican rechazo del consumo antes de
cutover y consumen después mediante los RPC reales de campo. La admisión de producción
sigue derivándose de `version_produccion`, sin convertir pilotos o legacy en producción.

Asignaciones y RegistroCosecha son de consulta. No se ofrece reasignar, editar
trabajador atribuido, crear cosechas manuales ni borrar hechos. Las restricciones
F5 de lote asignado y ticket consumido siguen rechazando intentos incompatibles.

## Impresión, correcciones y siguientes fases

**Generar tickets no imprime tickets.** F7.4 no crea PDF/TSPL/TSLP, archivos de
impresión ni botones de reimpresión. Tampoco incorpora fabricantes o impresoras en
Harvest. Para una fase posterior, la preparación de salida debe inyectar un
`TicketPrintPort` neutral; los formatos y dispositivos quedan en infraestructura.

Una futura reimpresión debe ser una operación explícita con motivo, actor y
auditoría, evitando duplicar silenciosamente soportes de un código único. Una
corrección administrativa de asignación o cosecha también requiere un caso de uso
propio que explique el hecho y preserve la historia, no un UPDATE trabajador_id.

El Portal cubre generación por cantidades y consulta de catálogo, asignaciones y
consumos sin preparar JSON, consultar SQL o exportar hojas para seguir cada ticket.
Sheets y Apps Script continúan disponibles; los reportes agregados actuales no se
retiran. Para F7.5 queda concretar el siguiente alcance de explotación/reportes;
impresión auditada y correcciones son capacidades futuras explícitas, no CRUD oculto.

## Validación

Las pruebas cubren generación normal/incompleta, referencia F5, unicidad, rollback,
idempotencia, permisos efectivos, rechazo cross-tenant, módulos, ACL/RLS, ticket libre
y utilizado, cadena completa y registros, cutover y operación real de campo. También
hay pruebas de UI, respuestas perdidas, cambio de Tenant y límites de arquitectura.
Las suites anteriores de Identity, Campaign/Workforce, ciclo comercial y Sheets
aplican F7.4 para comprobar compatibilidad después de migrar.

Desde `scc`: `npm test`, `npm run build`, `git diff --check`.
Desde `portal`: `npm test`, `npm run build`.
