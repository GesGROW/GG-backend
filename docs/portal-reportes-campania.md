# Producción y Rendimiento dentro de Cosecha

La opción Reportes del contenedor de campaña abre `/cosecha/produccion` y
`/cosecha/rendimiento`, conservando `?campania=…` al cambiar de pestaña. Cambiar
de campaña conserva la subopción y reinicia sus filtros. Se mantiene el bloqueo
de las pantallas antiguas `/reportes/*`; estas dos vistas nuevas están habilitadas
dentro de Cosecha para quienes tienen `reports.view`, permiso de consulta/gestión
de Harvest y HARVEST contratado. En cultivos administrados se exige participación.

## Producción

Filtros de lote, variedad y rango de fechas. El catálogo incluye los lotes y
variedades de la campaña aunque aún no tengan producción. Elegir lote limpia
la variedad anterior y limita las variedades disponibles a ese lote.
El período inicial comprende el inicio de campaña/primer hecho hasta hoy.

Los cuatro indicadores y el gráfico provienen de una misma consulta:

- Total jabas: hechos admitidos del período, lote y variedad seleccionados.
- Jabas hoy: hechos de hoy en Lima dentro de esos mismos filtros.
- Promedio diario: total dividido por días con producción, redondeado a un decimal.
- Días de producción: días distintos con hechos, sin contar los días vacíos.

El gráfico incluye días sin hechos con valor cero y destaca hoy en verde claro.
Sus barras muestran fecha y cantidad al enfocarse/pasar el cursor; admite
desplazamiento horizontal para períodos largos.

## Rendimiento

Filtros de lote y período, inicialmente Hoy. Muestra cosechadores con producción
en ese período, promedio de jabas por cosechador, mayor rendimiento y total
cosechado. «Cosechadores activos» significa participantes que produjeron en el
período, no el número de cuentas o trabajadores habilitados actualmente.
No se descarta producción histórica al desactivar un trabajador.

El ranking se calcula en servidor con `dense_rank` para preservar empates; se
ordena por jabas descendentes, nombre e ID. El podio contiene las primeras tres
personas del orden (pueden compartir posición) y la lista desplazable muestra
las restantes sin repetirlas. No se fabrican puestos si faltan participantes.
Las barras de la lista se escalan respecto del mayor valor de esa lista.

## Base y despliegue

Aplicar `backend/supabase/migrations/202610221300_harvest_reportes_campania.sql`
después de las anteriores. Añade el RPC de lectura `harvest_reportes_campania`
sin modificar los endpoints históricos ni las tablas de producción. Usa
`harvest_produccion_reportable`, que ya compone legacy y registros Harvest
admitidos por versión de cutover. No suma fuentes en el navegador.

Autoriza empresa, permiso, módulo, campaña y participación antes de consultar.
Valida que los filtros pertenezcan a los lotes de esa campaña. Fechas inclusivas
en America/Lima, máximo hasta hoy y límite de diez años por consulta. Datos,
métricas, evolución y ranking se obtienen del mismo conjunto de hechos.
ACL: sólo authenticated; no concede lectura directa de tablas privadas.

Esta entrega prepara y prueba la migración localmente. No se ha aplicado a una
base remota. Los datos de prueba aparecen sólo en `/tests/visual.html?single&campaign&ruta=/cosecha/produccion`.

## Verificación

- Aplicación: `cd portal; npm.cmd run test:application`.
- Interfaz: `cd portal; npm.cmd run test:presentation`.
- SQL de integración: `cd backend; node --test tests/harvest-cultivos-supervisores-sql.test.js`.
- Compilación: `cd portal; npm.cmd run build`.
- Revisión visual: escritorio, tablet y móvil; filtros, navegación, colores y ausencia de desbordamiento global.
