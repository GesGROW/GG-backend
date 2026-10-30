# Activación de cuenta por invitación

Pantalla `/aceptar-invitacion`, basada en [Figma, nodo 116:377](https://www.figma.com/design/WNGim3Dsoohk4XCWihje7k/Portal---GesGROW?node-id=116-377).

La empresa, los roles y los módulos del mensaje proceden de la invitación del receptor verificado. Los nombres de Figma son datos de ejemplo: la interfaz muestra los roles del catálogo vigente y los módulos contratados a los que esos roles dan acceso.

## Recorridos

- Cuenta nueva: el correo de invitación verifica la identidad; la pantalla pide DNI, contraseña y confirmación. Tras activarla se revalida la membresía y se abre la empresa invitante.
- Cuenta existente: el backend primero vincula la cuenta y después solicita un correo de acceso con `shouldCreateUser: false`. Al abrirlo, el receptor entra a la empresa invitante sin cambiar su contraseña, aunque tenga otras membresías.
- Enlace vencido, incompleto o ajeno: no se muestra un formulario de contraseña y se ofrece reintentar o ir al login.
- Recarga: la URL conserva únicamente el identificador de invitación, sin tokens. Una sesión invitada verificada puede recuperar sus datos. El servidor distingue la activación explícita de una sesión abierta mediante el enlace.

## Corrección del 23 de octubre de 2026: DNI y activación explícita

Las cuentas nuevas invitadas deben registrar un DNI de ocho dígitos, contraseña y
confirmación. La presencia de `auth.users.encrypted_password` ya no decide si se
ha completado el formulario: una cuenta invitada puede tener un hash interno sin
que el destinatario haya elegido sus credenciales. Se guarda una confirmación
explícita en `identity_usuarios.activacion_completada_en`, junto con el DNI.

Una invitación de tipo `ACCESO` para un correo que ya tenía cuenta conserva su
contraseña y no exige otra activación ni un nuevo DNI. La aceptación continúa
verificándose como receptor autenticado. Las invitaciones `ACTIVACION` incompletas
se recuperan al restaurar sesión o iniciar sesión, incluso desde Home y aunque
el enlace ya se haya consumido. Esto también corrige las cuentas que entraron
antes al Home sin completar el alta.

`iam_completar_activacion_cuenta` valida al receptor, registra el DNI y confirma
la aceptación en una transacción idempotente. El cliente establece la contraseña
con Auth antes de llamar al RPC; no transmite contraseñas a SQL ni las conserva
en el estado de la aplicación. Un error después de actualizar la contraseña
permite reintentar la confirmación sin volver a cambiarla.

Para un supervisor autorizado, la aceptación vincula su membresía con el
trabajador del mismo DNI y empresa, creando el trabajador y su acceso PWA si no
existían. Rechaza un trabajador inactivo, acceso PWA desactivado, vínculo con otra
cuenta o DNI duplicado; no reactiva silenciosamente registros administrativos.
No crea roles laborales ni concede acceso general a campañas.

El contrato `validar_operador_campanias` del PWA conserva el ingreso por DNI.
Para supervisores vinculados consulta cuenta, membresía, permisos, módulo y
participación del cultivo, y devuelve únicamente sus campañas activas propias o
aprobadas. La autorización se comprueba también en cada operación online.
Las funciones legacy originales se conservan en helpers privados, incluyendo sus
filtros de empresa, contexto transaccional y prohibición de mezclar el acceso por
cuenta con el operativo por DNI. El contrato offline de vigencia diaria se conserva.

Migraciones aplicadas en Quijas-SCC y alineadas con su historial remoto:
`20261023232743_portal_activacion_dni.sql`,
`20261023232746_portal_supervisor_dni_pwa.sql` y
`20261023233717_portal_validacion_operador_dni.sql`.

Verificación: pruebas SQL de activación, DNI, permisos, rollback, idempotencia,
cuenta existente, ingreso PWA, registro de jabero e inicio de lectura,
aprobación de otro cultivo, revocación y acceso
legacy; pruebas de adaptadores y formularios; revisión de acceso en escritorio y
móvil. Se verificó también la cuenta invitada real mediante una transacción
revertida: recuperó el alta pendiente y el PWA devolvió Arándano Campaña 2026.
No se guardó un DNI de prueba, no se cambió la contraseña real y no se enviaron
correos. El destinatario debe recargar el Portal actualizado y completar el alta.

Los tokens quedan dentro del adapter de infraestructura. La consulta del receptor verifica identidad, membresía activa y empresa activa; un identificador en la URL no concede acceso. La sesión se contrasta de nuevo antes de modificar la contraseña.

## Archivos y despliegue

- `portal/src/presentation/ActivacionCuenta.jsx` comparte `account-access.css`, fotografía, logo y tipografía con Login y Registro. Añade el peso 400 local para el texto introductorio.
- `portal/src/infrastructure/supabase/invitacionAdapter.js` procesa los enlaces estándar por fragmento y las plantillas por token hash de invitación o acceso.
- Aplicar `backend/supabase/migrations/202610211000_portal_activacion_cuenta.sql` después de las migraciones vigentes. Añade una consulta autorizada del receptor y el seguimiento de la entrega de correos.
- La actualización de Usuarios y accesos añade `202610211200_usuarios_accesos_modulo.sql`, después de la separación de permisos del owner. El adapter confirma la aceptación con `iam_aceptar_invitacion` después de definir contraseña o al entrar con una cuenta existente. El estado verde del listado depende de esta confirmación, no del envío del correo.
- Volver a desplegar `backend/supabase/functions/invitar-usuario`. Se mantiene `PORTAL_ORIGIN` como origen fijo; el backend añade `?invitacion=<uuid>` al destino.
- En Auth, permitir ese destino con su parámetro de invitación y configurar SMTP. Las plantillas de invitación y acceso deben incluir el enlace de confirmación del proveedor (`{{ .ConfirmationURL }}`). Una plantilla personalizada debe conservar el identificador de invitación y el tipo de verificación correspondiente.

Si el envío de acceso falla tras crear la membresía, el mismo identificador permite reintentarlo sin recrear la cuenta. Una entrega confirmada no se repite en reintentos secuenciales. Un fallo de red después de enviar pero antes de registrar la entrega puede ocasionar un segundo correo al reintentar.

## Estado remoto: Quijas-SCC, 22 de octubre de 2026

Las migraciones de invitaciones y aceptación están instaladas. Se detectó que la
función `invitar-usuario` no estaba desplegada: los intentos del navegador fallaban
en el preflight con HTTP 404, antes de crear una intención o enviar correo.

Se desplegó la función (versión 1, estado ACTIVE), incluyendo sus dependencias del
contexto Identity. Mantiene `verify_jwt=false` porque valida explícitamente el JWT
con `auth.getUser(jwt)` antes de cualquier llamada de aprovisionamiento; SQL valida
de nuevo los permisos de empresa. Se conserva el acceso privilegiado únicamente
en el runtime del servidor.

En ese despliegue inicial se utilizó localhost como destino. La actualización
del 29 de octubre siguiente reemplaza ese destino por el portal publicado.

Verificación remota sin envíos: preflight permitido 204, origen ajeno 403, petición
sin sesión 401 y JWT inválido 401. Continuaban 1 cuenta y 0 invitaciones después
de las pruebas. Pasaron 20 pruebas locales de aprovisionamiento y SQL de accesos.
No se envió ni reintentó automáticamente ningún correo real; el usuario puede
retomar la solicitud desde el botón «Reintentar envío» del portal.

## Corrección del 29 de octubre de 2026: dominio publicado y carga del owner

Los preflight del portal publicado devolvían 403 porque sólo se admitía el
origen local. La función `invitar-usuario`, versión 2, admite exactamente
`https://gg-portal-beige.vercel.app` y `http://localhost:5174`, conservando la
validación de sesión y permisos. Se verificaron 204 en ambos orígenes, 403 para
un dominio ajeno y 401 sin sesión. No se enviaron correos de prueba.

`PORTAL_ORIGIN` continúa siendo la configuración preferida del servidor. Para
Quijas-SCC, `deployment.json` ahora fija el destino de correo en
`https://gg-portal-beige.vercel.app/aceptar-invitacion?invitacion=<uuid>`.
La lista CORS de desarrollo no cambia ese destino. Otro proyecto sin
configuración falla; nunca se utiliza el Origin de la petición para crear enlaces.

Se comprobó por separado que Auth todavía tenía como URL base
`http://localhost:3000` y descartaba el destino publicado, incluso con el
parámetro de invitación. La configuración corregida en
[URL Configuration](https://supabase.com/dashboard/project/mavecfdsrnyfozzukytl/auth/url-configuration) es:

- Site URL: `https://gg-portal-beige.vercel.app`.
- Redirect URLs: permitir `https://gg-portal-beige.vercel.app/**`, conservando las
  demás URLs necesarias de la aplicación.
- Las plantillas de invitación y acceso deben conservar `{{ .ConfirmationURL }}`.

Comprobar después con `node scripts/verificar-redireccion-invitaciones.mjs`.
Usa un token ficticio, no sigue redirecciones, no consume enlaces de personas y
no envía correos. Comprueba destino por defecto, activación, acceso y rechazo
de un dominio ajeno. Los correos anteriores pueden conservar su destino
anterior; el cambio no reescribe mensajes entregados.

En el portal, Módulos y Usuarios y accesos usan skeletons con los mismos
contenedores, columnas y puntos de adaptación que el contenido. El contenido
listo aparece en 160 ms y los bloques conservan el barrido compartido, respetando
movimiento reducido. Las filas compactas mantienen altura y permiten consultar
nombre, correo y rol completos mediante su atributo title.
Se compararon dimensiones antes y después de cargar en 1920, 1440, 1024,
768, 390 y 320 px, con una cuenta y con listado vacío, sin desplazamientos
de los contenedores ni desbordamiento de la página. Pasaron 156 pruebas de
aplicación, 318 de presentación y la compilación de producción del portal;
10 pruebas de aprovisionamiento y la verificación del core en backend.

El 30 de octubre se verificaron las cuatro redirecciones remotas correctamente
hacia el portal publicado. Se corrigió además el 404 de Vercel al abrir
directamente `/aceptar-invitacion`: `portal/vercel.json` reescribe las rutas de
la SPA hacia `index.html`. Activación con parámetro de invitación, Usuarios,
Módulos y Login devolvieron 200; el JavaScript continuó sirviéndose como recurso
estático. No se consumió ningún enlace real ni se enviaron correos de prueba.
Los skeletons del owner se publicaron en `9edc41e` y la corrección de rutas en
`4d73186`. La revisión final reservó dos filas en Usuarios y verificó las
dimensiones en los seis anchos indicados, con 23 pruebas dirigidas aprobadas.

## Verificación

### Límite de correo, 30 de octubre de 2026

Los intentos de las 09:14–09:18 (Lima) devolvieron en Auth
`429: email rate limit exceeded`. La solicitud afectada continuó PENDIENTE,
sin fecha de entrega. No fue un fallo de rutas ni una entrega confirmada.
La versión 3 de `invitar-usuario` devuelve HTTP 429 con el código seguro
`EMAIL_RATE_LIMIT`, y el adaptador del Portal muestra un mensaje específico
para esperar y reintentar la misma invitación. No expone el texto interno del
proveedor ni reintenta automáticamente.

La cuota se administra en Auth y en el proveedor SMTP. La corrección del mensaje
no cambia esa cuota ni configura un proveedor. Ver
[límites de Auth](https://supabase.com/docs/guides/auth/rate-limits) y
[configuración SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
Pasaron 11 pruebas de aprovisionamiento, 16 de adaptadores/administración,
12 del formulario de accesos y la compilación del Portal. No se enviaron correos
reales ni se modificaron invitaciones durante las comprobaciones.

Pruebas de PostgreSQL embebido con ACL y pertenencia entre empresas, aprovisionamiento y reintentos, adapters de enlaces y sesiones, activación en React, login y registro. Revisión en navegador a 1920, 1440, 1024, 390 y 320 px.

Fixtures sin backend: `/tests/visual.html?activacion`, `?activacion&cuenta-existente` y `?activacion&enlace-invalido`.
