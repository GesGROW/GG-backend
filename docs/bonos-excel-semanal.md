# Excel de bonos semanales

Cosecha → Bonos → Descargar bonos Excel genera un XLSX de 17 columnas con un clic. Utiliza los filtros actuales del reporte. Cada fila corresponde a un trabajador y una semana de jueves a miércoles. Las siete columnas diarias contienen el bono de jabas más el bono de jarras; la última contiene Total semanal (S/). Los importes son números con dos decimales.

La consulta reutiliza harvest_reportes_bonos y sus reglas históricas, permisos y fecha America/Lima. No modifica el cálculo ni recalcula umbrales por lote. Los bonos se incluyen una sola vez por persona y día. El archivo verifica las sumas en céntimos contra los totales del backend antes de descargar.

Si el filtro comprende varias semanas, se generan varias filas por trabajador. Si corta una semana, solo se incluyen los días filtrados; los restantes muestran cero. El período AAAAMM-SS utiliza año/mes y semana ISO del jueves inicial. Un día sin bono muestra 0,00.

Los códigos, el catálogo de consumidores y las correspondencias internas de la integración anterior se recuperan del respaldo privado. No se pide cargar archivos al descargar. El código se edita junto al nombre del cosechador/jabero, y los consumidores se mantienen en Configuración de campaña. Jerry Farms conserva TR0110006; Lote 02/Sekoya conserva la asignación provisional A, TR011005.

El consumidor es el de la primera cosecha cronol?gica del trabajador en esa semana (jueves a mi?rcoles), dentro de la campa?a. Se consulta toda la semana incluso si el filtro empieza despu?s; empates se resuelven por fuente e identificador. Si esa primera cosecha no tiene correspondencia, queda vac?o. Se suman los bonos de todos los consumidores sin repetir importes. La actividad de cosecha es `016`. Los jaberos solo tendrán bonos si el cálculo existente les atribuye producción; no se les copia el bono del cosechador.

Los nombres vaciados durante la reversión previa permanecen como están: esta entrega recupera los códigos y las correspondencias, sin volver a escribir los nombres personales. El catálogo y el padrón son privados, aislados por empresa y excluidos de Git.

La migración 20261111035453 recupera el esquema después de la reversión y añade la consulta monetaria semanal. No modifica producción, correcciones ni reglas de bonos. La carga del padrón se ejecuta separada del esquema.

Ejemplo de numeraci?n: 5?11 noviembre de 2026 usa `202611-45`; 12?18 noviembre usa `202611-46`. El lunes 9 cambia la semana ISO del calendario, pero no inicia otra semana de este reporte.

## Nombres y codificación

Leer archivos de importación con UTF-8 explícito. En PowerShell, usar `Get-Content -Encoding UTF8`; al transportar JSON por consola, preferir escapes Unicode (`ensure_ascii=True`) para evitar conversiones de la página de códigos. No corregir nombres adivinando ni volver a interpretar texto UTF-8 como ANSI.

El trigger `workforce_nombres_unicode` valida altas y cambios de nombres/apellidos, incluidos los imports directos. Rechaza secuencias habituales de mojibake, controles C1 y el carácter de reemplazo. Conserva las letras acentuadas y la ñ correctas. El portal muestra los nombres guardados; el Excel los convierte a mayúsculas sin cambiar su codificación UTF-8.
