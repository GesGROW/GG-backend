# F8 — Farm Structure y lotes operativos de campaña

Farm Structure es un BC independiente en `shared/src/contexts/farm-structure/`, con
`domain`, `application`, `ports` e `index.js`. Define `Fundo`, `Sector` y
`ParcelaAgricola`, persistentes e independientes de las campañas. Todas las
entidades tienen identidad, Tenant, código, nombre y estado activo.

```text
Tenant → Fundo → Sector → ParcelaAgricola
                              ↑ referencia opcional M:N
                  LoteOperativoCampania → Harvest
```

Campaign Management publica `LoteOperativoCampania` y el servicio de vinculación.
La tabla histórica `lotes` y sus contratos siguen representando configuración
operativa de campaña: cultivo, variedades, sesiones y producción mantienen su
significado actual. Ningún lote se convierte automáticamente en parcela física.

## Persistencia y migración

Aplicar `202610141700_farm_structure.sql` después de F7.7. La migración es
aditiva, transaccional e idempotente mediante `farm_f8_version()`; no requiere
reescribir ni volver a desplegar las migraciones anteriores.

| Tabla nueva              | Propiedad y relaciones                               |
| ------------------------ | ---------------------------------------------------- |
| `farm_fundos`            | Tenant; código único dentro de la empresa            |
| `farm_sectores`          | Tenant + Fundo; código único dentro del Fundo        |
| `farm_parcelas`          | Tenant + Sector; código único dentro del Sector      |
| `campaign_lote_parcelas` | Tenant + lote operativo + parcela; vínculo activable |

Las FKs compuestas `(tenant_id, id)` rechazan jerarquías y vínculos de otra
empresa. La relación opcional M:N admite varias parcelas por lote y varios
lotes/campañas por parcela. No se añade un `parcela_id` obligatorio a `lotes`.
Las cuatro tablas empiezan vacías: el histórico continúa válido sin estructura
física vinculada. No se actualizan campañas, lotes, Harvest ni datos comerciales.

Tenant, identidad, padre y fecha de creación de las entidades físicas son
inmutables. Cambiar padre requiere diseñar un caso de uso posterior. Se permite
editar código y nombre y activar/desactivar. DELETE y TRUNCATE se rechazan,
incluidos vínculos dados de baja, para conservar referencias e histórico.

Desactivar un padre conserva los estados propios de sus hijos. `habilitado` es
una proyección de la cadena activa completa; no es un nuevo estado persistente.
Crear hijos, reactivarlos o establecer nuevos vínculos exige padres activos.
Los vínculos existentes se conservan aunque se desactive una entidad física y
pueden darse de baja sin borrar filas. La operación de campo sigue usando el
lote operativo y no depende de la activación física.

## Seguridad y contratación

Se introduce `farm.manage` para administración física y el módulo real
`FARM_STRUCTURE` en Platform. El permiso se incorpora a ADMIN_EMPRESA existente
y al sembrado de futuros administradores. La autorización se evalúa por permiso,
nunca por comparación del nombre de rol en cada operación.

No se añaden módulos a planes o contratos anteriores. SCC conserva exactamente
su suscripción y sus tres módulos actuales. Para usar la nueva capacidad, un
actor con delegación `subscription.manage` puede habilitar `FARM_STRUCTURE`
como add-on/excepción desde Configuración → Suscripción, por los casos de uso
auditados F6.4/F7.6. Un administrador ordinario no se autoasigna contratación.

Cada RPC público valida sesión, usuario, membresía, TenantContext, permiso y
entitlement en servidor. Las tablas tienen RLS y carecen de permisos directos
para anon/authenticated/service_role, aun con privilegios por defecto de Supabase.
Los helpers internos tampoco son ejecutables por esos roles.

La selección/vinculación de parcelas desde Campaign exige `campaign.manage`,
`CAMPAIGN` y `FARM_STRUCTURE`. No concede administración física: utiliza una
consulta pública mínima de referencias elegibles. Crear/editar estructura exige
`farm.manage` y `FARM_STRUCTURE`. El identificador de Tenant del transporte es
siempre una selección que el servidor valida, nunca autoridad del navegador.

## Portal y contratos

Rutas protegidas y cargadas bajo demanda:

- `/estructura` y `/estructura/fundos`;
- `/estructura/sectores`;
- `/estructura/parcelas`.

Cada sección ofrece búsqueda, paginación, filtro de estado, alta, edición y
activación/desactivación. Los selectores de padres permiten buscar y paginar;
el padre se conserva al editar. En el detalle de campaña, cada lote operativo
puede vincular/desvincular parcelas del mismo Tenant cuando la capacidad está
habilitada. Cero vínculos es una configuración válida.

Presentation → Application → puertos → adapters sustituibles. React no conoce
SDK ni RPC. `estructuraAgricolaAdapter.js` implementa los puertos con Supabase
provisional. Cada caso de uso obtiene un TenantContext fresco y descarta
respuestas tardías al cambiar de empresa, incluso A → B → A. El layout desmonta
el estado y los formularios del Tenant anterior.

Campaign consume exclusivamente `farm-structure/index.js`. En SQL, sus casos de
uso llaman los contratos de Farm `farm_describir_parcela` y
`farm_exigir_parcela_vinculable`, que son públicos para colaboración entre BC
confiables, pero privados para el navegador. Campaign sólo consulta directamente
su tabla de vínculos; las FKs entre esquemas lógicos preservan ownership.
Farm no importa Harvest y Harvest no importa Farm ni consulta sus repositorios.

## Compatibilidad y límites

No se cambia IndexedDB v5, snapshot/caché de campo, comandos, asignación,
consumo único, DNI legacy, cutover, reportes o PWA. Los contratos de Sheets
siguen funcionando en campañas no migradas y las protecciones F7.7 permanecen.
Los vínculos físicos no se incluyen ni se reconstruyen en la caché del PDA.

Quedan por validar con negocio la correspondencia física real de cada lote y
las reglas futuras de redistribución/reparentado. La relación actual expresa
configuración operativa, sin atribuir retrospectivamente producción a parcelas
ni representar vigencias históricas de uso del suelo. No se introducen áreas,
GIS, coordenadas ni nuevas reglas agronómicas.

## Validación

Pruebas de dominio, APIs de aplicación, adapters, React y SQL PostgreSQL en
PGlite: jerarquía, unicidad, activación, FKs/RLS/ACL, referencias múltiples,
rechazo cross-tenant, historial conservado, migración repetida, SCC preservado,
contratación explícita y ausencia de imports internos entre BC. Se ejecutan
también las suites existentes de Harvest, reportes y Sheets tras F8.
La migración queda disponible para despliegue; esta fase no la aplica a remoto.
