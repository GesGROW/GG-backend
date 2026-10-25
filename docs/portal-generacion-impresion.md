# Campaña: generación e impresión de tickets

> La impresión vigente de tres columnas de 30 × 20 mm, PDF y TSPL se describe en [impresion-tickets-tsc.md](impresion-tickets-tsc.md). Las secciones A4 siguientes corresponden al formato histórico de generaciones anteriores.

El contenedor de una campaña muestra Tickets, Trabajadores y Reportes a la izquierda. Tickets incluye las subopciones de generación, lotes generados y asignaciones, rediseñadas a partir de los PNG y SVG proporcionados. Los listados comparten la base visual de tablas de Usuarios y accesos; sus contratos y la ampliación de fecha de asignación se describen en `portal-listados-lotes.md`.

El selector conserva «Agregar campaña / cultivo» y añade «(actual)» a las campañas cuyo estado es `ACTIVA`. Elegir una campaña abre `/cosecha/generar?campania=…`; una campaña cerrada permite consulta, pero no generación.

## Campos y pasos

Por aclaración expresa del usuario se mantiene el significado anterior del segundo campo: **tickets por lote**, no número de cosechadores. Por ejemplo, 100 tickets y 20 tickets por lote crean 5 lotes; 43 y 10 crean 4 lotes de 10 y un último lote de 3. El servidor sigue siendo la autoridad para crear y particionar los tickets.

Los campos empiezan en cero. Cada círculo se pone verde cuando su cantidad es un entero entre 1 y 100000. El botón de impresión aparece al completar ambos campos en una campaña activa. El tercer círculo se pone verde después de abrir la impresión; los fallos lo conservan pendiente.

Los SVG de las opciones laterales usan tamaño 35, trazo 3 y color `#022F2A`; los de las subopciones usan tamaño 24, trazo 2 y el mismo color.

## Impresión A4

La selección A4 también fue confirmada por el usuario. El botón abre una ventana de preparación dentro del clic del usuario, solicita la generación mediante `harvest_admin_generar` y consulta los tickets persistidos de cada lote por la API administrativa paginada. No fabrica códigos en el navegador.

La salida contiene el QR del código real, el código legible y la posición del ticket en su lote. Cada lote comienza en otra hoja A4; un lote grande puede continuar en más de una hoja. Los QR se generan localmente con `qrcode` 1.5.4, sin enviar códigos a servicios externos. La ventana conserva un botón para volver a abrir el diálogo del navegador sobre ese mismo documento.

Una respuesta perdida en generación permite reintentar con el mismo UUID. Un error posterior de consulta o impresión conserva el recibo y reintenta la impresión sin generar otro lote. Cambiar de empresa, revocar permisos o recibir tickets incompatibles impide abrir el documento. Salir de la pantalla durante la preparación cierra la ventana pendiente.

El navegador no informa de forma fiable si el papel se imprimió o si el usuario canceló. Por ello se muestra «Impresión abierta», sin registrar un estado físico «Impreso». La impresión y reimpresión auditadas en servidor siguen pendientes de su caso de uso específico.

No hay una nueva migración para imprimir: se reutilizan las RPC administrativas existentes. El flujo previo de cultivos cooperativos requiere `202610221000_harvest_cultivos_supervisores.sql`, entregado con su documentación independiente.

## Verificación

Pruebas de Application sobre recibos, paginación, duplicados, aislamiento y revalidación; componentes para pasos, valores cero, bloqueos, reintentos y salida durante una operación. Chrome a 1920, 1440, 1024, 768, 390 y 320 píxeles comprobó los estados del formulario, las cuatro fases y un documento de 43 tickets en cinco lotes, con 43 QR y una llamada a `print()` simulada. No se probó una impresora física.

Fixture de desarrollo excluida de la entrada de producción: `/tests/visual.html?single&campaign`.
