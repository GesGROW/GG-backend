# Limpieza de Quijas-SCC ejecutada

22 de octubre de 2026. Proyecto verificado mediante MCP: **Quijas-SCC**, ref **mavecfdsrnyfozzukytl**.
Ejecución autorizada por el usuario después de completar los pendientes de trabajadores y alta inicial del owner.

Se vaciaron las **45 tablas de datos de aplicación** (41476 filas), incluidos empresa,
identidad, membresías, roles por empresa, cultivos, campañas, trabajadores, tickets,
producción, operaciones PDA, estructura agrícola, integración y auditoría comercial.
Se eliminaron las **3 cuentas Auth**, sus identidades, sesiones, tokens y datos de
autenticación asociados. Se verificaron las 18 tablas Auth de datos de usuario vacías.
Storage ya estaba vacío; no se modificó mediante SQL.

Se conservaron exactamente los catálogos:

| Catálogo | Filas |
| --- | ---: |
| identity_permisos | 8 |
| platform_modulos | 4 |
| platform_planes | 2 |
| platform_plan_modulos | 4 |

También se conservaron esquemas, funciones, ACL, políticas RLS, restricciones,
configuración del proyecto y migraciones internas de Auth y Storage. La comparación
de huellas antes/después confirmó igualdad de funciones y grants, tablas y RLS,
restricciones, políticas y definiciones/estados de todos los triggers de public.

El procedimiento usa un manifiesto explícito y `TRUNCATE … RESTRICT` conjunto para
public; nunca amplía automáticamente el alcance mediante CASCADE ni deshabilita FK.
Solo suspende los 13 triggers de TRUNCATE y restaura sus estados exactos antes de
confirmar la transacción. En Auth elimina sesiones/renovaciones y usuarios mediante
DELETE con las FK existentes. Todo fallo revierte también las alteraciones temporales.
El MCP registra la intervención como `mantenimiento_limpieza_total_quijas_scc`;
el historial anterior permanece.

Script de mantenimiento: [limpieza-total-quijas-scc.sql](../backend/scripts/limpieza-total-quijas-scc.sql).
No forma parte de las migraciones de instalación y no debe ejecutarse en cada despliegue.
Requiere una transacción explícita, rol postgres y confirmación específica del proyecto.

Pruebas: **5 pruebas locales pasaron**, cubriendo alcance, referencias externas,
catálogos y estados de triggers, Storage, rollback ante un fallo tardío y alta desde cero.
Después de limpiar se probó en Supabase una cuenta y empresa temporales, su contexto
de owner y el reintento idempotente. Esa prueba se revirtió completamente.

Resultado final verificado: **0 cuentas, empresas, perfiles, membresías, recibos,
sesiones y refresh tokens**; las 45 tablas de datos public están vacías.

Para comenzar, cerrar las sesiones abiertas del portal y registrar una cuenta nueva.
Confirmar el correo si Auth lo requiere, iniciar sesión y crear la empresa.
En los dispositivos PDA de prueba, limpiar sus datos locales antes de sincronizar:
la limpieza remota no elimina cachés ni colas offline del navegador.
