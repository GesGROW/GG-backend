# Resúmenes del Portal

Trabajadores y Asignaciones de tickets usan `SummaryMetrics.jsx` con los estilos
comunes de `summary-metrics.css`. Comparten iconos de 50 px en cuadrícula de 24,
trazo de 1.5, etiquetas de 17 px y cifras de 28 px, además de separación y
comportamiento adaptable a pantallas pequeñas.

Cada pantalla entrega `label` (nombre accesible del resumen) e `items`. Cada ítem
define `key`, `icon` (nombre del catálogo `Icon`), `label` y `value`. Si incluye
`onClick`, se presenta como botón; `pressed` comunica el estado de un filtro.
Las métricas informativas se presentan como artículos. Los iconos son decorativos.

`className` permite ajustar la posición del bloque, como el margen superior de
Trabajadores, sin duplicar tamaños ni estilos de los indicadores. Las consultas y
los cálculos de métricas permanecen en sus respectivas pantallas.
