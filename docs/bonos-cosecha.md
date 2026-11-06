# Bono diario por jabas adicionales

En Cosecha → Configurar campaña actual → Configuración → Bono se habilita el bono y se define el umbral
diario y el monto en soles por cada jaba adicional. Empieza deshabilitado. No
incluye sueldo habitual, liquidación ni estados de pago.

La regla se aplica a todos los cosechadores de la campaña. Cada día en
America/Lima se suman las jabas válidas de todos sus lotes y sesiones:
`máximo(0, jabas del día − umbral) × monto`. Por ejemplo, 32 jabas, umbral 30
y S/ 2 por adicional generan S/ 4. El total del período suma los bonos diarios.

El servidor bloquea la edición después de cualquier sesión iniciada ese día,
aunque haya cerrado o no tenga lecturas. Una sesión todavía activa de un día
anterior también impide cambiar la regla. El bloqueo corresponde a la campaña;
no afecta la edición del nombre, lotes o variedades.

La apertura en el PDA necesita conexión: sincroniza dependencias y confirma la
sesión remotamente antes de habilitarla localmente. Las lecturas y cierres
conservan su cola sin conexión. La repetición de la apertura utiliza el UUID de
la misma sesión, compatible con la idempotencia existente del servidor.

Cada modificación guarda fecha de Perú, valores, usuario y hora del servidor.
Las reglas se conservan en `harvest_bonos_privado.reglas`, sin acceso directo
del cliente. No hay fecha de vigencia editable ni modificación retroactiva.
Si se cambia varias veces antes de la primera sesión, se usa la última regla
del día. Antes de la primera regla no existe bono. Las correcciones y lecturas
sincronizadas posteriormente se calculan con la regla del día de producción.

Cosecha → Reportes → Bonos muestra el total, el resumen por persona y el detalle
diario con umbral y monto aplicados. Permite filtrar por período y persona.
La pantalla no muestra la barra de actualización/exportación ni el texto
explicativo introductorio. La capacidad de exportación autorizada se conserva
en la capa de aplicación, sin botón en esta vista.
Las dos tablas usan la paginación común del portal, con diez filas por página
y controles independientes. La subopción Bonos utiliza el icono de alcancía.

Sobre la tabla de detalle hay un gráfico de barras para un único día, inicialmente
el último del período consultado. El selector de día está limitado a ese período.
Compara cosechadores en X y jabas en Y, usando las filas y reglas históricas ya
devueltas por el servidor, sin consultas adicionales al cambiar de día. La base
de la barra es verde rayada y las jabas adicionales son doradas; una línea
discontinua indica el umbral. Al señalar, enfocar o seleccionar una barra se
muestran nombre, DNI, jabas y bono. En móvil permite desplazamiento horizontal.
Sin bono vigente no dibuja umbral ni excedentes; sin lecturas muestra un estado
vacío. Los totales y la tabla conservan el período seleccionado, independientemente
del día del gráfico. El gráfico no calcula bonos semanales ni mensuales.

El acceso «Configurar campaña actual» conserva la campaña seleccionada y agrupa
Agregar (Nueva campaña / Nuevo cultivo) y Configuración (Configuración general
de la campaña / Bono). La tuerca ya no forma parte de las opciones operativas
de Cosecha. Los enlaces antiguos a `/cosecha/ajustes` redirigen al nuevo lugar.

## Base de datos y despliegue

La migración `backend/supabase/migrations/20261106154420_harvest_bonos_diarios.sql`
crea el historial privado, las RPC de configuración/guardado/reporte y un trigger
de apertura. La apertura y el cambio de regla toman el mismo bloqueo transaccional
por campaña, cubriendo las rutas existentes legacy, IAM y PDA.
La migración `20261106160001_harvest_bonos_api_privada.sql` mantiene las
implementaciones privilegiadas en el esquema privado, con fachadas públicas
`SECURITY INVOKER` e índices para las referencias de campaña y usuario.

Configuración exige `harvest.manage`, HARVEST y participación en el cultivo;
el reporte conserva los permisos y el aislamiento de los reportes de cosecha.
Los endpoints nuevos no conceden ejecución a `anon` ni `service_role`.

Se aplicaron en Quijas-SCC las migraciones `harvest_configuracion_campania`
(pendiente de la pantalla existente), `harvest_bonos_diarios` y
`harvest_bonos_api_privada`. Se verificaron
las RPC en la base real mediante lectura autorizada, el trigger, RLS y ACL.
No se habilitó ninguna regla real. La publicación del portal y del PDA es
independiente de la migración. Antes de habilitar bonos, los equipos deben usar
la versión con apertura en línea y sincronizar sus operaciones pendientes.

## Verificación

- SQL: `node --test tests/harvest-bonos-diarios-sql.test.js` en backend. Incluye
  suma entre lotes, límites diarios Lima, conservación de reglas, trabajador
  inactivo, bloqueo sin lecturas y tras cierre, permisos y aislamiento.
- Portal: pruebas `bonos.test.js` y `bonos.test.jsx`, junto con las pruebas de
  configuración de campaña y reportes.
- PDA: `apertura-sesion-en-linea.test.js`; suite completa de 614 pruebas aprobada.
- Compilación de portal y PDA, y revisión visual del portal a 1440, 390 y 320 px.
- La suite de aplicación del portal conserva un fallo ajeno a este cambio:
  `HomeSummaryParts.jsx` importa directamente un contexto de core, prohibido
  por la prueba de arquitectura vigente.
