# Demo completa de Quijas

Datos ficticios para `quijas@gmail.com`, con membresía activa en Quijas/SCC,
empresa `00000000-0000-4000-8000-000000000001`. Son scripts manuales de datos;
no forman parte del arranque, el build ni las migraciones de la aplicación.

## Cargar en Supabase

1. Abrir **SQL Editor** en el proyecto Quijas-SCC.
2. Copiar **todo** `seed-quijas.sql` y ejecutarlo como `postgres`.
3. Esperar el resultado sin errores, con tres campañas `DEMO-Q-*`.
4. Recargar el Portal con `quijas@gmail.com`. En el selector de campaña de
   Inicio elegir **[DEMO] Arándanos · campaña actual**. La selección anterior
   puede seguir apuntando a una campaña real que no tiene estos datos.

No se ejecutó la carga remota desde Codex: la automatización del navegador no
pudo verificar la URL del SQL Editor. El script se validó localmente con
PostgreSQL embebido y las migraciones del repositorio. El esquema base de la
base remota puede tener diferencias no versionadas: un error revierte toda la
carga. Si SQL Editor mantiene una transacción fallida, ejecutar `rollback;`
antes de reintentar y compartir el error exacto para corregirlo.

## Contenido

| Datos | Cantidad / estados |
| --- | --- |
| Campañas | 3: arándanos actual, arándanos histórica cerrada y mandarina actual |
| Cultivos | 2 exclusivos DEMO, sin competir con las campañas reales activas |
| Variedades | 4: Ventura, Biloxi, W. Murcott y Tango, todas marcadas DEMO |
| Trabajadores | 26: 20 cosechadores activos, 2 jaberos, 2 supervisoras y 2 cosechadores inactivos |
| Operador de sesiones | 1 registro interno `usuarios_app` vinculado a la supervisora DEMO Teresa Medina |
| Participaciones | 78, incluidas las inactivas de la campaña cerrada |
| Estructura | 2 fundos, 4 sectores, 8 parcelas (una inactiva) |
| Lotes operativos | 12, con dos variedades por lote y vínculo a parcela |
| Sesiones | 264, con sesiones cerradas y dos activas por campaña actual |
| Lotes de tickets | 50, asignados y disponibles, con consumo parcial o sin consumo |
| Tickets | 10.611, con estados disponible y utilizado |
| Registros de cosecha | 10.011 con sesión, trabajador, ticket, operación y versión de producción |

Los eventos se distribuyen durante los últimos **40 días** en arándanos actual,
**14 días** en mandarina actual y **12 días entre hace 90 y 79 días** en la
histórica. Las fechas se calculan al ejecutar según `America/Lima`; ningún
evento se sitúa en el futuro. Los tickets y recibos también conservan relaciones
e identidades consistentes. Son hechos sintéticos insertados con SQL de
mantenimiento; las fechas de admisión y fronteras se crean ahora y no pretenden
ser una auditoría histórica real.

Permite explorar Home, KPIs, gráficos, actividad, ranking y comparación de hasta
cinco trabajadores, periodos Hoy/Semana/Mes/Campaña, producción diaria, producción
por lote y variedad, CSV, campañas cerradas, personal, participaciones, tickets,
asignaciones y registros. Los recibos respetan la forma de los contratos
existentes; no se crean endpoints ni se alteran reglas para la demo.

Los trabajadores llevan `[DEMO]` en el nombre y DNI de prueba `99015001` a
`99015026`. No se crean cuentas Auth, invitaciones, correos enviados, permisos
Identity ni delegaciones. Empresa, usuarios Identity, roles y suscripción muestran su configuración
existente. El clima sigue mostrando su estado real de fuente no configurada.

El trigger remoto `validar_sesion_lectura()` exige un `usuarios_app` activo en
`iniciada_por_usuario_id`, junto con campaña, lote y rol JABERO activos. Las
sesiones usan el operador interno DEMO; su `identity_usuario_id` queda nulo para
respetar la exclusión entre ambos tipos de identidad. Las operaciones conservan
la atribución Identity de la cuenta del Portal. La limpieza incluye al operador.

Para cargar las sesiones históricas se cierra temporalmente la campaña actual
DEMO de arándanos, se activa la histórica y sus jaberos, se insertan sus sesiones
cerradas y se restauran los estados finales. Después se insertan las sesiones
actuales. Todo ocurre dentro de una transacción, sin tocar campañas reales ni
desactivar el trigger remoto. La histórica acaba cerrada y con participaciones
inactivas; la actual acaba activa.

Los módulos CAMPAIGN, WORKFORCE y HARVEST deben estar vigentes y la cuenta debe
tener los permisos administrativos existentes; si no, la carga se detiene con
un mensaje. **No cambia contratación, planes ni suscripciones.** Si la columna
`estructura_habilitada` del resultado es `false`, los datos físicos están
cargados pero el menú de Estructura sigue dependiendo de habilitar
FARM_STRUCTURE por el flujo comercial existente. No se fuerza esa habilitación.

## Borrar la demo después

Ejecutar **por separado**, como `postgres`, todo `cleanup-quijas.sql`.

Solo considera filas del namespace `de001015-2026-4000-8xxx-*` y los códigos
`DEMO-Q-*` de esta empresa. Obtiene sus claves primarias y verifica las FK antes
de borrar. Si desde el Portal se añadieron filas nuevas que dependen de la demo,
se detiene para revisarlas; no borra esas dependencias automáticamente.

La inmutabilidad normal impide borrar producción y estructura desde la API. El
script de mantenimiento bloquea las tablas de datos durante la transacción,
suspende siete triggers concretos de inmutabilidad, borra el manifiesto en orden
y restaura los triggers antes de confirmar. Mantiene activas las FK; no usa
`CASCADE`, `TRUNCATE`, `session_replication_role` ni desactiva RLS. Ante cualquier
error, también se revierte el cambio temporal de triggers.

No ejecutar la limpieza junto a la carga. La carga rechaza duplicados y no
sobrescribe filas. Después de limpiar se puede volver a cargar con fechas nuevas.
La limpieza se puede repetir sin afectar datos originales.

## Verificación local

Desde `scc/backend/`:

```powershell
node scripts/demo/verify-quijas.mjs
```

La verificación no usa la red ni credenciales. Aplica el esquema versionado en
PGlite, reproduce el enum `estado_sesion` de Supabase (la fixture base usa texto)
y la función de trigger aportada por el usuario en
`fixtures/validar-sesion-lectura.sql` (solo para pruebas locales). Comprueba el
rechazo y rollback del `CASE` sin cast, del operador ausente, de la campaña
cerrada y del jabero inactivo; también verifica los estados finales y que todas
las sesiones referencien al operador DEMO. Comprueba los reportes con el rol
`authenticated`, los cuatro periodos,
las fechas, la no duplicación y el rollback. Prueba una dependencia externa con
FK `ON DELETE CASCADE`: la limpieza debe rechazarla. Comprueba la igualdad exacta
de todas las filas originales después de limpiar, los triggers restaurados y
la repetición del ciclo carga/limpieza.
