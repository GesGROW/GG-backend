# Revisión de Quijas-SCC para reinicio de datos

Fecha de revisión: 22 de octubre de 2026 (America/Lima).
Proyecto verificado mediante Supabase: **Quijas-SCC**, ref **mavecfdsrnyfozzukytl**.
Estado del proyecto: ACTIVE_HEALTHY. PostgreSQL 17.6.1.166, región sa-east-1.

**Actualización final: limpieza ejecutada por autorización del usuario.**
Las 45 tablas de datos están vacías y no quedan cuentas ni sesiones Auth.
Los catálogos, funciones, políticas, restricciones y triggers se conservaron.
La prueba del alta desde cero pasó y se revirtió para no dejar datos de prueba.
Ver [resultado y verificación de la limpieza](limpieza-quijas-scc-2026-10-22.md).
Las secciones siguientes conservan el inventario y las decisiones previas a la limpieza.

El inventario inicial se obtuvo únicamente mediante consultas de lectura.
Después, por solicitud del usuario, se resolvieron los dos pendientes descritos
en la actualización siguiente. No se borraron datos ni se cambió la configuración de Auth.

## Actualización: dos pendientes resueltos

- Se aplicó `202610221200_harvest_trabajadores_campania.sql` mediante MCP.
  La función `harvest_admin_trabajadores(uuid,uuid,text,integer)` está instalada;
  `iniciado_en` mantiene NULL en las 87 participaciones históricas y fecha las nuevas.
  El historial remoto registró `20261022174012`, nombre `harvest_trabajadores_campania`.
- Se implementó el formulario de alta de empresa del primer owner y la RPC
  `iam_crear_empresa_inicial(uuid,text,text)`, con creación atómica e idempotente,
  correo confirmado, actor verificado y permisos organizacionales mínimos.
  Migración local/remota `20261022174649_portal_alta_empresa_owner.sql`.
  Detalles en [Registro y alta del owner](portal-registro-owner.md).
- Se verificó un alta y su reintento en una transacción remota revertida por completo.
  Continúan las 3 cuentas Auth y la empresa originales; no hay cuentas de prueba
  ni filas en `identity_altas_empresas`. Ningún dato original fue eliminado.
- Pasaron 105 pruebas de aplicación, 241 de presentación y 28 SQL, más el build
  y la revisión del formulario en seis tamaños. El frontend está actualizado
  localmente; no se publicó un sitio externo.

La tabla nueva `identity_altas_empresas` tiene RLS y privilegios directos revocados:
su aviso informativo de RLS sin políticas es intencional (acceso solo mediante RPC).
Los avisos existentes de funciones heredadas y configuración de Auth no se modificaron.
El historial remoto contiene ahora las dos migraciones aplicadas en esta intervención;
el historial anterior no se reconstruyó.

Lo que sigue conserva el inventario y los hallazgos **anteriores** a estas correcciones.
El reinicio destructivo sigue pendiente y debe incluir también los recibos de alta
si esa tabla llega a contener datos.

## Inventario confirmado

Conteos exactos consultados, sin extraer correos, contraseñas, tokens ni datos
personales de trabajadores. Las cuentas/sesiones pueden cambiar tras la revisión.

| Tabla | Filas |
| --- | ---: |
| `auth.identities` | 3 |
| `auth.refresh_tokens` | 42 |
| `auth.sessions` | 17 |
| `auth.users` | 3 |
| `public.asignaciones_ticket` | 9 |
| `public.campaign_lote_parcelas` | 12 |
| `public.campanias` | 4 |
| `public.cultivos` | 4 |
| `public.farm_fundos` | 2 |
| `public.farm_parcelas` | 8 |
| `public.farm_sectores` | 4 |
| `public.harvest_asignaciones_lote` | 47 |
| `public.harvest_cultivo_lote_variedades` | 0 |
| `public.harvest_cultivo_lotes` | 0 |
| `public.harvest_cultivo_operaciones` | 0 |
| `public.harvest_cultivo_solicitudes` | 0 |
| `public.harvest_cultivo_supervisores` | 0 |
| `public.harvest_cultivos` | 0 |
| `public.harvest_cutovers` | 3 |
| `public.harvest_generaciones` | 56 |
| `public.harvest_lotes_tickets` | 58 |
| `public.harvest_registros_cosecha` | 10011 |
| `public.harvest_tickets` | 10626 |
| `public.identity_identidades` | 1 |
| `public.identity_invitaciones` | 0 |
| `public.identity_membresia_roles` | 1 |
| `public.identity_membresias` | 1 |
| `public.identity_permisos` | 8 |
| `public.identity_rol_permisos` | 14 |
| `public.identity_roles` | 5 |
| `public.identity_usuarios` | 1 |
| `public.integraciones_api` | 1 |
| `public.lecturas_jaba` | 15 |
| `public.lote_variedades` | 28 |
| `public.lotes` | 16 |
| `public.operaciones_pda_campania` | 10058 |
| `public.operaciones_pda_procesadas` | 10085 |
| `public.platform_cutovers_administrativos` | 0 |
| `public.platform_delegaciones_comerciales` | 0 |
| `public.platform_eventos_comerciales` | 1 |
| `public.platform_modulos` | 4 |
| `public.platform_operaciones_comerciales` | 0 |
| `public.platform_plan_modulos` | 4 |
| `public.platform_planes` | 2 |
| `public.platform_suscripciones` | 1 |
| `public.platform_tenant_modulos` | 3 |
| `public.sesiones_lectura` | 266 |
| `public.tenants` | 1 |
| `public.trabajador_campania_rol` | 87 |
| `public.trabajadores` | 35 |
| `public.usuarios_app` | 3 |
| `public.variedades` | 9 |
| `storage.buckets` | 0 |
| `storage.objects` | 0 |

Hay 48 tablas de aplicación en public, todas con RLS habilitado. De ellas,
44 contienen datos que quedarían dentro del reinicio (41476 filas
al revisar); las otras 4 son catálogos globales que se conservarían.

## Estado de las últimas entregas

- Activación de cuenta: función iam_preparar_entrega_invitacion instalada.
- Usuarios y accesos: iam_admin_accesos_cosecha y seeder de SUPERVISOR_COSECHA instalados.
- Cultivos y supervisores cooperativos: tablas y catálogo instalados, sin filas.
- Fechas de asignaciones de tickets: harvest_admin_dto incluye asignadoEn.
- Trabajadores de campaña: **falta aplicar 202610221200_harvest_trabajadores_campania.sql**.
  No existen la función harvest_admin_trabajadores ni la columna iniciado_en.
- Reportes nuevos: harvest_reportes_campania instalada.
- La herramienta de historial devuelve cero migraciones registradas. Esto no
  significa que falten todos los cambios: los objetos anteriores sí existen.
  Es compatible con aplicaciones manuales mediante SQL Editor; no se reconstruyó
  ni alteró el historial durante esta revisión.

## Hallazgo que afecta a la prueba desde cero

El registro actual del portal crea la cuenta mediante Auth signUp. **No crea
una empresa ni asigna su primer owner.** La pantalla sin-empresas únicamente
ofrece actualizar acceso y cerrar sesión. Los RPC de empresa existentes permiten
consultar/editar una empresa autorizada, no dar de alta una nueva con su owner.

Evidencia local: portal/src/application/crearPortal.js (registrar),
portal/src/infrastructure/supabase/adapters.js (registrarCuenta),
portal/src/presentation/Portal.jsx (estado sin-empresas) y
docs/portal-registro-owner.md (continuación pendiente).

Si se elimina también la empresa y todas las membresías, un nuevo registro no
podrá seguir automáticamente al Home. Antes de la prueba completa debe resolverse
ese alta o acordar explícitamente un bootstrap administrativo para el primer owner.
No se fabricó una membresía ni se implementó ese nuevo flujo en esta revisión.

## Alcance concreto propuesto para el reinicio

Eliminar los datos de las 44 tablas public del inventario, excluyendo los cuatro
catálogos listados abajo. Incluye empresa, membresías, usuarios Identity, roles
de esa empresa, invitaciones, cultivo/variedades/lotes, campañas, estructura del
fundo, trabajadores, tickets, registros, recibos y operaciones PDA, suscripción e
historial comercial, e integración API existente. Eliminar también las 3 cuentas
Auth y sus sesiones/identidades asociadas. Storage no requiere limpieza: está vacío.

Conservar:
- Esquemas, tablas, índices, restricciones, funciones, triggers, políticas y grants.
- identity_permisos: 8 filas.
- platform_modulos: 4 filas.
- platform_planes: 2 filas.
- platform_plan_modulos: 4 filas.
- Configuración del proyecto, proveedores de Auth y código de Edge Functions.
- Historial de migraciones de Supabase y sus tablas internas de infraestructura.
- Función de siembra de roles: los roles por tenant se regeneran al crear una empresa.

El código del proyecto protege historia mediante 13 triggers BEFORE TRUNCATE y
otros triggers de inmutabilidad. Un TRUNCATE general fallaría. El mantenimiento
deberá respetar las FK, acotarse al manifiesto revisado y restaurar exactamente
los estados de los triggers si se suspenden temporalmente dentro de una transacción.
No se generó ni ejecutó una sentencia de borrado durante esta revisión.

Para la prueba PDA desde cero se deberá vaciar además su caché/cola local en los
dispositivos de prueba. Borrar datos remotos no borra datos offline del navegador;
el reinicio de cada dispositivo requiere coordinar su estado de sincronización.

## Siguiente trabajo

1. **Completado:** resolver el alta inicial de empresa/owner.
2. **Completado:** aplicar la entrega faltante de trabajadores por campaña.
3. Preparar y probar localmente el procedimiento de reinicio con este alcance,
   incluyendo sesiones Auth y verificación de los catálogos conservados.
4. Presentar el procedimiento final y confirmar su ejecución destructiva contra
   mavecfdsrnyfozzukytl antes de ejecutarlo.
5. Verificar tablas vacías y realizar el recorrido con cuentas nuevas.

Este archivo es el informe y manifiesto del alcance; no es un script ejecutable de limpieza.

