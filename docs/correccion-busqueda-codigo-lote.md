# Búsqueda por código visible del lote

El listado mostraba `harvest_impresion_lotes.codigo_lote`, pero el índice de
búsqueda sólo incluía el UUID y la campaña para lotes generados, y los datos del
cosechador para lotes asignados. Por eso buscar `000061` devolvía cero resultados
aunque el lote apareciera al limpiar los filtros.

`20261029190249_harvest_busqueda_codigo_lote.sql` amplía únicamente el texto
buscable de `harvest_admin_indice` con el código del snapshot de impresión en
ambos listados. Conserva la búsqueda anterior, los lotes históricos sin snapshot,
las guardas de acceso, las fechas de asignación y los privilegios instalados.
El código se obtiene por la clave primaria `harvest_impresion_lotes.lote_id`.

Aplicada en Quijas-SCC el 29 de octubre de 2026. Se verificó la RPC filtrada con
el rol `authenticated` y una identidad de supervisor autorizada: buscar `000061`
pasó de cero a un resultado en generados y asignados, con el código correcto.
La migración sólo cambia una función de consulta; no modifica los datos.

Prueba de regresión: `node --test tests/harvest-busqueda-codigo-lote-sql.test.js`.
Incluye códigos visibles fuera de la primera página, total y paginación, estado,
fechas, nombre/DNI, compatibilidad con la RPC anterior, lotes históricos,
aislamiento de campaña, permisos y reejecución.
