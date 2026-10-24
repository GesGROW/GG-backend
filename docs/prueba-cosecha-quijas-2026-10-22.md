# Prueba de Cosecha sin cobro

Autorizada por el usuario el 22 de octubre de 2026 para continuar el recorrido desde cero.
Proyecto **Quijas-SCC**, ref `mavecfdsrnyfozzukytl`; empresa **Quijas SAC**.

Se creó una suscripción **TRIAL de 30 días**, con el plan existente `OPERACION_CAMPO`,
que contiene exclusivamente `HARVEST`. Vence el **21 de noviembre de 2026 a las 13:29,
America/Lima**. La operación no procesó pagos.

Se utilizó `platform_solicitar_cambio` y se verificó el evento comercial `APLICADA`,
la resolución efectiva de Cosecha y la coherencia del snapshot de auditoría al confirmar.
La autorización comercial necesaria se concedió únicamente dentro de la transacción
y se retiró antes del COMMIT; no quedó ninguna delegación comercial activa.
El owner conserva exclusivamente `company.manage` y `reports.view`.

Pruebas: primero se ensayó la operación con ROLLBACK; luego se aplicó y se verificó
desde el rol authenticated del owner que el portal ve Cosecha habilitado y puede
invitar supervisores. No se enviaron invitaciones durante esta verificación.

Procedimiento de soporte: [habilitar-prueba-cosecha-quijas.sql](../backend/scripts/habilitar-prueba-cosecha-quijas.sql).
Es manual, específico de esta empresa y exige confirmación de proyecto; no forma
parte del despliegue ni activa módulos automáticamente para otras empresas.
El flujo de contratación con pago del portal no fue modificado.

Para continuar: cerrar el diálogo, recargar el portal e invitar al supervisor desde
Usuarios y accesos de Cosecha. Contratar el módulo no concede operación al owner.
