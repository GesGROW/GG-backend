# Tareo de Quijas: correspondencias internas y descarga

En Cosecha → Bonos, **Descargar tareo Excel** genera el archivo con un clic, utilizando la campaña, las fechas y el trabajador seleccionados en el reporte. No hay carga de padrón ni formulario de códigos al descargar.

El XLSX contiene la hoja TAREO y las 16 columnas del formato de Quijas. Días 01–07: cero numérico; asistencia: N; orden de producción: vacía. No calcula horas ni incluye importes de bonos. Los códigos se escriben como texto, con ceros iniciales y sin interpretar fórmulas.

## Datos internos

El padrón se carga una vez en `harvest_bonos_privado.padron_trabajadores`, por empresa, DNI y código externo. Sus datos personales no se incluyen en migraciones, fuentes ni fixtures. Se vincularon por DNI exacto 37 trabajadores existentes de Quijas; los 123 códigos quedan disponibles para futuras altas. El trigger completa el código al crear un trabajador que figure en el padrón. No se crean cuentas ni trabajadores automáticamente por cargar el padrón.

El código se consulta y edita junto con nombres y apellidos en la ficha de **Cosechadores/Jaberos** de la campaña. Los cambios son atómicos bajo el permiso de gestión de Cosecha; no requieren el módulo WORKFORCE y no renuevan la jornada de un jabero.

La labor procede de una correspondencia por empresa y función: COSECHADOR → 101333; JABERO → 160003. El código de actividad todavía no está confirmado y se deja vacío donde no esté configurado. No se deduce recortando el código de labor.

El consumidor procede de la combinación de lote y variedad de la cosecha, con catálogo externo guardado en `harvest_bonos_privado.consumidores` y relaciones en `consumidores_lote`. Para Quijas:

| Ubicación | Consumidor |
| --- | --- |
| Lote 02 / Ventura | TR011003 |
| Lote 02 / Biloxi | TR011004 |
| Lote 02 / Sekoya | TR011005, sector A provisional indicado por el usuario |
| Lote Jerry | TR0110006, Jerry Farms |
| Lote 07 | TR0110010 |

Estas relaciones ya están cargadas. Si se necesita corregir una, se hace en **Configurar → Configuración general de la campaña → Consumidores del tareo**, con selección del catálogo existente y control de revisión. No se vuelve a ingresar al descargar.

## Producción, jaberos y períodos

La fuente es la producción reportable. Para cada cosecha se incluye el cosechador y el jabero identificado por la sesión correspondiente. Se conservan los participantes históricos aunque sus asignaciones actuales cambien. El archivo agrupa por trabajador, semana, actividad, labor y consumidor, evitando duplicados por lecturas o sesiones. No representa asistencia ni incluye indiscriminadamente a todo el padrón.

Las fechas se delimitan en America/Lima y se respeta exactamente el rango filtrado, aunque abarque varias semanas. Cada semana va de jueves a miércoles. El período AAAAMM-SS se obtiene del jueves inicial: año/mes calendario y semana ISO de ese jueves. Por ejemplo, del 5 al 11 de noviembre de 2026 corresponde a 202611-45. El criterio de semanas que cruzan mes/año queda documentado para ajustarlo si Quijas confirma otra convención.

La consulta y descarga verifican reports.view, empresa y acceso al cultivo/campaña. Los catálogos y el padrón son privados; no tienen acceso directo para clientes. Las reglas y cálculos existentes de bonos permanecen independientes.

## Migraciones

Se requieren las migraciones de exportación `20261109203912`, datos internos `20261109212036` y configuración de consumidores `20261109212353`. Las dos últimas se aplicaron en Supabase durante esta corrección; los archivos locales conservan las versiones registradas remotamente. La carga inicial del padrón y catálogos es una operación de datos separada del esquema.
