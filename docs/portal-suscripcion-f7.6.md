# F7.6 — Suscripciones y módulos en el Portal

`/configuracion/suscripcion` incorpora consulta comercial y operaciones delegadas
de Platform F6.3/F6.4. No se añaden pagos, proveedores, facturas, webhooks ni
conciliación. PWA, Harvest, Campaign, Workforce, Identity, reportes, Sheets y Apps
Script conservan sus contratos. El Tenant SCC mantiene su suscripción y módulos.

## Consulta y autorización

La página requiere sesión, TenantContext y permiso efectivo `company.manage`.
Un administrador ordinario puede consultar plan actual, estado, fechas, versión,
módulos del catálogo del plan, entitlements persistidos con origen PLAN/ADD_ON/
EXCEPCION y módulos efectivos resueltos por Platform. El catálogo del plan es
informativo: no se usa para decidir acceso. Se muestran también cambios pendientes
y eventos inmutables con actor, fechas, motivo, contexto y snapshots anterior/nuevo.
El historial no dispone de edición, borrado ni endpoints de mutación.

Las escrituras requieren además la delegación comercial de confianza
`subscription.manage`, usuario/membresía/Tenant activos y company.manage, como F6.4.
No se introduce subscription.manage en el catálogo de roles administrables por
el propio Tenant. La página de usuarios no puede conceder delegaciones y no se
añade un endpoint para hacerlo. El servidor revalida todas las condiciones en cada
operación; la visibilidad del formulario no concede autoridad.

Configuración es capacidad base: esta página sigue siendo accesible aunque la
suscripción esté suspendida o sus módulos no estén habilitados. No exige HARVEST,
CAMPAIGN o WORKFORCE para poder resolver su contratación.

## Operaciones

- Cambiar plan.
- Renovar vigencia.
- Suspender o reactivar suscripción.
- Cancelar suscripción (transición terminal existente, acción explícita en UI).
- Habilitar módulo como add-on o excepción, con vigencia opcional.
- Deshabilitar módulo mediante intención comercial.

Todas permiten `effectiveAt` cuando F6.4 lo admite. React expresa intención y no
ejecuta transiciones ni aplica cambios al llegar una fecha del dispositivo. La
consulta del servidor materializa pendientes vencidos usando los helpers F6.4;
también se conserva su procesador de programados existente. Futuro pendiente y
estado actual aparecen separados. Las fechas de entrada son locales del navegador
y se envían en ISO; la vigencia se valida contra reloj de servidor. La información
consultada se presenta en horario de Lima. No se añaden timers ni Realtime.

La pantalla muestra el UUID y fase del recibo (APLICADA/PROGRAMADA). Los eventos
posteriores APLICADA/RECHAZADA explican qué ocurrió con una programación. Si otro
cambio altera la versión, o se revoca la autorización del actor, F6.4 rechaza el
programado al ejecutarlo; la UI no intenta sortear esa decisión.

## Capas y contratos

```text
Suscripcion React
  → crearSuscripcionPortal
    → crearAdministracionComercial (API pública Platform)
      → puerto comercial
        → adapter provisional
          → fachadas Platform → reglas/auditoría F6.4
```

El modelo CambioComercial admite `versionBase` opcional para conservar los clientes
F6.4 actuales. El Portal la exige; actor, tenantId y listas de módulos/permisos de
formularios no se transmiten como autoridad. Tenant se deriva del TenantContext
resuelto en Application y revalidado en servidor. Presentation/Application no
importan SDK, RPC ni credenciales; el adapter es sustituible por HTTP/Spring.

Cada operación captura el scope del Tenant. Cambio de empresa, logout o nueva
selección invalidan resultados anteriores, incluido A→B→A. React desmonta el
contrato, formularios, intenciones y eventos del Tenant anterior. La selección
vuelve a resolver TenantContext y entitlements; la página vuelve a consultar al
entrar. El acceso directo por URL usa la misma protección.

## Migración e idempotencia

Aplicar `backend/supabase/migrations/202610141500_portal_suscripcion.sql` después de F7.5.
Es transaccional e idempotente mediante `portal_f76_version()`. No crea tablas,
altera catálogos, cambia contratos SCC ni modifica funciones desplegadas de F6.4.

`platform_portal_obtener_suscripcion` permite lectura con company.manage, bajo
Tenant autorizado; serializa con el lock comercial y entrega snapshots, módulos
efectivos, planes, historial, pendientes, versión y puedeAdministrar del servidor.
No abre las políticas RLS ni grants de las tablas originales. La capacidad de
escritura se obtiene de la delegación persistida, no de nombres de rol.

`platform_portal_solicitar_cambio` exige autorización comercial y versión base.
Adquiere los mismos locks F6.4 (operación, luego Tenant), materializa pendientes y
contrasta la versión actual antes de delegar a `platform_solicitar_cambio`. Una
intención nueva con versión antigua falla con 40001/ConflictoVersionComercial.
Los parámetros y transiciones siguen validados por F6.4. No se hace CRUD genérico
ni DML de contratación desde el navegador.

En reintentos se valida primero la operación persistida: tenant, actor y versión
original; F6.4 verifica parámetros, motivo y fecha y devuelve su recibo original
aunque la versión actual haya avanzado. No se reinterpreta un retry como nueva
operación. Las APIs F6.4 preexistentes conservan sus firmas y comportamiento.

La UI conserva ID, parámetros y versión ante falta de confirmación de transporte,
bloquea edición/nuevas intenciones y permite reintentar la misma solicitud. Tras
confirmación exige preparar explícitamente otro cambio. Un conflicto exige
actualizar la versión y preparar una nueva intención, sin retry automático.
Esta retención vive en la vista: no se añade almacenamiento offline de comandos
comerciales. No se promete recuperación de intenciones tras recargar el navegador.

Sólo las dos fachadas tienen EXECUTE para authenticated; se revocan public, anon
y service_role, incluido el marcador privado. No se añaden secretos ni funciones
privilegiadas en el cliente, ni GUC permanentes. La auditoría F6.4 y sus triggers
inmutables/constraints siguen siendo autoridad sobre el estado comercial.

## Pruebas y siguiente fase

SQL real en PGlite recorre F5–F7.6: lectura ordinaria, delegado, add-on, cambio de
plan, renovación, suspensión/reactivación/cancelación, bajas y habilitaciones,
programación y rechazo por versión, reintento, ACL/cross-tenant e historial
inmutable. La migración se reaplica y compara el snapshot SCC sin cambios.
También se aplica F7.6 en las suites existentes de F6.4, Harvest, reportes y Sheets.
Esto no sustituye verificar JWT/roles reales en Supabase remoto.

Node y React Testing Library cubren ruta protegida, consulta, formularios, permisos,
recibos, fallos de transporte, conflicto y limpieza/respuestas tardías por Tenant.
Las guardas de arquitectura y secretos recorren las nuevas dependencias.

El alcance de F7.7 queda por definir. Pagos y pasarela, facturación, cobros,
webhooks y conciliación continúan pendientes; Google Sheets sigue disponible.
