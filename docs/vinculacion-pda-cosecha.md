# Vinculación de PDA a empresa para Cosecha

Fecha: 2026-10-27. Estado: primera etapa de backend implementada y verificada
localmente. La integración de portal/PWA y el acceso por DNI y PIN siguen
pendientes; no se ha desplegado esta migración en producción.

## Conclusión

Mantener una sola PWA de Cosecha para todas las empresas. Incorporar una
vinculación de instalación a empresa mediante QR, independiente de la
autenticación del usuario. Reutilizar Identity & Access y las reglas de Harvest.

## Lo que existe

| Área | Evidencia local | Consecuencia |
| --- | --- | --- |
| Proyectos independientes | `../../README.md` | Implementar en backend, portal y PWA; la carpeta raíz `shared/` es histórica. |
| Identidad y empresas | `../supabase/migrations/202610140800_identity_access.sql` | Reutilizar usuarios, membresías, permisos y resolución de TenantContext. |
| Supervisor de Cosecha | `../supabase/migrations/202610211200_usuarios_accesos_modulo.sql` | Ya existe `SUPERVISOR_COSECHA`; autorizar mediante permisos efectivos y módulo HARVEST. |
| Puente portal–PDA | `../supabase/migrations/20261023232746_portal_supervisor_dni_pwa.sql` | Ya vincula DNI y trabajador, y comprueba cuenta, membresía, módulo y asignación de cultivo online. |
| Autenticación de cuenta | `../../pwa/src/infrastructure/supabase/identityAdapter.js` | Actualmente usa correo y contraseña; DNI y PIN requieren un flujo adicional de autenticación. |
| Entrada operativa | `../../pwa/src/infrastructure/supabase/backendAdapter.js` | Sigue llamando `validar_operador_campanias` con DNI. |
| Composición | `../../pwa/src/bootstrap.js` | El acceso de cuenta y los casos de uso del PDA se configuran por separado; el PDA no recibe el TenantContext de cuenta. |
| Operación offline | `../../pwa/src/offline/db.js`, `../../pwa/src/offline/sync.js` | Ya hay IndexedDB v5, partición por campaña, cola y reintentos. Conservarlos al evolucionar el contrato. |
| Distribución | `../../pwa/vite.config.js` | Existe una PWA; el manifiesto todavía muestra «Cosecha Quijas». La revisión no identificó un empaquetado APK. |

La revisión inicial no encontró dispositivos, tokens de vinculación ni DNI y PIN.
La migración `20261027152741_pda_vinculacion_dispositivos.sql` incorpora ahora
tokens, dispositivos, revocación, operaciones autenticadas y un control de
activación por empresa. El [contrato de integración](pda-vinculacion-api.md)
detalla los RPC y los límites de esta entrega.

## Flujo previsto

1. El administrador o supervisor de Cosecha obtiene un QR de vinculación para su
   empresa en el portal, con `company.manage` o `harvest.manage` respectivamente.
2. La PWA instalada abre o escanea el enlace y presenta la empresa identificada.
3. El usuario se autentica. El servidor verifica su membresía en esa empresa,
   los permisos necesarios, el módulo HARVEST y las asignaciones operativas.
4. El servidor registra el dispositivo y entrega una credencial individual de
   instalación. El QR compartido no sirve como credencial operativa permanente.
5. La PWA descarga campañas y datos autorizados y habilita la operación.
6. En aperturas posteriores conserva la empresa vinculada y solicita el acceso
   del usuario según la vigencia de su sesión y de la autorización offline.

El acceso puede presentar DNI y PIN, pero validar esos datos debe producir una
sesión verificable compatible con Identity & Access. Comparar un PIN local o
añadirlo al formulario actual no protege los RPC que siguen aceptando solo DNI.
El nuevo flujo necesita límites de intentos y almacenamiento seguro de la
credencial; no devolver al cliente datos de cuenta para autenticar por su cuenta.

## Reglas para la implementación

- QR: token opaco, con vencimiento y revocación, almacenado como hash en servidor.
  Su regeneración afecta nuevas vinculaciones, sin revocar dispositivos existentes.
- Dispositivo: identificador de instalación y credencial verificable; el UUID
  enviado por la PWA no prueba por sí solo la identidad del equipo.
- Revocación: comprobar estado de dispositivo y permisos en los endpoints de
  operación y sincronización. Proteger también las rutas anteriores para evitar
  que permitan saltarse el nuevo acceso, con transición explícita para PDA activos.
- Empresa: resolverla desde la vinculación validada y contrastarla con la
  membresía y la campaña persistida. No usar el DNI como selector global.
- Offline: definir una autorización con vencimiento emitida online. La revocación
  se conoce al reconectar o al vencer esa autorización, nunca instantáneamente
  mientras el equipo permanece desconectado.
- Cola: conservar UUID e idempotencia. Las operaciones nuevas deben identificar
  empresa, usuario, dispositivo y campaña, sin atribuir comandos antiguos al
  usuario que inicia sesión después.
- Cambio de empresa: bloquearlo mientras existan operaciones sin resolver o
  sesiones de lectura abiertas. No borrar datos pendientes para desvincular.
- Rechazos al reconectar: conservar los registros y su auditoría; definir su
  resolución administrativa antes del despliegue. El vencimiento de la sesión
  no debe destruir el trabajo ya capturado.

## Orden de trabajo

1. Backend implementado: tokens, dispositivos y RPC que exigen sesión de cuenta,
   credencial del equipo, permisos y módulo. El acceso vinculado obligatorio
   queda desactivado hasta actualizar los clientes de cada empresa.
2. PWA: vinculación, sesión de usuario y conexión del flujo operativo existente
   al contexto autorizado; migración de caché y cola sin pérdida de datos.
3. Portal implementado: generar y regenerar QR, listar dispositivos y revocarlos. El enlace de
   instalación es común; el de vinculación pertenece a la empresa.
4. Validar el flujo completo con dos empresas, permisos revocados, QR vencido,
   equipo revocado, desconexión, respuesta perdida y reintento del mismo comando.

## Verificación realizada

Desde `pwa/`:

```sh
node --test tests/identity-access.test.js tests/platform-tenants-offline.test.js tests/harvest-offline-f5.5.test.js
```

La revisión inicial aprobó 46 pruebas existentes de identidad, ownership y
cosecha offline. La nueva batería `backend/tests/pda-vinculacion-sql.test.js`
ejecuta la migración en PostgreSQL embebido (PGlite) y verifica los RPC reales,
ACL, hashes, vencimiento, revocaciones, aislamiento, recibos, operaciones de
cosecha y activación de las guardas de compatibilidad. Estas pruebas se ejecutan
en PGlite, sin modificar la base desplegada.
