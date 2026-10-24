# Trabajadores de Cosecha

## Listados dentro de la campaña (supervisor)

La opción Trabajadores del contenedor de Cosecha abre tres pestañas de consulta:
`/cosecha/cosechadores`, `/cosecha/jaberos` y `/cosecha/supervisores`.
Conservan `?campania=…` al navegar y cambiar la campaña mantiene la pestaña elegida.
Reutilizan `DataTable` y el estilo común de Usuarios y accesos, con los SVG
compuestos indicados: usuario de 24 px y símbolo de función de 15 px, negros,
trazo 2 en ambos. En móvil, la tabla admite desplazamiento horizontal.

Estos listados muestran DNI, nombre, estado y fecha/hora de inicio, paginados
en servidor de 50 en 50. Requieren `harvest.view` o `harvest.manage`, HARVEST
habilitado y autorización de participación en el cultivo de la campaña.
No necesitan WORKFORCE ni conceden edición del maestro.

Los cosechadores y jaberos proceden de `trabajador_campania_rol` de esa campaña
(COSECHADOR y JABERO). Supervisores incluye tanto a los participantes del cultivo
de la campaña como a los trabajadores con rol operativo SUPERVISORA. Si una cuenta
tiene un trabajador vinculado con ese rol, aparece una sola fila del participante.
El DNI procede exclusivamente del trabajador vinculado; sin vínculo muestra «—».
El inicio de un participante es el más reciente entre su incorporación al cultivo y
la creación de la campaña. Su estado exige usuario, membresía y permiso de gestión
de Cosecha activos. Los operativos conservan su estado e inicio originales.
Se incluyen participaciones inactivas. Listar una cuenta no crea un trabajador ni
concede roles o autorización de jornada diaria.

La ampliación está en `20261022230330_harvest_supervisores_participantes.sql` y
conserva permisos, aislamiento de empresa/cultivo y paginación del RPC existente.
Aplicada en Quijas-SCC el 22/10/2026. La verificación con rol `authenticated`
devuelve a Deysi Regalado como participante activa de Arándano Campaña 2026,
con DNI nulo por no tener trabajador vinculado.

Aplicar `202610221200_harvest_trabajadores_campania.sql` después de
`202610221000_harvest_cultivos_supervisores.sql` (y mantener el orden general de
migraciones). Añade el RPC `harvest_admin_trabajadores` y `iniciado_en` a la
participación. Las altas futuras reciben fecha del servidor; las históricas
permanecen en NULL y muestran «Sin fecha registrada». Una reactivación conserva
el inicio original. Fechas presentadas en America/Lima. No se aplica remotamente
desde esta entrega.

Fixture: `/tests/visual.html?single&campaign&campaign-workers&ruta=/cosecha/cosechadores`.

## Administración del maestro (Personal)

La ruta `/cosecha/trabajadores` administra el maestro Workforce existente y su
participación en campañas. Está disponible con `workforce.manage` y los módulos
`HARVEST` y `WORKFORCE`. Un gestor de personal puede entrar por Cosecha sin obtener
acceso a registros, tickets ni cuentas de usuario.

## Uso

- Buscar por nombre o DNI; combinar campaña, función, estado y datos completos.
- Consultar una fila por persona, con resumen de sus campañas y última actividad.
- Registrar y completar nombres, apellidos y DNI, conservando UUID e historial.
- Activar o desactivar; las participaciones históricas se conservan.
- Asignar o retirar COSECHADOR y SUPERVISORA por campaña activa.
- Habilitar JABERO para hoy o retirar su habilitación mediante el caso de jornada
  existente, sin convertirlo en una función permanente.

El panel lateral permite editar datos y administrar varias participaciones.
Estado activo y datos completos son dimensiones independientes. Los provisionales
confirmados por el PDA aparecen con sus datos reales vacíos y la etiqueta visual
«Datos pendientes»; el portal no accede a provisionales aún sin sincronizar.

La actividad corresponde a cosechas reportables y operaciones de sesiones de
campo (inicio, cierre y lecturas), atribuidas al cosechador, jabero u operador.
Si se filtra una campaña, sus fechas corresponden a esa campaña. Una edición del
maestro no cuenta como actividad. Sin eventos se muestra «Sin actividad».
Los indicadores y el total corresponden a todos los resultados filtrados; la
página muestra hasta 50 trabajadores. La búsqueda ignora mayúsculas y tildes.

Los accesos a GesGROW siguen administrándose en Configuración. Reportes conserva
su bloqueo actual; no se publica un enlace a un destino deshabilitado.

## Base de datos y despliegue

Aplicar `backend/supabase/migrations/202610191000_portal_trabajadores_cosecha.sql`
después de las migraciones actuales (incluida F7.7). Añade una vista privada de
actividad y el RPC paginado `workforce_cosecha_listar`. No crea otro maestro ni
modifica el flujo de alta provisional, las operaciones de campo o sus tablas.
La migración es transaccional, repetible y recarga el esquema de PostgREST.
Las ediciones y participaciones reutilizan los RPC administrativos existentes.

Esta entrega prepara y prueba la migración localmente; no la aplica a un proyecto
remoto automáticamente.

## Validación

- `cd portal; npm.cmd run test:application`
- `cd portal; npx.cmd vitest run --maxWorkers=2`
- `cd portal; npm.cmd run build`
- `cd backend; npm.cmd test`

La fixture `/tests/visual.html?single&ruta=/cosecha/trabajadores` permite revisar
los temas claro/oscuro, el listado y el panel con datos ficticios, sin backend.
