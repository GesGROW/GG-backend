# Recipientes y kilos estimados

Cada lectura nueva del PDA captura `tipoRecipiente` (`JABA` o `JARRA`).
El peso equivalente es fijo: 2.4 kg por jaba y 1.3 kg por jarra. El servidor
deriva el peso a partir del tipo; no acepta un peso arbitrario del cliente.
La selección afecta solo a las siguientes lecturas de la misma sesión.

La cola y las lecturas locales conservan el tipo y el peso al trabajar sin
conexión. Cambiar de recipiente no cambia las operaciones pendientes. Un
reintento con otro recipiente y el mismo UUID de operación se rechaza.

Los registros anteriores conservan su significado de jabas y no reciben
un peso supuesto. Los kilos se muestran como estimados; los agregados con
lecturas antiguas indican que su peso es parcial. Sin pesos conocidos se
muestra «Sin peso registrado», nunca un cero que sugiera una medición.

## Bonos

La configuración de campaña contiene dos bonos independientes y opcionales.
Para cada cosechador y día de Perú se suman todos los lotes de la campaña:

`bono jabas = máximo(0, jabas − umbral jabas) × monto jaba`

`bono jarras = máximo(0, jarras − umbral jarras) × monto jarra`

El bono total suma ambos. El peso no interviene en los bonos. Las reglas se
guardan juntas en el historial inmutable y se bloquean desde la primera
apertura del día, incluso si se cierra sin lecturas. Las reglas de jarras
empiezan deshabilitadas. Los clientes anteriores conservan las reglas de
jarras si guardan únicamente la configuración de jabas.

## Reportes y compatibilidad

Producción y Rendimiento permiten escoger el recipiente. El gráfico diario
de bonos usa el conteo, umbral y bono del recipiente seleccionado. Las tablas
de bonos muestran ambos conteos, kilos estimados, extras y bonos separados.
Los RPC anteriores y operaciones encoladas sin tipo siguen siendo válidos;
no se les asigna un peso. Los reportes anteriores que dicen «jabas» excluyen
las jarras. Las autorizaciones de empresa, campaña y dispositivo se mantienen
en los RPC existentes; las nuevas fachadas públicas son SECURITY INVOKER.

La opción «General» de Producción y Rendimiento suma jabas y jarras como
paquetes, sin convertirlas por peso. El peso estimado ocupa una quinta
tarjeta y muestra N/A si no hay pesos conocidos. Bono conserva únicamente
sus dos recipientes independientes; sus tablas permiten desplazamiento
horizontal y usan N/A para los pesos desconocidos.

Verificación: pruebas SQL con lectura mixta, reintentos, aislamiento,
historial y bloqueo; pruebas de cola y restauración offline; pruebas de
configuración y selección del gráfico; compilaciones del portal y del PDA.
