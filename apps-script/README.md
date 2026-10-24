# Apps Script — legacy en retirada progresiva

**Portal Web es la interfaz administrativa actual.**
**No desarrollar nuevas funcionalidades en Apps Script.**

Estos archivos se conservan para compatibilidad de campañas aún no migradas,
consulta temporal e histórico. No están retirados globalmente: no se ha asumido
que todas las campañas remotas hayan completado su corte. La comparación de
ranking con el período anterior aún tiene paridad parcial en Portal y permanece
disponible aquí como consulta. No se debe borrar esta carpeta.

La escritura administrativa depende del cutover persistido en backend, no de la
versión del script ni de que se roten las credenciales. Tras migrar una campaña,
sus sincronizaciones de maestros reciben un rechazo; las celdas, IDs, errores y
pendientes se conservan. No reintentar desde otra campaña para modificar personal
o variedades compartidos protegidos: administrarlos desde Portal.

Los archivos existentes deben conservarse como histórico temporal. No vaciar
hojas, eliminar archivos de Drive ni sobrescribir filas PENDIENTE/ERROR durante
el corte. Revisarlas y conciliarlas antes de confirmarlo en Portal. Conservar
consultas que todavía no tengan equivalente completo y retirar los disparadores
de sincronización personalizados, si existen, sólo después de inventariarlos.
El repositorio contiene `onOpen`/`onEdit` y sincronización manual; no inventaría
triggers instalados o copias que pudieran existir fuera del repositorio.

La deprecación total queda condicionada a inventariar y migrar todas las campañas,
resolver o archivar explícitamente las consultas pendientes y comprobar que no
quedan jobs/cuentas operativos dependientes de Apps Script. Hasta entonces el
estado es **legacy de compatibilidad en transición**, no eliminación.

Consulte la [matriz de paridad y el procedimiento F7.7](../docs/portal-cutover-administrativo-f7.7.md).
