# Registro del owner

Pantalla `/registro`, basada en [Register, nodo 166:2221](https://www.figma.com/design/WNGim3Dsoohk4XCWihje7k/Portal---GesGROW?node-id=166-2221).

El owner registra sus credenciales y, al iniciar sesión con el correo confirmado, crea su empresa. La selección de Figma contiene correo, contraseña y confirmación; los datos de empresa se recogen en una pantalla posterior que reutiliza la composición de acceso.

## Implementación

- `portal/src/presentation/Registro.jsx` y `account-access.css`: composición original de 1920 × 1080, adaptación móvil, validación de confirmación, visibilidad independiente de contraseñas y estados de envío, error y confirmación. Login y registro comparten los estilos de acceso.
- `crearPortal.registrar`: serializa operaciones de acceso, valida credenciales y descarta respuestas obsoletas. Los eventos de sesión no interrumpen la confirmación de registro.
- `identity.registrarCuenta`: utiliza `auth.signUp` con correo y contraseña. No acepta empresa, rol ni permisos desde el formulario. La confirmación de correo sigue la configuración existente del servicio.
- Fotografía y logo: los assets descargados de esta selección coinciden por SHA-256 con los existentes en `assets/login`, que se reutilizan sin modificaciones. Google Sans Flex 500, 600 y 700 está almacenada localmente en `assets/register`.

## Alta inicial de empresa

Tras confirmar el correo e iniciar sesión, una cuenta sin empresa ve `CrearEmpresa.jsx`: nombre de empresa y nombre del owner. Al guardar, entra al Home. Puede actualizar su acceso si ya recibió una invitación, o cerrar sesión.

La RPC `iam_crear_empresa_inicial(uuid,text,text)` crea de forma atómica el tenant, la membresía y la asignación de `ADMIN_EMPRESA`. Obtiene al actor de `auth.uid()` y el correo confirmado de `auth.users`; no acepta usuario, tenant destino, rol, permisos ni metadatos de autoridad del navegador. Requiere una cuenta activa sin membresías previas, incluidas las inactivas. Las cuentas creadas por invitación continúan por su flujo de acceso.

El owner recibe exclusivamente `company.manage` y `reports.view`. No se crean suscripciones, entitlements ni delegaciones comerciales. Las compras de módulos y las invitaciones mantienen sus flujos propios.

El recibo privado `identity_altas_empresas` impide duplicar el alta por usuario. El cliente conserva el ID y los datos al reintentar; el servidor devuelve el mismo resultado solo si coinciden actor e intención y continúa autorizado. Un fallo revierte toda la operación. La tabla tiene RLS y acceso directo revocado incluso a `service_role`; solo `authenticated` puede ejecutar la RPC.

Migración: `backend/supabase/migrations/20261022174649_portal_alta_empresa_owner.sql`. Creada con CLI y alineada con la versión registrada al aplicar mediante MCP en **Quijas-SCC** (`mavecfdsrnyfozzukytl`). No se cambiaron las opciones de Auth.

## Verificación

Build de producción; 105 pruebas de aplicación/adaptadores y 241 de presentación. Las 7 pruebas SQL del alta cubren atomicidad, permisos mínimos, idempotencia, reutilización ajena de recibos, correo sin confirmar, invitaciones, revocación y rollback ante errores de provisión. También pasaron 21 pruebas SQL de Cosecha, incluidos trabajadores y reportes.

En Quijas-SCC se probó un alta con una cuenta sintética dentro de `BEGIN … ROLLBACK`, verificando recibo, contexto, rechazo de duplicados y ausencia de acceso a módulos. No quedó ninguna cuenta, empresa o recibo de prueba; las 3 cuentas y la empresa originales se conservaron.

Revisión en navegador a 1920, 1440, 1024, 800, 390 y 320 px: sin desbordamiento horizontal, errores de JavaScript ni acceso operativo concedido al nuevo owner. Fixtures `/tests/visual.html?registro` y `/tests/visual.html?alta-empresa`, con proveedores simulados. El código del portal está actualizado localmente y compilado; esta entrega no publica el frontend en un hosting externo.
