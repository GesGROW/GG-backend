# Usuarios y accesos por módulo

La pantalla `/configuracion/usuarios` reproduce los tres PNG facilitados por el usuario, con referencia de escritorio 1920 × 1080. Por ahora publica únicamente Cosecha: cabecera con gradiente, tabla y la acción «Invita a participar a un usuario». El vacío utiliza las columnas Nombre, Correo y Activo del primer PNG; con participantes muestra Nombre, Correo, Rol y Estado.

La invitación abre `/configuracion/invitaciones` conservando el listado montado, con un diálogo a la derecha y el fondo desenfocado. Pide nombre y correo obligatorios y ofrece exclusivamente Supervisor. Escape, el botón de cierre y el fondo permiten cancelar cuando no se está enviando. Se conserva el foco dentro del diálogo y se devuelve a la acción de invitar al cerrarlo.

## Envío y aceptación

- El formulario llama al flujo de invitación existente de backend; no crea usuarios ni envía correo directamente desde React.
- Application obtiene el identificador del rol Supervisor de la empresa verificada. Ignora empresa, roles y trabajador que pudieran venir del formulario. Comprueba Cosecha contratado y descarta el envío si cambia la empresa durante la consulta del rol.
- El envío conserva UUID y parámetros ante un fallo incierto. Los campos quedan de solo lectura para reintentar la misma solicitud. La invitación enviada vuelve al listado como Pendiente, con fondo amarillo.
- `COMPLETADA` sigue indicando aprovisionamiento de identidad y membresía; no significa aceptación del destinatario. `aceptada_en` registra el paso independiente de aceptación.
- Para una cuenta nueva, la aceptación se confirma después de guardar la contraseña. Para una cuenta existente, se confirma al abrir el enlace con su identidad autenticada, antes de entrar a la plataforma. Un fallo de confirmación puede reintentarse sin volver a cambiar la contraseña.
- Una cuenta ya miembro de la empresa incorpora Supervisor al aceptar, conservando sus demás roles. El owner no puede aceptar por otra persona.
- El listado consulta al recuperar el foco y cada 30 segundos mientras la pestaña está visible. Una aceptación confirmada aparece en verde; la interfaz no deduce la aceptación del mero envío del correo. La consulta de fondo conserva la tabla visible.

Los miembros anteriores con roles operativos siguen apareciendo con su rol real; no se reasignan como Supervisor. Una membresía activa previa sin registro de invitación aparece como Aceptada. Las invitaciones históricas sin evidencia de aceptación no se marcan automáticamente como aceptadas.

## Servidor y despliegue

`backend/supabase/migrations/202610211200_usuarios_accesos_modulo.sql`, posterior a las migraciones de activación y separación del owner:

- Añade `SUPERVISOR_COSECHA` con `harvest.view`, `harvest.manage`, `harvest.operate` y `reports.view`, sin `company.manage`.
- Actualiza la siembra de roles para nuevas empresas y mantiene los roles existentes.
- Añade `iam_admin_accesos_cosecha`, limitado al owner autorizado de la empresa, con participantes, invitaciones pendientes y el rol de invitación.
- Añade `iam_aceptar_invitacion`, limitado al receptor autenticado. Comprueba la cuenta, empresa, membresía y activación; para Supervisor revalida rol, contratación y autorización del invitante. No concede al owner la aceptación de otra cuenta.

La migración está preparada y probada en PostgreSQL embebido PGlite; no se ha aplicado a Supabase remoto. La entrega exige desplegarla junto con el frontend actualizado. Continúan siendo necesarias la función `invitar-usuario` y la configuración de correo descritas en `portal-activacion-cuenta.md`; esta entrega reutiliza ese envío sin cambiar su contrato.

## Verificación

Pruebas de formulario, rol único, envío pendiente, actualización de aceptación, foco y teclado, errores, reintentos idempotentes, ausencia de contratación, permisos y cambio de empresa. Pruebas SQL con destinatarios nuevos y existentes, cuenta ajena, roles de otra empresa, ACL, aceptación repetida y conservación de roles de un miembro existente. Pruebas de adapters para confirmación fallida tras guardar contraseña y para entrada de cuentas existentes.

Revisión visual de vacío, diálogo, pendiente y aceptada en 1920, 1440, 1024, 768, 390 y 320 px. En pantallas pequeñas la tabla se desplaza dentro de su contenedor y el diálogo permite desplazamiento vertical.

Fixtures sin correo real: `/tests/visual.html?single&owner-users&ruta=/configuracion/usuarios`, variantes `&pending`, `&accepted`, y `ruta=/configuracion/invitaciones` para el formulario.
