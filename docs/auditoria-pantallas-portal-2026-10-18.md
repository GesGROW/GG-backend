# Auditoría de pantallas del portal — 18 de octubre de 2026

> Registro histórico anterior a la limpieza solicitada después de esta auditoría. Las rutas antiguas descritas aquí ya se retiraron. Consultar el [inventario vigente y la validación de la limpieza](portal-pantallas-vigentes.md).

La navegación principal publica Inicio, Cosecha, Usuarios y accesos y Suscripción. Las pantallas retiradas de Configuración siguen implementadas y accesibles para usuarios autorizados. Hay rutas operativas fuera del sidebar y una diferencia visual entre las vistas nuevas y los detalles anteriores.

## Alcance y evidencia

- Revisión de rutas, navegación, permisos, módulos y componentes actuales del repositorio.
- 55 comprobaciones en Chrome: 35 rutas en escritorio (1440 × 900), 15 en móvil (390 × 900) y 5 comprobaciones adicionales con solo HARVEST habilitado. Son casos de revisión, no 55 pantallas distintas.
- Matriz adicional de autorización: administrador completo, consulta de Cosecha, administrador con solo Cosecha, administrador sin módulos y operador de campo.
- 69 pruebas de interfaz y 49 de aplicación aprobadas: 118 en total.
- El navegador utilizó `portal/tests/visual.html`, con proveedores simulados. Estos resultados describen el código local; no verifican la suscripción real de una empresa, el despliegue publicado ni los RPC de una base de datos real.
- Resultados de navegador: [55 casos y enlaces encontrados](auditoria-pantallas-2026-10-18/resultados.json).

## Hallazgos

### 1. Las pantallas retiradas siguen abriéndose por URL — prioridad alta

Empresa, Roles y Módulos desaparecieron de los enlaces del sidebar, pero permanecen aceptadas por el evaluador de rutas y tienen componentes activos:

- `/configuracion/empresa`: formulario de empresa, incluido Guardar empresa.
- `/configuracion/roles`: catálogo de roles y permisos.
- `/configuracion/modulos`: módulos habilitados.
- `/configuracion`: abre Empresa por defecto, aunque esta sección se retiró del menú.

Reproducción: entrar en cualquiera de esas rutas con `company.manage`. Las cuatro renderizan la pantalla anterior. No es una omisión de autorización: siguen exigiendo el permiso. Es una diferencia entre quitar un enlace y retirar una pantalla del producto.

Evidencia: `portal/src/application/rutas.js:79`, `portal/src/presentation/Configuracion.jsx:165` y `:207`.

![La ruta base de Configuración todavía abre Empresa](auditoria-pantallas-2026-10-18/configuracion-base.png)

Acción propuesta: si la intención es retirarlas completamente, despublicar esas rutas y hacer que `/configuracion` lleve a Usuarios y accesos. Conservar los roles necesarios para asignar accesos; retirar su catálogo no implica borrar roles ni permisos.

### 2. La navegación secundaria antigua conserva Invitaciones y Módulos — prioridad media

Al abrir `/configuracion`, Empresa, Roles o Módulos, aparece un menú antiguo con Usuarios, Invitaciones, Módulos y Suscripción. Por tanto, Invitaciones y Módulos todavía pueden reaparecer en una navegación de Configuración, aunque no estén en el sidebar.

No sucede en las vistas nuevas de Usuarios y accesos y Suscripción, que ya usan su propia composición.

Evidencia: `portal/src/presentation/Configuracion.jsx:189`.

Acción propuesta: retirar ese menú antiguo al despublicar las pantallas anteriores. Mantener Nueva invitación como acción de Usuarios y accesos.

### 3. Campañas, Personal y Estructura agrícola están fuera del sidebar — decisión de producto pendiente

Las pantallas funcionan por URL y exigen su módulo y permiso, pero el grupo Módulos del sidebar solo incluye Cosecha y Reportes. No presenta Campañas, Personal ni Estructura agrícola, incluso si el usuario y la empresa tienen acceso.

El Inicio alternativo que aparece sin el dashboard puede mostrar enlaces a estas áreas a partir de la navegación autorizada. El dashboard habitual no los muestra. La posibilidad de descubrir estas pantallas cambia según la variante de Inicio.

Evidencia: `portal/src/presentation/Navigation.jsx:9` y `:206`; `portal/src/presentation/Portal.jsx:290` y `:370`.

Acción propuesta: decidir si son herramientas internas que deben permanecer ocultas o módulos que deben publicarse cuando estén contratados. No habilitarlos para empresas que solo tengan Cosecha.

### 4. El inventario de tickets tiene un acceso poco visible para administradores — prioridad media

La pantalla `/cosecha/tickets` funciona y lista tickets individuales. Sin embargo:

- Con `harvest.manage`, la pestaña principal Tickets lleva a Generación.
- Las subpestañas ofrecen Generación, Lotes y Asignaciones, sin Inventario de tickets.
- El sidebar tampoco enlaza directamente al inventario.
- Se puede llegar al inventario por URL o por enlaces de los detalles anteriores, como Consultar tickets del lote.
- Con solo permiso de consulta, la pestaña principal Tickets sí lleva al inventario.

Evidencia: `portal/src/presentation/RegistrosCosecha.jsx:67` y `portal/src/presentation/TicketsCosecha.jsx:94`.

Acción propuesta: dar al inventario una entrada explícita dentro de Tickets y una subpestaña activa cuando se visita esa ruta.

### 5. Los detalles operativos conservan la composición visual anterior — prioridad media

Los listados de Cosecha usan el diseño nuevo. Abrir el detalle de un registro, ticket, lote o asignación cambia a otra composición: encabezado con icono, pestañas antiguas, distinta anchura del contenido y tarjetas anteriores. Campañas, Personal, Estructura y las pantallas antiguas de Configuración también conservan esa presentación.

Mediciones en escritorio, antes del zoom compartido de 0,8:

| Vista                                   | Tamaño CSS del título principal |
| --------------------------------------- | ------------------------------- |
| Cosecha, listados                       | 96 px                           |
| Usuarios y accesos                      | 64 px                           |
| Suscripción                             | 64 px                           |
| Acceso de usuario                       | 56 px                           |
| Detalles de Cosecha y vistas anteriores | 40 px                           |

La diferencia de tamaño por sí sola puede ser una elección de jerarquía. El cambio conjunto de encabezado, pestañas y composición confirma que todavía conviven dos diseños.

Evidencia: `portal/src/presentation/Cosecha.jsx:600` y `:614`.

![Detalle de ticket con la composición anterior](auditoria-pantallas-2026-10-18/detalle-ticket.png)

![Campañas conserva la presentación anterior](auditoria-pantallas-2026-10-18/campanias.png)

Acción propuesta: adaptar primero los detalles que se abren desde pantallas publicadas. Después, actualizar los módulos ocultos solo si se decide publicarlos.

## Inventario de visibilidad

“Por URL” presupone una sesión, empresa y permisos válidos. Una pantalla fuera del sidebar no equivale a una pantalla bloqueada.

| Pantalla o grupo                                       | Entrada habitual                                         | ¿Se abre por URL?              | Estado observado                                                          |
| ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Inicio                                                 | Sidebar                                                  | Sí                             | Dashboard o Inicio alternativo según permisos y módulos                   |
| Cosecha / Registros                                    | Sidebar y pestaña Registros                              | Sí                             | Diseño nuevo                                                              |
| Generación de tickets                                  | Submenú Tickets y pestañas                               | Sí, con `harvest.manage`       | Diseño nuevo                                                              |
| Lotes de tickets                                       | Submenú Tickets y pestañas                               | Sí                             | Diseño nuevo                                                              |
| Asignaciones                                           | Submenú Tickets y pestañas                               | Sí                             | Diseño nuevo                                                              |
| Inventario de tickets individuales                     | Pestaña Tickets para consulta; enlaces de detalle        | Sí                             | Entrada poco visible para administradores                                 |
| Detalles de registros, tickets, lotes y asignaciones   | Enlaces de los listados y detalles                       | Sí                             | Presentación anterior                                                     |
| Usuarios y accesos                                     | Configuración en sidebar                                 | Sí                             | Diseño nuevo; sin contador de usuarios                                    |
| Acceso de usuario                                      | Clic en usuario                                          | Sí                             | Sin Datos de la cuenta ni Acceso efectivo                                 |
| Nueva invitación                                       | Botón en Usuarios y accesos                              | Sí                             | Modal; no es una opción independiente del sidebar                         |
| Suscripción                                            | Configuración en sidebar                                 | Sí                             | Diseño nuevo; administración comercial restringida                        |
| Empresa                                                | Sin enlace en sidebar                                    | Sí; también `/configuracion`   | Pantalla retirada del menú, todavía activa                                |
| Roles y permisos                                       | Sin enlace en menús                                      | Sí                             | Catálogo anterior todavía activo                                          |
| Módulos de Configuración                               | Sin enlace en sidebar; sí en menú antiguo                | Sí                             | Pantalla anterior todavía activa                                          |
| Campañas: listado, alta y detalle                      | Fuera del sidebar; posible enlace del Inicio alternativo | Sí                             | Requiere CAMPAIGN y `campaign.manage`                                     |
| Personal: listado, alta y detalle                      | Fuera del sidebar; posible enlace del Inicio alternativo | Sí                             | Requiere WORKFORCE y `workforce.manage`                                   |
| Fundos, Sectores y Parcelas                            | Fuera del sidebar; pestañas internas                     | Sí                             | Requiere FARM_STRUCTURE y `farm.manage`                                   |
| Reportes: resumen, ranking, diaria y lotes             | Enlaces visibles deshabilitados                          | No se publica; vuelve a Inicio | Desactivación intencional                                                 |
| Login, selección de empresa y aceptación de invitación | Flujo de sesión                                          | Depende del estado de sesión   | No son entradas del sidebar; cubiertas por pruebas de aplicación/interfaz |

## Comprobaciones satisfactorias y límites conocidos

- Las empresas con solo HARVEST reciben Acceso restringido en Campañas, Personal y Estructura, aunque se escriba la URL. Usuarios y accesos sigue disponible con `company.manage`.
- Sin `harvest.manage`, Generación se deniega. `harvest.operate` por sí solo no concede acceso a las consultas administrativas del portal; es el comportamiento documentado en las pruebas actuales.
- La administración comercial exige su autorización adicional. Tener acceso a Usuarios y accesos no habilita cambios de suscripción.
- Las pruebas de aislamiento entre empresas y descarte de respuestas tardías pasaron.
- Los 55 casos no mostraron desbordamiento horizontal del documento. Las tablas anchas conservan su desplazamiento interno; esto no significa que todas sus columnas sean visibles simultáneamente en móvil.
- Las tablas inspeccionadas mantienen el tamaño CSS compartido de 20 px. Hay diferencias visuales de contenedores, encabezados y botones en las pantallas anteriores.
- Reportes está desactivado expresamente en `portal/src/presentation/reportesDisponibles.js:2`. Sus enlaces no navegan y las cinco rutas comprobadas terminan en Inicio. Algunas pruebas habilitan Reportes mediante un mock para cubrir el código conservado; que esas pruebas pasen no significa que Reportes esté publicado.
- Facturación e historial de pagos muestran estados vacíos. Precio, renovación, tarjeta, correo de facturación y recibos no están integrados en la API actual. La auditoría comercial no se presenta como si fueran pagos.
- Las pruebas funcionales de los módulos ocultos verifican que siguen operativos; no comprueban que deban estar publicados ni que ya usen el diseño nuevo.

## Orden propuesto de corrección

1. Resolver las rutas antiguas de Configuración y su entrada base.
2. Retirar el menú secundario antiguo que vuelve a presentar opciones eliminadas.
3. Dar acceso claro al inventario de tickets para todos los perfiles autorizados.
4. Unificar los detalles de Cosecha con los listados actuales.
5. Definir la publicación de Campañas, Personal y Estructura, respetando contratación y permisos.

Esta entrega documenta la auditoría. No modifica rutas, permisos ni pantallas de la aplicación.
