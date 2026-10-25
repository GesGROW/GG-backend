# Paneles de lotes y trabajadores

Los listados de lotes generados y asignados abren `TicketsLotePanel` desde el icono de la columna **Tickets**. El panel comparte `PanelLateral`, `DataTable`, `StatusBadge` y la paginación de GesGROW.

- Generados: columna **Código**.
- Asignados: **Código** y **Estado**, con Disponible en celeste y Utilizado en gris.
- **Anterior** y **Siguiente** recorren los lotes en el orden del listado filtrado, también entre páginas. Se deshabilitan en los extremos y durante la carga de otra página.
- Cada lote consulta sus tickets con empresa y campaña autorizadas. La tabla de tickets pagina de diez en diez; los controles aparecen cuando hay más de diez.
- Cerrar con el botón, Escape o el fondo devuelve el foco al control que abrió el panel. Las consultas tardías se descartan al cambiar de lote, campaña o cerrar.

Las filas de **Cosechadores** y **Jaberos** se activan con clic, Enter o espacio, sin enlaces subrayados. `TrabajadorCampaniaPanel` consulta los datos personales originales y permite guardar DNI, nombres, apellidos y estado.

El estado editable corresponde únicamente a esa función en esa campaña (`trabajador_campania_rol.activo`), tal como solicitó el usuario. No cambia el estado general de `trabajadores`, otras funciones, otras campañas ni cuentas Identity. Los nombres y el DNI pertenecen a la ficha compartida del trabajador. Si está inactivo a nivel general, el panel lo informa y el servidor no permite reactivarlo globalmente desde aquí.

Editar un jabero no renueva su habilitación diaria. El servidor conserva esa autorización por separado; el cambio de estado no concede una nueva jornada.

## Autorización y datos

La migración `20261024193839_harvest_editor_trabajadores_campania.sql` agrega estas fachadas:

| Función                                    | Uso                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `harvest_admin_trabajador_campania`        | Leer la ficha de una participación autorizada con `harvest.view` o `harvest.manage`. |
| `harvest_admin_editar_trabajador_campania` | Editar campos permitidos con `harvest.manage`.                                       |

Ambas exigen HARVEST habilitado, empresa y acceso al cultivo/campaña. La participación debe coincidir con su UUID, campaña y función. La lectura devuelve por separado el UUID del trabajador y el UUID de participación: el listado usa este último. No se deducen apellidos dividiendo el nombre mostrado.

Las funciones tienen `search_path` fijo y ejecución únicamente para `authenticated`; comprueban la autorización en servidor. No conceden acceso directo a tablas. El [aviso sobre SECURITY DEFINER autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) corresponde a estas fachadas deliberadas. La migración se encontró instalada en Quijas-SCC y se verificó que ambos cuerpos y sus permisos coinciden con la versión local probada.

El guardado valida DNI de ocho dígitos, nombres, apellidos y estado booleano; una colisión de DNI revierte toda la operación. Reactivar una participación requiere campaña activa y trabajador activo. Los permisos se revalidan en cada llamada y la aplicación descarta respuestas de una empresa o sesión anterior.

## Verificación

Las pruebas cubren navegación entre lotes y consultas de 50 filas, límites, cierre y foco, respuestas tardías, edición desde ambos roles, errores y doble envío, aislamiento de campaña/empresa, DNI duplicado y preservación de la jornada del jabero. La revisión visual en Chrome utilizó datos ficticios, sin modificar trabajadores reales.

Resultado: 617 pruebas de backend, 138 de aplicación y 290 de presentación aprobadas, y compilación de producción correcta. Capturas de la revisión en `portal/qa-layout.local/panel-tickets-asignados.png` y `panel-trabajador.png`.

## Ajustes de fluidez y desplazamiento

El contenido del panel tiene 20 px de separación respecto de la barra, reserva espacio para ella y contiene su desplazamiento. El documento de fondo queda bloqueado mientras hay un panel abierto. Los estados de tickets se alinean a la izquierda, anulando únicamente dentro del panel la regla compartida que centraba las celdas con `StatusBadge`.

La transición lateral es de 140 ms y recorre 32 px. El desenfoque del fondo se reduce a 3 px para disminuir el trabajo de composición durante la apertura y el desplazamiento.

La migración `20261025015953_harvest_tickets_lote_panel_ligero.sql`, creada con Supabase CLI y aplicada a Quijas-SCC, añade `harvest_admin_tickets_lote`. Devuelve solo código y estado por ticket, con total y páginas de hasta 50 filas. Cuenta una vez por lote y consulta el consumo solo para la página; evita reconstruir el DTO general del lote y sus conteos para cada ticket. Usa los índices existentes por lote/campaña/código y por código de registro, y mantiene autorización de empresa, campaña, cultivo, permiso y módulo en servidor. No concede acceso directo a tablas ni ejecución a `anon` o `service_role`. El aviso de SECURITY DEFINER autenticado corresponde a la misma fachada autorizada documentada arriba.

Las lecturas de tickets y de fichas de trabajadores se ejecutan en paralelo con la comprobación del módulo tras autorizar el contexto. No se entrega el resultado hasta que ambas terminan; los errores de módulo y los cambios de empresa siguen bloqueando la entrega. Las escrituras mantienen su orden de autorización.

Verificación de este ajuste: 140 pruebas de aplicación, 24 de presentación relacionadas y 3 pruebas SQL nuevas aprobadas, más compilación de producción. Se comparó la consulta ligera con el inventario general: mismos códigos y estados, menor respuesta, paginación completa y aislamiento. Chrome confirmó alineación izquierda, separación de 20 px y bloqueo del fondo. Captura con datos ficticios en `portal/qa-layout.local/panel-tickets-ajustado.png`.
