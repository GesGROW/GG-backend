# Tickets de cosecha: TSC TTP-247, PDF y TSPL

La vista activa es `GeneracionCampania`, dentro de `/cosecha/generar?campania=...`. Primero muestra el PDF dentro del generador sin guardar tickets. **Imprimir y guardar** reserva un documento provisional y abre el diálogo del navegador. Al cerrarlo, GesGROW pregunta **¿Se imprimieron los tickets?**: **Sí, se imprimieron** guarda los lotes y tickets definitivos; **No, cancelar** elimina el provisional y restablece el formulario. La pantalla ofrece únicamente PDF e impresión mediante el navegador, sin nombre de impresora ni token local.

## Revisar antes de guardar

1. Introducir cantidad total y tickets por lote y pulsar **Ver vista previa**. El PDF aparece dentro de la misma página. No abre ventanas ni consume códigos de lote.
2. Revisar las etiquetas. Se pueden editar las cantidades sin crear datos. **Descartar generación** restablece cantidades y vista previa a sus valores iniciales. Cualquier cambio de cantidades exige una vista previa nueva.
3. Pulsar **Imprimir y guardar**. Se reservan los códigos sin crear lotes ni tickets utilizables. La salida usa una página HTML de igual origen con barras SVG vectoriales dentro de un iframe. Comparte posiciones, barras y medidas con el PDF y TSPL. Se solicita el diálogo del navegador sin abrir otra pestaña.
4. Cerrar el diálogo y responder en GesGROW. **Sí, se imprimieron** guarda exactamente esos códigos e inicia la cuenta de tres segundos. **No, cancelar** borra el documento provisional, no guarda lotes ni tickets y reinicia inmediatamente.

La vista mantiene un recuadro de 563 × 403 px en la escala de escritorio, adaptable a pantallas menores. El paso 4 aparece debajo del PDF y sus botones entran con una animación breve. Se espera `afterprint` antes de mostrar la pregunta. Ese evento no acredita impresión: la cuenta 3, 2, 1 empieza únicamente después de la respuesta positiva y su confirmación en servidor. Un fallo de conexión conserva la operación y permite repetir la respuesta sin duplicarla. El iframe y el estilo temporal de impresión se retiran al cerrar la salida o abandonar la página. Los márgenes cero suprimen encabezados y pies de Chrome con su configuración predeterminada; los márgenes personalizados pueden volver a habilitarlos.

La vista preliminar utiliza candidatos reales sin reservarlos. Si otra operación consume códigos, cambia la fecha en Lima o cambia el cultivo antes de reservar, se exige actualizar y revisar la vista previa. Una comprobación después de asignar los prefijos revierte la reserva si detecta una carrera. El documento provisional congela fecha, cultivo y códigos hasta resolverlo. Los prefijos cancelados no se reutilizan ni mediante importaciones, para que una etiqueta que haya salido accidentalmente nunca identifique otro lote. Se elimina el documento provisional, pero se conserva esta reserva técnica. Los huecos de secuencia son normales.

El PDF incluye preferencias de impresión sin escalado (`PrintScaling: None`) y selección de papel por su tamaño (`PickTrayByPDFSize`). Son sugerencias al visor: la web no puede seleccionar la impresora ni cambiar obligatoriamente el tamaño que ofrece el controlador. Si aparece Microsoft Print to PDF con papel Carta, se verá una hoja grande con las etiquetas en una esquina. Para el rollo debe seleccionarse la TSC con papel de 100 × 20 mm y escala 100%.

El navegador no informa de forma fiable si salió papel o si se canceló el diálogo. Por eso cerrar o cancelar el diálogo nunca confirma por sí solo la generación. La decisión se toma en GesGROW. Si se pierde la respuesta al guardar, repetir **Sí** recupera el mismo resultado; **No** no elimina una generación que ya fue confirmada. Cancelar una reimpresión de una generación anterior tampoco elimina sus tickets históricos.

## Formato acordado

- Cada etiqueta mide 30 mm de ancho por 20 mm de alto; siempre tres columnas.
- El soporte completo mide 100 mm de ancho. Cada página PDF y cada fila TSPL mide 100 × 20 mm, independientemente de las separaciones configuradas.
- El orden es de izquierda a derecha y después la fila siguiente. Se aprovechan los espacios con tickets del siguiente lote. Solo el final de toda la generación puede dejar columnas vacías.
- Arriba se imprime Code 128. `C01061308` contiene el prefijo `C`, código de lote `010613` y ticket `08`.
- Abajo, izquierda: `TI-MAN` o `TI-ARA`, y fecha `YYYYMMDD`.
- Las barras, el cultivo y la fecha comparten la guía izquierda a 2.5 mm del borde de cada etiqueta. El código empieza a 2.5 mm del borde superior y tiene 9 mm de alto, conservando espacio para las dos líneas inferiores.
- Abajo, derecha: `010613|08`, y ordinal del lote dentro de la generación (por ejemplo `98`). Este ordinal es independiente del código de lote.
- La fecha se fija al generar, en `America/Lima`. El cultivo y su abreviatura se toman de la campaña y se conservan con el recibo original.

Los números de ticket usan mínimo dos dígitos, sin truncarse: `01` a `99`, luego `100`, etc. El prefijo de lote siempre ocupa seis dígitos, por lo que el código sigue siendo inequívoco. La secuencia global cubre `000001..999999`, sin reiniciarse por empresa o campaña; al agotarse falla explícitamente. Los huecos tras transacciones fallidas son normales. Se reservan prefijos compatibles existentes y de importaciones posteriores para evitar reutilización.

Los UUID internos de lote siguen identificando sus relaciones. Las generaciones antiguas y sus códigos no se transforman: conservan su impresión QR/A4 en la opción PDF.

## Base de datos

La base de impresión usa `backend/supabase/migrations/20261024074658_harvest_impresion_tsc.sql`, seguida de `20261024145845_harvest_vista_previa_tickets.sql`. El flujo provisional y la respuesta humana requieren además `20261024181514_harvest_confirmacion_salida_impresion.sql`, creada con Supabase CLI. La nueva migración no convierte generaciones anteriores en impresiones confirmadas ni modifica sus recibos inmutables.

La migración `20261024182100_harvest_indice_impresion_pendiente_actor.sql` cubre la clave foránea del actor para evitar recorridos completos de documentos provisionales. Ambas actualizaciones del flujo de confirmación se aplicaron a Quijas-SCC mediante la conexión Supabase.

Las tres tablas nuevas tienen RLS y no conceden acceso directo a `anon`, `authenticated` ni `service_role`. Se accede únicamente por las funciones autorizadas, con `search_path` fijo. Los avisos del asesor sobre [funciones SECURITY DEFINER autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) corresponden aquí a esa fachada deliberada; las [tablas sin políticas de acceso directo](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) son privadas y mantienen denegado dicho acceso.

La migración de vista previa se aplicó a Quijas-SCC mediante la conexión Supabase y se verificaron sus permisos remotos. La versión local coincide con el registro remoto `20261024145845`. Las dos RPC son ejecutables solo por `authenticated`, con autorización de gestión dentro de cada función; el helper privado no está disponible para `anon`, `authenticated` ni `service_role`. El [aviso del asesor sobre RPC autenticadas con SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) corresponde aquí a esa exposición intencional, comprobada con las pruebas de permisos y aislamiento.

Se incorporan reservas de códigos de lote, lotes de impresión y números de ticket, con restricciones de unicidad, claves foráneas, RLS y bloqueo de modificación del snapshot. `harvest_generaciones.resultado` guarda fecha, cultivo, abreviatura y orden de lotes. La operación de generación conserva su UUID idempotente, intención y actor originales.

El índice existente de tickets por lote y campaña se amplía con `codigo`, conservando sus búsquedas anteriores. Esto evita recorrer un lote completo por cada comprobación de clave foránea al guardar una generación grande, incluso con estadísticas iniciales. La reconstrucción ocurre dentro de la transacción de la migración y puede requerir una ventana de mantenimiento si ya hay muchos tickets.

RPC autorizadas:

| RPC                                                                      | Uso                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `harvest_admin_generar`                                                  | Confirma generación y devuelve recibo; conserva su firma actual.                                       |
| `harvest_admin_previsualizar`                                            | Lee campaña, cultivo y próximos prefijos disponibles sin reservarlos ni crear filas.                   |
| `harvest_admin_confirmar_impresion`                                      | Verifica la propuesta revisada, confirma y devuelve recibo; idempotente por operación e intención.     |
| `harvest_admin_reservar_impresion`                                       | Flujo activo: reserva un documento provisional sin crear tickets ni lotes definitivos.                 |
| `harvest_admin_resolver_impresion`                                       | Respuesta positiva: crea los lotes y tickets una sola vez. Negativa: elimina el documento provisional. |
| `harvest_admin_generacion(p_tenant_id,p_operacion_id)`                   | Recupera el recibo persistido.                                                                         |
| `harvest_admin_documento_impresion(p_tenant_id,p_operacion_id,p_offset)` | Documento paginado, hasta 500 tickets, en orden numérico de lote y ticket.                             |
| `harvest_cultivos_editar(p_tenant_id,p_cultivo_id,p_datos)`              | Actualiza únicamente `abreviaturaImpresion` en cultivos propios con autorización.                      |

La propuesta, confirmación, recuperación e impresión exigen `harvest.manage`, HARVEST habilitado, empresa y participación vigentes en el cultivo. Otro supervisor autorizado puede recuperar un recibo. Un cultivo de campaña cambiado tampoco revela el snapshot del cultivo anterior a quien no participa en él. El helper de comparación y las tablas/secuencia no admiten llamadas públicas ni escritura directa.

`cultivos.abreviatura_impresion` acepta tres letras A-Z. Mandarina y arándano reciben MAN y ARA; otros nombres reciben inicialmente sus tres primeras letras normalizadas (se completa con X si faltan letras). La API de creación acepta `abreviaturaImpresion` y el catálogo la devuelve. Cambiarla afecta generaciones futuras; la existente conserva su etiqueta. El editor de abreviatura está disponible por RPC, sin añadir un formulario de edición de cultivos en esta entrega.

El listado de lotes devuelve `codigo`, `generacionId` y `numeroLote`. La tabla no muestra enlaces de reimpresión ni avisos de impresión sin confirmar.

## Preparar el portal

Desde `scc/portal`:

```powershell
npm.cmd ci
npm.cmd run build
```

Se fijaron `jsbarcode` 3.12.3 y `jspdf` 4.2.1 en el paquete y lockfile. Los códigos y PDF se generan localmente, sin servicios externos. PDF y TSPL usan exactamente la misma secuencia de barras de Code 128, con checksum; TSPL dibuja las barras con `BAR` y textos con `TEXT`.

En **Salida de tickets**, elegir:

- **Vista previa PDF e impresión:** es el único flujo disponible para los trabajadores. El borrador se muestra dentro del generador; **Imprimir y guardar** abre el diálogo del navegador desde la misma página. Configurar el papel de 100 × 20 mm e imprimir al 100%, sin ajuste de página, márgenes ni encabezados. El sensor y controlador deben estar calibrados para la separación vertical.

Las utilidades de TSPL y del puente Windows se conservan como herramientas internas; ya no se muestran ni se usan desde el generador.

El ancho de 100 mm del rollo está confirmado. Las separaciones iniciales de 2 mm y los márgenes laterales de 3 mm son una distribución provisional que centra las tres etiquetas: `3 + 30 + 2 + 30 + 2 + 30 + 3 = 100 mm`. Medir las separaciones y el margen reales y ajustarlos en pasos de 0.125 mm (un punto a 8 puntos/mm). El margen derecho se calcula como `100 - 90 - 2 × separación horizontal - margen izquierdo`; una configuración que no quepa se rechaza. Ajustar espacios no cambia el tamaño del papel ni estira las etiquetas. TSPL utiliza `SIZE 100 mm,20 mm` y `GAP` para la separación vertical.

Con tres columnas de 30 mm, cada código reserva al menos diez módulos blancos a cada lado. Los códigos como `C01061308` aprovechan unos 25 mm de ancho para las barras, con una escala nominal muy próxima a dos puntos por módulo; los límites acumulados se redondean a puntos enteros para dibujar el mismo patrón en PDF y TSPL. Para códigos más largos se utilizan módulos enteros según el espacio disponible: su ancho puede ser menor para conservar la lectura a 203 dpi. En esta etiqueta pequeña hay que confirmar lectura física con la TTP-247 y el Honeywell antes de imprimir masivamente; la prueba digital no sustituye calibrar material, velocidad y densidad. Conservar las zonas blancas y la escala real.

## Servicio local de Windows

Instalar el controlador TSC y comprobar el nombre de su cola. El servicio se ejecuta en la computadora desde la que se imprime: esa computadora necesita acceso a la impresora mediante USB o una cola de Windows de red configurada. La conexión inalámbrica del navegador por sí sola no enlaza con la impresora. Desde `portal/scripts/impresion-tsc/`:

```powershell
node setup.mjs --origin http://localhost:5174 --printer "TSC TTP-247"
node server.mjs
```

Para producción usar el origen HTTPS real del portal. El servicio escucha solo en `127.0.0.1:18191`; la configuración local contiene el token que debe introducirse en la vista. El token no se guarda en el almacenamiento del navegador. Las instrucciones completas, requisitos y opciones de inicio están en `scripts/impresion-tsc/README.md`.

La configuración inicial tiene `dryRun: true`: valida y responde como simulación sin enviar papel. La vista distingue esa respuesta de un trabajo encolado. Tras la prueba y revisión de la cola, cambiar `dryRun` a `false` y reiniciar para habilitar impresión física.

El cliente usa `POST /imprimir` con `X-Gesgrow-Print-Token` y `{trabajoId,impresora,tspl}`. El servicio comprueba origen, token, nombre de cola, gramática TSPL y geometría antes de escribir bytes RAW por `winspool.drv`. Solo se admiten los comandos de la plantilla. Tiene límite de 100 MiB del JSON completo e idempotencia de envío durante una hora, en memoria mientras el proceso sigue activo.

Si se pierde la respuesta, el portal conserva el UUID de envío en memoria y lo reutiliza al reintentar durante esa ventana. Tras una confirmación, una reimpresión deliberada recibe otro UUID. Antes de recargar, reiniciar el servicio o repetir un error de resultado incierto hay que revisar la cola: la idempotencia no sobrevive reinicios y no acredita que el papel haya salido. No se reintenta automáticamente una escritura parcial.

Un navegador puede solicitar permiso para acceder a la red local. El servicio responde al preflight de red privada; conceder el acceso al servicio local cuando corresponda. No abrir este puerto en el router.

## Validación realizada

- Pruebas SQL con PGlite y la cadena real de migraciones: recibos, orden numérico, prefijos, aislamiento, permisos, snapshots e inmutabilidad.
- Pruebas del portal: paginación, reintentos, autorización, recuperación, salidas y tres columnas continuas.
- Pruebas del servicio: CORS, token, límites, bytes RAW, idempotencia, errores parciales y compilación del helper PowerShell sin imprimir.
- PDF de muestra actualizado de 20 tickets: siete páginas de 100 × 20 mm, con separaciones provisionales de 2 mm y márgenes laterales de 3 mm. Revisión visual del cruce entre lotes y lectura independiente de las 20 etiquetas con ZXing a 203 dpi.
- Integración del TSPL real del portal con el servicio HTTP en modo seco. No se ha usado una impresora física. Las migraciones del flujo vigente están aplicadas en Quijas-SCC.
- Ajuste de ancho del código: muestra de 20 etiquetas y diez límites de numeración, hasta el ticket 100000, leídos con ZXing a 203 dpi con y sin suavizado; 3000 códigos de lote distintos leídos sobre la cuadrícula de 8 puntos/mm. Muestra actualizada en `output/pdf/tickets-30x20-corregidos.pdf`.

Comandos de prueba desde el workspace:

```powershell
npm.cmd --prefix portal test
node --test portal/scripts/impresion-tsc/tests/*.test.mjs
node --test backend/tests/harvest-impresion-tsc-sql.test.js
node --test backend/tests/harvest-vista-previa-sql.test.js
```

Durante la impresión solo el botón del paso 4 cambia a «Preparando…». El paso 3 conserva «Actualizar vista previa» y su color; permanece bloqueado hasta finalizar para no cambiar el documento confirmado.

Verificación del flujo de respuesta humana: 611 pruebas de backend, 136 pruebas de aplicación y 283 de presentación del portal aprobadas, además de compilación de producción. Las pruebas nuevas cubren reserva sin tickets definitivos, cancelación, códigos no reutilizables, guardado idempotente, respuesta perdida, permisos, recuperación y contador posterior a la confirmación. Falta probar la salida física con la TTP-247.
