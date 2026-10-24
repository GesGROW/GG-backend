# F7.5 — Dashboard y reportes del Portal

El Portal consulta información operativa mediante la API pública Harvest
`crearReportesHarvest`. No se añade un dominio Dashboard. La PWA, IndexedDB v5,
comandos de campo, asignaciones, hechos, cutover, Identity y contratación conservan
sus contratos. Google Sheets y Apps Script continúan funcionando.

## Páginas y datos

| Ruta                              | Consulta y filtros                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/`                               | Dashboard: resumen de campaña, jabas hoy, cosechadores, lotes operativos, sesiones, días y última actividad |
| `/reportes` y `/reportes/resumen` | Métricas del resumen existente                                                                              |
| `/reportes/ranking`               | HOY / SEMANA / MES / CAMPANIA, búsqueda por nombre o DNI                                                    |
| `/reportes/diaria`                | Serie diaria, barras y tabla accesible sobre las mismas filas                                               |
| `/reportes/lotes`                 | Producción por lote operativo y variedad, búsqueda por código/nombre/variedad, orden por jabas o A–Z        |

El selector muestra campañas activas y cerradas del Tenant. Su selección vive
en la URL del Portal y es independiente del contexto operativo del PDA. Ante
ausencia de selección se elige la primera activa o la primera disponible. Un ID
ajeno no da acceso: la UI lo rechaza y todas las consultas lo contrastan también
en servidor, incluso si el usuario tiene membresía en ambas empresas.

El inicio sigue siendo accesible a usuarios sin reports.view o sin HARVEST:
explica la restricción del dashboard y conserva sus áreas de trabajo permitidas.
No consulta producción sin autorización. Reportes sí protege todas sus subrutas.

Se distinguen carga, ausencia de campañas, ausencia de producción/resultados,
conexión fallida, permiso ausente y módulo deshabilitado. Hay actualización manual,
reintento y fecha/hora del último snapshot obtenido, usando reloj del servidor.
Los periodos y fechas operativas usan America/Lima, como el ranking existente.
No hay suscripciones Realtime ni refresco periódico.

## Proyecciones F5.6 y API

Aplicar `backend/supabase/migrations/202610141400_portal_reportes.sql` después de F7.4.
Es transaccional e idempotente mediante `portal_f75_version()`. No crea tablas,
modifica hechos, cambia planes/entitlements ni altera RPC existentes.

Las fachadas nuevas `harvest_reportes_campanias`, `harvest_reportes_obtener` y
`harvest_reportes_validar` comprueban sesión, Usuario y membresía activos, Tenant
autorizado, reports.view, entitlement HARVEST vigente y ownership de campaña.
No requieren campaign.manage ni harvest.manage. Los helpers son privados, con
ACL revocadas para public/anon/authenticated/service_role; sólo las tres fachadas
se conceden a authenticated. Se conservan las FKs/RLS existentes.

Las consultas usan sin modificar `harvest_proyectar_resumen`,
`harvest_proyectar_diaria`, `harvest_proyectar_ranking` y `harvest_proyectar_lotes`.
Su fuente sigue siendo `harvest_produccion_reportable`: legacy congelado antes
del corte y Harvest admitido con versión después del corte; pilotos quedan fuera.
La fecha del dispositivo no selecciona el universo. El dashboard compone resumen
y fila diaria de hoy en servidor, dentro de una misma sentencia de consulta.
React no agrega contadores ni combina universos, tampoco reasigna posiciones.

La API pública aplica los buscadores y ordenadores existentes de Harvest sobre
las filas autorizadas. El ranking conserva posición y orden definidos en backend
al filtrar. La gráfica sólo escala visualmente los valores de la serie; la tabla
ofrece las mismas fechas, jabas, cosechadores y sesiones.

## Capas, aislamiento y CSV

```text
Reportes React → crearReportesPortal → crearReportesHarvest
  → puerto reportesHarvest → adapter provisional → fachadas autorizadas
```

Application resuelve un TenantContext fresco y Platform en cada operación.
El tenantId de formularios no se utiliza como autoridad. Al cambiar empresa se
desmontan vistas y se invalidan respuestas anteriores por scope, incluido A→B→A.
No se guarda producción en localStorage, IndexedDB ni en estado compartido con
la PWA. El adapter traduce errores de conexión, expiración, permiso y módulo.
Presentation y Application no importan SDK ni nombres RPC.

`ExportPort.guardar({nombre, mime, contenido})` separa descarga de datos.
Application conserva snapshots inmutables reconocidos por identidad en WeakMap;
acepta exportar únicamente un snapshot de su scope vigente, nunca filas o módulos
fabricados por React. Antes de descargar revalida TenantContext, permiso, Platform
y ownership mediante `harvest_reportes_validar`. Se exportan exactamente las filas
filtradas/ordenadas que ve el usuario, sin volver a consultar otro conjunto.
Revocación de membresía/permiso/módulo, sesión expirada o cambio de Tenant bloquean
la descarga. El adapter de navegador usa Blob; el puerto puede sustituirse por HTTP.
CSV usa UTF-8 con BOM, CRLF, escapado de comillas y protección de celdas fórmula.
No hay exportación PDF.

## Carga diferida y validación

Campañas, Personal, Cosecha, Reportes y Configuración tienen chunks por ruta con
React.lazy/Suspense. La conexión de infraestructura también se carga con import
dinámico desde bootstrap; la entrada muestra preparación y conserva el manejo
de configuración fallida. No se cambian paquetes, límites de aviso ni la PWA.
El bundle principal pasa de 523,58 kB a aproximadamente 297 kB; el adapter/conexión
queda en un chunk de aproximadamente 221 kB. Todos quedan por debajo de 500 kB.

Las pruebas SQL usan PostgreSQL embebido PGlite con migraciones F5–F7.5 y hechos
reales antes/después del corte, sin reemplazar la proyección por mocks. Verifican
pilotos excluidos, métricas, periodos, campañas cerradas, cross-tenant, ACL, módulos,
revocación e idempotencia/SCC. No sustituyen una verificación de JWT/roles en el
Supabase remoto. Las suites de Sheets y administración Harvest incluyen F7.5.
Node y React Testing Library verifican filtros, CSV, rutas, estados y respuestas
tardías entre Tenants; las guardas arquitectónicas recorren los imports.

## Próxima fase

F7.5 cubre consulta/exportación de resumen, ranking, producción diaria y por lote
que antes requerían Sheets, manteniendo su integración disponible. El alcance de
F7.6 queda por definir. Quedan fuera de esta entrega PDF complejo, reportes
configurables, analítica adicional y retirada de Sheets. Impresión/reimpresión y
correcciones de hechos siguen requiriendo casos de uso explícitos posteriores.
