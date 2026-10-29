# Historial ficticio para revisar los reportes

Carga solicitada el 29 de octubre de 2026 en «Campaña Arándano 2026»
(`9e030328-bba9-4622-a091-df0bdb4eadf0`), empresa
`e72f3272-105a-4da1-868a-0cc326e2bd4f` del proyecto Quijas-SCC.

Se agregaron 24 cosechadores con dos nombres y dos apellidos, 2 jaberos,
8.668 registros de jabas, 54 sesiones cerradas y 24 lotes de tickets asignados
a una sola persona cada uno. Los códigos de tickets se obtuvieron mediante
`harvest_admin_generar`; cada cantidad de tickets es múltiplo de tres.

Los eventos abarcan del 9 al 29 de octubre: 21 fechas y 18 días de producción.
Se incluyeron domingos sin producción, huecos individuales, incorporaciones
posteriores y perfiles de producción con variaciones y tendencias diferentes.
Los nombres visibles no llevan etiquetas de prueba. Los datos son ficticios,
incluidos sus DNI y fechas; no representan asistencia ni una auditoría real.

La campaña tenía 121 jabas y cuatro cosechadores con producción. Después de la
carga, el reporte autenticado devuelve 8.789 jabas y 28 cosechadores. Totales,
días con registros y promedios coinciden con las series diarias. Se conservaron
la configuración y los hechos originales mediante verificación de huellas
dentro de la transacción. La fecha formal de inicio sigue siendo el 28 de octubre;
las fechas anteriores son historial ficticio admitido ahora para esta revisión.

El script manual es `scripts/datos-campania-arandano-20261029.sql`. No forma parte
de las migraciones ni del arranque. Una repetición se rechaza sin sobrescribir
filas. No se crearon cuentas Auth, usuarios de aplicación, permisos ni integraciones.
No se desactivaron triggers, RLS o restricciones.

Trazabilidad para una eventual retirada autorizada:

- UUID de trabajadores, roles, sesiones y operaciones:
  `a6291029-2026-4000-8xxx-xxxxxxxxxxxx`.
- Trabajadores: clase `8001`, números 1 a 26; DNI `99029101` a `99029126`.
- Generaciones: clase `8004`, números 1 a 24. Sus recibos y las filas de
  `harvest_impresion_lotes` identifican los lotes y tickets generados.
- Asignaciones: operaciones clase `8005`; hechos: clase `8006`;
  operaciones de lectura: clase `8007`.

Los hechos productivos conservan su inmutabilidad. Su limpieza requiere un
procedimiento explícito que verifique dependencias añadidas después de esta carga.
No se debe eliminar la campaña ni ejecutar una limpieza general para retirar estos datos.

Validación local con PGlite, rollback y bloqueo de duplicados:

```powershell
node scripts/verificar-datos-campania-20261029.mjs
```
