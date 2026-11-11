# Excel de bonos semanales

Cosecha → Bonos → Descargar bonos Excel genera un XLSX de 17 columnas con un clic. Utiliza los filtros actuales del reporte. Cada fila corresponde a un trabajador y una semana de jueves a miércoles. Las siete columnas diarias contienen el bono de jabas más el bono de jarras; la última contiene Total semanal (S/). Los importes son números con dos decimales.

La consulta reutiliza harvest_reportes_bonos y sus reglas históricas, permisos y fecha America/Lima. No modifica el cálculo ni recalcula umbrales por lote. Los bonos se incluyen una sola vez por persona y día. El archivo verifica las sumas en céntimos contra los totales del backend antes de descargar.

Si el filtro comprende varias semanas, se generan varias filas por trabajador. Si corta una semana, solo se incluyen los días filtrados; los restantes muestran cero. El período AAAAMM-SS utiliza año/mes y semana ISO del jueves inicial. Un día sin bono muestra 0,00.

Los códigos, el catálogo de consumidores y las correspondencias internas de la integración anterior se recuperan del respaldo privado. No se pide cargar archivos al descargar. El código se edita junto al nombre del cosechador/jabero, y los consumidores se mantienen en Configuración de campaña. Jerry Farms conserva TR0110006; Lote 02/Sekoya conserva la asignación provisional A, TR011005.

Cuando una persona trabaja en varios consumidores durante una semana, el campo consumidor queda vacío. Se suma todo el bono diario sin inventar un reparto ni repetir importes. El código de actividad sigue vacío hasta confirmación. Los jaberos solo tendrán bonos si el cálculo existente les atribuye producción; no se les copia el bono del cosechador.

Los nombres vaciados durante la reversión previa permanecen como están: esta entrega recupera los códigos y las correspondencias, sin volver a escribir los nombres personales. El catálogo y el padrón son privados, aislados por empresa y excluidos de Git.

La migración 20261111035453 recupera el esquema después de la reversión y añade la consulta monetaria semanal. No modifica producción, correcciones ni reglas de bonos. La carga del padrón se ejecuta separada del esquema.
