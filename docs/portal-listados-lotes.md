# Listados de lotes de tickets

Dentro de la campaña seleccionada, `/cosecha/lotes` muestra **Lote**, **Tickets** y **Fecha y hora**. `/cosecha/asignaciones` muestra **Lote**, **Cosechador** y **Fecha y hora de asignación**. Ambos conservan el selector de campaña y el contenedor de Cosecha.

Las consultas usan `harvest_admin_listar` con la campaña y paginación de 50 filas. El contexto de empresa y los permisos se resuelven en Application y en el servidor. Los cambios de campaña descartan la respuesta anterior y reinician la página y la selección.

El icono de Tickets utiliza exactamente el SVG ellipsis proporcionado, en negro, 24 × 24 y trazo 2. Puede activarse por clic, Enter o espacio; selecciona el lote y conserva el foco. Por instrucción del usuario, el panel lateral con fondo desenfocado y su tabla de detalles queda pendiente del diseño. No se simula ese panel ni se consulta un detalle innecesario.

## Estilo común de tablas

`portal/src/presentation/portal-tables.css` contiene la base visual de Usuarios y accesos: cabecera verde, filas claras, bordes blancos, tipografía y espaciado compartidos. Tanto `DataTable` como la tabla de Usuarios y accesos usan `portal-data-table`. Los listados del Portal que usan `DataTable` reciben la misma base; se conservan sus columnas, selección, filtros y paginación. En móvil las tablas admiten desplazamiento horizontal dentro de su contenedor.

## Fecha de asignación

Aplicar `backend/supabase/migrations/202610221100_harvest_listados_lotes.sql`, después de la migración de cultivos `202610221000_harvest_cultivos_supervisores.sql`. La ampliación conserva las guardas instaladas y los privilegios de las funciones existentes.

`asignadoEn` se obtiene de `operaciones_pda_procesadas.creado_en` mediante el UUID de la operación de asignación, su empresa y tipo `ASIGNAR_TICKET`. Esa fecha se usa también para ordenar el índice de asignaciones antes de paginar. No se modifica ninguna asignación ni se generan fechas retrospectivas. Un registro histórico sin recibo muestra «Sin fecha registrada»; nunca se sustituye por la fecha de creación del lote. Las fechas se presentan en `America/Lima`.

La migración es reejecutable, pero no se ha aplicado a Supabase remoto desde esta entrega.

## Verificación local

Pruebas de componentes para columnas, fechas, selección del icono, errores, vacío, paginación y respuestas tardías. Pruebas SQL con las migraciones reales para fecha de recibo, reejecución, permisos y aislamiento de cultivos y empresas. Comprobación visual en Chrome a 1920, 1440, 1024, 768, 390 y 320 píxeles, incluidas las dos pestañas y la tabla de Usuarios y accesos.

Fixture de desarrollo: `/tests/visual.html?single&campaign&ticket-lists&ruta=/cosecha/lotes`.
