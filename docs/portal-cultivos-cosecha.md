# Cultivos y campañas del supervisor

La entrada del módulo Cosecha incluye un selector de campañas y la opción «Agregar campaña / cultivo». Esta opción abre `/cosecha/configurar`. Un supervisor sin campañas disponibles llega directamente a esa pantalla desde `/cosecha`.

El formulario sigue los PNG proporcionados: dos pestañas y un panel lateral para solicitar participación en otros cultivos de la misma empresa. Sin cultivos propios o compartidos se habilita la pestaña de cultivo; con cultivos disponibles se abre la de campaña.

## Creación

1. Nombre, variedades y color de la paleta de diez colores. Las variedades empiezan con tres campos y agregan otro al completarlos; el listado tiene desplazamiento propio.
2. Lotes con nombre y una o varias variedades del cultivo. Se exige al menos un lote y al menos una variedad por lote.
3. Campaña con nombre, inicio predeterminado a hoy en Lima y fecha de fin. El inicio no admite fechas anteriores a hoy; el fin debe ser igual o posterior al inicio.

La creación confirma cultivo, variedades, lotes, participación del creador y primera campaña en una sola transacción. Cancelar antes de activar descarta el borrador. Los reintentos de la misma intención conservan el identificador de operación para recuperar el recibo sin duplicar datos.

Una campaña adicional reutiliza las variedades y plantillas de lotes del cultivo seleccionado. Se conserva, por decisión del usuario, una sola campaña activa por cultivo. El cierre de la anterior debe preceder a otra activación; esta pantalla de alta muestra el conflicto que devuelve el servidor. El cierre operativo para supervisores con sólo HARVEST queda pendiente de su pantalla y caso de uso específico; la API anterior de Campaign exige otros permisos y capacidad comercial.

## Supervisores cooperativos

Los cultivos disponibles muestran variedades, lotes, supervisores y campaña actual. «Solicitar unirme» crea una solicitud pendiente. Un supervisor que ya participa en el cultivo puede aprobarla o rechazarla. Aprobar agrega al solicitante al mismo cultivo; desde ese momento consulta sus campañas sin duplicar información.

«Actualizar cultivos» permite consultar nuevas solicitudes o incorporaciones aprobadas. Los estados del servidor `PENDING`, `APPROVED` y `REJECTED` se muestran en español. Los errores conservan el borrador para reintentar.

El servidor comprueba sesión, empresa, permiso `harvest.manage`, módulo HARVEST y participación cuando corresponde. El owner sin rol operativo conserva su administración y resumen de Home. Los cultivos históricos anteriores a esta migración mantienen su autorización anterior; no se asignan automáticamente a un supervisor nuevo.

## Aplicación y verificación

Aplicar `backend/supabase/migrations/202610221000_harvest_cultivos_supervisores.sql` después de las migraciones existentes, incluida `202610211200_usuarios_accesos_modulo.sql`. La migración no se ha aplicado a Supabase remoto desde esta entrega. El contrato y las comprobaciones de SQL están en `backend/docs/harvest-cultivos-supervisores.md`.

Verificación local: pruebas de Application, componentes, navegación y SQL real en PGlite; compilación de producción y recorrido en Chrome a 1920, 1440, 1024, 768, 390 y 320 píxeles, con las cuatro vistas, creación, selector y aprobación.

Fixtures de desarrollo, excluidas de la entrada de producción:

```text
/tests/visual.html?single&crop-setup
/tests/visual.html?single&crop-setup&own-crop
/tests/visual.html?single&crop-setup&own-crop&join-request
```
