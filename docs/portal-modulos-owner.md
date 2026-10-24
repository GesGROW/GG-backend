# Módulos del owner

La ruta `/modulos` reproduce el PNG facilitado por el usuario, con lienzo de referencia 1920 × 1080. El acceso desde Módulos en el sidebar del owner abre directamente esta pantalla. El menú operativo de Cosecha se conserva para usuarios con permisos de módulo.

La pantalla contiene el área de módulos adquiridos/seleccionados, el botón con contador y el catálogo de Cosecha. No enlaza a registros, tickets, trabajadores ni reportes detallados. Los SVG de aguacate y suma utilizan los trazados entregados por el usuario: color `#022F2A`, trazo 2; y color `#A5A5A5`, trazo 3, respectivamente.

## Selección y contratación

Arrastrar Cosecha al área superior o seleccionarlo con clic/teclado añade una intención local. Pulsar el módulo seleccionado lo retira. Estas acciones no escriben en el servidor. Un módulo ya contratado no puede seleccionarse de nuevo ni abrir operaciones.

El contrato se consulta con el servicio comercial existente, que valida empresa, sesión y `company.manage`. El catálogo visible sólo publica Cosecha; los códigos de capacidades internas no aparecen como productos adicionales.

La compra con pago todavía no tiene una pasarela integrada. El botón Adquirir abre un diálogo que lo explica. Si el servidor permite administración comercial y la suscripción está activa, ofrece solicitar la activación mediante `habilitarModulo`; en otro caso indica que se contacte con GesGROW. No se inventan precios ni se afirma que se haya cobrado. La activación requiere pulsar explícitamente Activar módulo y usa UUID idempotente, versión comercial y autorización del servidor. Un fallo conserva la misma solicitud para reintentar. Un conflicto de versión exige actualizar los datos.

## Separación del owner

La plantilla `ADMIN_EMPRESA`, que representa actualmente al owner en Identity, pasa a tener `company.manage` y `reports.view`. Los roles operativos se asignan por separado y sus permisos se siguen combinando. Tener un módulo contratado no concede permisos operativos.

La migración `backend/supabase/migrations/202610211100_owner_modulos.sql` retira los permisos operativos heredados de ese rol en empresas existentes y corrige la siembra para empresas nuevas. No retira asignaciones de otros roles ni cambia sus permisos. Está preparada y probada en una base local PGlite; no se ha aplicado a Supabase remoto. La separación de los permisos persistidos requiere desplegar esta migración junto con el frontend.

El Portal utiliza los permisos efectivos verificados, sin aceptar roles desde el navegador. Un owner sin permisos operativos conserva Home, Módulos y Usuarios y accesos. Las rutas de Cosecha y reportes detallados se deniegan, y los enlaces del resumen quedan deshabilitados. `reports.view` se conserva para las consultas del resumen; esta entrega no sustituye el contrato existente de las RPC de reportes ni introduce una autorización de resumen distinta en el servidor.

## Verificación

Pruebas de selección por clic y teclado, arrastre, módulos contratados, ausencia de permisos comerciales, reintento idempotente y bloqueo por URL. Pruebas SQL ejecutadas en PGlite comprueban owners existentes, nuevas empresas y conservación de roles independientes. Revisión visual en 1920, 1440, 1024, 768, 390 y 320 px, sin desbordamiento horizontal, incluido el diálogo y la restauración del foco.

Fixtures: `/tests/visual.html?single&owner-modules&ruta=/modulos` y la variante con `&acquired` para Cosecha contratado.
