# Reportes del PDA por recipiente

El contrato `harvest_reportes_pda` agrega resumen, ranking, producción diaria y
producción por lote sin alterar los RPC históricos que cuentan solo jabas.
`total_paquetes` suma jabas y jarras; `total_jabas` y `total_jarras` conservan su
significado. El ranking se ordena por paquetes y mantiene puestos empatados,
días con registros y promedio diario de paquetes. Las fechas usan America/Lima.

El peso se suma desde los hechos reportables y sus correcciones auditadas:
sin lecturas devuelve 0; si falta el peso de alguna lectura devuelve null,
presentado como N/A. No se convierte peso desconocido en cero.

El acceso reutiliza `obtener_resumen_campania_campania`, incluida la validación
de empresa, campaña, operador, dispositivo y módulo. El PDA opera con las
credenciales del dispositivo en cabeceras, separado de la sesión de cuenta;
la segunda migración conserva ese transporte. El endpoint público es invoker
y la implementación privilegiada permanece en el esquema privado.

Verificación remota con un dispositivo temporal dentro de una transacción
revertida: Santa Lucía devuelve 382 paquetes, 188 jabas, 194 jarras y 703.4 kg
en resumen; ranking, días y lotes conservan esos totales. Hoy no tiene lecturas
y devuelve ranking vacío. Se comprobó el rechazo de solicitudes sin credencial
y de un dispositivo de otra empresa. No se modificaron hechos de cosecha.

Pruebas locales cubren la migración SQL, aislamiento de campaña, ambos
recipientes, compatibilidad del corte de producción, normalización de cosecha
solo con jarras, peso desconocido y campaña vacía. La tabla móvil usa el estilo
compartido del portal y desplaza sus columnas sin ensanchar la página.
