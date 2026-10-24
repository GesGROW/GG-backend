# Pantallas vigentes del portal

Limpieza aplicada el 18 de octubre de 2026 según la lista de pantallas que se mantiene en uso.

Actualizado el 22 de octubre: se retiró la pantalla antigua de Registros de Cosecha
y el árbol de subopciones del sidebar. Módulos contiene únicamente el enlace de
Cosecha o Módulos adquiridos, según el acceso autorizado. Tickets, Trabajadores
y Reportes se navegan dentro del contenedor de campaña.

## Rutas conservadas

| Pantalla                                                | Ruta                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Inicio                                                  | `/`                                                                                          |
| Entrada de Cosecha                                      | `/cosecha` → `/cosecha/generar` para supervisores                                              |
| Generación de tickets                                   | `/cosecha/generar`                                                                           |
| Lotes de tickets                                        | `/cosecha/lotes`                                                                             |
| Asignaciones                                            | `/cosecha/asignaciones`                                                                      |
| Inventario de tickets, relacionado con lotes y detalles | `/cosecha/tickets`                                                                           |
| Detalles de tickets, lotes y asignaciones                | `/cosecha/{tipo}/{id}`                                                                       |
| Reportes conservados                                    | `/reportes`, `/reportes/resumen`, `/reportes/ranking`, `/reportes/diaria`, `/reportes/lotes` |
| Usuarios y accesos                                      | `/configuracion/usuarios`                                                                    |
| Acceso de usuario                                       | `/configuracion/usuarios/{id}`                                                               |
| Nueva invitación                                        | `/configuracion/invitaciones`                                                                |
| Suscripción                                             | `/configuracion/suscripcion`                                                                 |

Los parámetros de campaña se conservan, incluido `?campania=` vacío, que utiliza la selección disponible de la empresa. `/cosecha` abre Generación e impresión de lotes de tickets para el supervisor. Sin campañas disponibles se abre el configurador de cultivo/campaña. Los usuarios de consulta entran a lotes sin recibir permiso de generación. Los enlaces antiguos `/cosecha/registros` y sus detalles redirigen a la entrada vigente conservando la campaña; no muestran ni consultan el listado eliminado. `/configuracion` redirige a Usuarios y accesos.

Login, restauración de sesión, selección de empresa, aceptación de invitaciones y estados de error continúan siendo necesarios para entrar y usar estas pantallas. El login se presenta según el estado de sesión; no se ha creado otra ruta de login.

Reportes permanece en el código con sus consultas, ranking, comparación y exportación. Su disponibilidad no cambia en esta limpieza: `REPORTES_HABILITADOS` sigue en `false` hasta publicar su rediseño.

## Código retirado

- `RegistrosCosecha.jsx` y `CosechaWorkspace.jsx`, sus pestañas antiguas y el detalle independiente de registros. La información del hecho asociada a un ticket sigue disponible dentro del detalle de ese ticket.
- Submenús del sidebar para cultivos/campañas, registros, tickets y reportes. Cosecha es un enlace directo; su campaña seleccionada se conserva. Escape, teclado, foco y cierre del drawer continúan funcionando.

- Pantallas de Empresa, catálogo de Roles y Módulos de Configuración, y el menú secundario antiguo que las acompañaba.
- Pantallas de Campañas, Personal, Estructura agrícola y sus herramientas exclusivas de parcelas y cutover.
- Rutas de esas pantallas. Ya no se pueden abrir escribiendo su URL, incluso con todos los permisos y módulos.
- Servicios de aplicación, adapters y composición del portal exclusivos de las pantallas retiradas.
- Implementaciones antiguas e inaccesibles del listado y formulario de generación de Cosecha. Se mantienen las implementaciones vigentes y los detalles relacionados.
- Pruebas y proveedores simulados exclusivos de las pantallas eliminadas. La cobertura de sesión, autorización y aislamiento se trasladó a las rutas conservadas.
- Estilos sin referencias en el código actual, el componente MetricWidget sin consumidores y tres imágenes/SVG sin uso.

La limpieza está limitada al container `portal`. Las APIs de los contextos compartidos, migraciones y funcionalidad de la aplicación de campo no se eliminan junto con una pantalla del portal.

## Validación

Actualización del 22 de octubre: 105 pruebas de aplicación y 234 de interfaz
aprobadas, build correcto y revisión en navegador a 1920, 1440, 390 y 320 px.
Se verificaron enlaces antiguos, entrada desde Cosecha, sidebar con un solo enlace,
campaña conservada, consulta sin permisos de generación y cierre del menú móvil.

- 129 pruebas de interfaz y 67 pruebas de aplicación/arquitectura aprobadas: 196 en total.
- Compilación de producción correcta.
- Revisión de imports: sin dependencias locales inexistentes ni módulos JavaScript del portal desconectados de `pwa/src/main.jsx`.
- Comprobación en navegador de las rutas conservadas y retiradas, en escritorio y móvil, con proveedores simulados locales.
- Comprobación específica del login, invitación, suscripción y las tres rutas de Cosecha con `?campania=` vacío.
- Las pantallas retiradas muestran Página no encontrada. Las pantallas conservadas no presentan desbordamiento horizontal del documento; las tablas mantienen su desplazamiento interno cuando es necesario.

La auditoría anterior queda como [registro histórico previo a esta limpieza](auditoria-pantallas-portal-2026-10-18.md).
