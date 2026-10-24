# F7.7 — Retirada progresiva de Sheets y Apps Script

**Portal Web es la interfaz administrativa actual.**
**No desarrollar nuevas funcionalidades en Apps Script.**

La retirada es por campaña y explícita. Instalar esta fase no corta ninguna
campaña ni deshabilita SCC. Los archivos remotos no se han modificado, compartido,
vaciado ni eliminado; tampoco se ha aplicado la migración en remoto.

## Auditoría y matriz de paridad

Se revisaron los 18 archivos `.gs`, la lista permitida de `CampaniaArchivo.gs`,
el transporte `Supabase.gs`, los menús, `onOpen`/`onEdit`, los contratos SQL
globales y `*_hoja`, las pruebas existentes y las guías de sincronización.
`Menu.gs` sincroniza manualmente cinco maestros; los reportes sólo leen backend.
No hay en el repositorio generación de tickets, operaciones de campo ni un
proceso de doble escritura entre Portal y Sheets. Las propiedades de archivo
fijan campaña/Spreadsheet y las credenciales técnicas usan Supabase Auth.
No se han inspeccionado archivos reales, copias ni triggers instalados en Drive.

| Función administrativa                                                                    | Sheets / RPC actual                                                                                        | Equivalente Portal                                                                         | Paridad antes → después de F7.7                                 | Retirada                                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Consultar/crear/editar/activar/desactivar trabajadores                                    | Trabajadores.gs + TrabajadoresPure.gs; admin_listar_trabajadores_hoja, admin_guardar_trabajador_hoja       | `/personal`, altas/datos/estado por Tenant; DNI único por empresa                          | Completa → completa                                             | Escritura retirada al corte                                                   |
| Consultar campaña, datos, fechas y estado                                                 | Campanias.gs + CampaniasPure.gs; admin_listar_campanias_hoja, admin_guardar_campania_hoja                  | `/campanias`, creación con cultivo, edición, activar/cerrar semánticos                     | Completa → completa                                             | Escritura retirada al corte                                                   |
| Variedades del cultivo                                                                    | Variedades.gs + VariedadesPure.gs; admin_listar_variedades_hoja, admin_guardar_variedad_hoja               | Detalle de campaña, catálogo compartido Tenant/cultivo                                     | Completa → completa                                             | Escritura retirada al corte; protección del catálogo compartido               |
| Lotes operativos: listado, código, nombre, alta, activo y variedades                      | Lotes.gs + LotesPure.gs; admin_listar_lotes_hoja, admin_guardar_lote_variedades_hoja                       | Detalle de campaña: configuración F7.3 + alta/datos/estado F7.7                            | Parcial → completa                                              | Escritura retirada al corte                                                   |
| SUPERVISORA / COSECHADOR: participación, alta/retiro de rol                               | RolesCampania.gs + RolesCampaniaPure.gs; admin_listar_roles_campania_hoja, admin_guardar_rol_campania_hoja | Detalle de trabajador, asignar/retirar rol; no mutar UUID históricos                       | Completa mediante intenciones seguras → completa                | Escritura retirada al corte                                                   |
| JABERO: habilitar/renovar jornada y retirar                                               | Los mismos archivos/RPC; trigger asignacion_diaria_jabero                                                  | Detalle de trabajador: habilitarJaberoDelDia / retirarJabero; reloj Lima del servidor      | Parcial → completa                                              | Escritura retirada al corte; la PWA mantiene registro diario existente        |
| Resumen                                                                                   | Reportes.gs + ReportesPure.gs; admin_obtener_resumen_campania_hoja                                         | `/reportes/resumen` y dashboard, proyección F5.6                                           | Completa para operación Lima → completa                         | Consulta conservada                                                           |
| Producción diaria                                                                         | admin_obtener_produccion_diaria_hoja                                                                       | `/reportes/diaria`, gráfica/tabla/CSV                                                      | Completa para operación Lima → completa                         | Consulta conservada                                                           |
| Producción por lote/variedad                                                              | admin_obtener_produccion_lotes_hoja                                                                        | `/reportes/lotes`, filtro/orden/CSV                                                        | Completa → completa                                             | Consulta conservada                                                           |
| Ranking HOY/SEMANA/MES/CAMPANIA                                                           | admin_obtener_ranking_cosechadores_periodo_hoja                                                            | `/reportes/ranking`, filtros, posiciones y CSV                                             | Completa para ranking actual → completa                         | Consulta conservada                                                           |
| Ranking comparativo, posición anterior/cambio y zona horaria configurable del Spreadsheet | Reportes.gs, ReportesPure.gs; mismo RPC con proyección comparativa anterior                                | F7.5 usa ranking actual F5.6 en Lima; no muestra comparación anterior ni permite otra zona | Parcial → parcial                                               | **No se deshabilita esta consulta**                                           |
| Contexto de archivo, listas y refresco manual                                             | CampaniaArchivo.gs; admin_contexto_archivo_hoja y admin_listar_*_hoja                                      | TenantContext, selector y detalle de campaña                                               | Completa para contexto administrativo; Drive conserva histórico | Lecturas conservadas con autorización existente                               |
| Configuración local/protección de celdas, permisos Drive, copias                          | Code.gs, Config.gs, Menu.gs; sin DML operativo propio                                                      | Rutas y permisos Identity; archivos antiguos permanecen en Drive                           | No requiere clon de UI de hoja                                  | Conservar durante transición; inventariar copias/jobs antes de retirada total |
| Usuarios/membresías, comercial y tickets Harvest                                          | No son funciones de estos scripts                                                                          | F7.2/F7.4/F7.6                                                                             | No aplica como gap Sheets                                       | Sin cambio                                                                    |

Los alias globales `admin_guardar_*` anteriores también se auditaron: no pueden
servir como escape para cuentas acceso_global. Los archivos actuales sólo llaman
los adaptadores permitidos `*_hoja`; la protección cubre además aliases antiguos.

La tabla separa escritura administrativa de consulta. La comparación de ranking
y las zonas de reporte alternativas no bloquean retirar escrituras: sus APIs de
lectura siguen funcionando con sus permisos y entitlements existentes. No se
declara paridad completa de estos reportes ni se retiran sus botones/contratos.

## Gaps resueltos sin nuevos dominios

`campaign_admin_guardar_lote` permite alta, edición de código/nombre y estado de
lotes **operativos de campaña**, reutilizando `campaign_admin_exigir_campania` y
`campaign_admin_configurar_variedades_lote`. Revalida Tenant, campaign.manage,
CAMPAIGN, campaña activa para alta y variedades activas del mismo cultivo/Tenant.
No cambia ownership, campaña, identidades ni elimina asociaciones históricas.
No introduce Fundo/Sector/Parcela ni Farm Structure.

`workforce_admin_jornada_jabero` ofrece habilitar/renovar hoy y retirar mediante
intención explícita, con workforce.manage + WORKFORCE. No recibe fecha ni modifica
la identidad de un rol. Reutiliza el trigger diario y el recálculo de acceso legacy,
sin crear Usuario Identity ni exigir que el gestor sea trabajador. La PWA conserva
su caso de uso y sus recibos originales; no se modifica su operación de campo.
El CRUD genérico de roles continúa rechazando JABERO.

## Cutover administrativo

Aplicar `backend/supabase/migrations/202610141600_portal_cutover_administrativo.sql` después
de F7.6. Es transaccional e idempotente, con marcador privado portal_f77_version().
No modifica suscripciones/módulos de SCC ni activa cortes automáticamente.

En `/campanias/:id`, un administrador con company.manage puede consultar la
autoridad y preparar el corte. Activarlo exige además campaign.manage,
workforce.manage, reports.view y los tres módulos CAMPAIGN/WORKFORCE/HARVEST
vigentes. Se exige ID de operación, motivo y confirmación explícita de conciliación.
Una identidad técnica registrada nunca puede activarlo, aunque reciba por error
una membresía de gestión. Las nuevas operaciones siguen capas React → Application
→ API pública Platform/Campaign/Workforce → puertos → adapters.

El resultado es `PORTAL` o `TRANSICION_SHEETS`. La primera activación persiste
tenant, campaña, actor Identity, fecha del servidor, motivo y revisión/paridad F7.7
en `platform_cutovers_administrativos`, con FKs compuestas de campaña y membresía.
UPDATE/DELETE/TRUNCATE están bloqueados, RLS activo y sin acceso directo para
public/anon/authenticated/service_role. Las fachadas públicas revalidan permisos.
No hay rollback automático ni endpoint para reabrir escrituras Sheets.

El mismo ID, actor, campaña, Tenant y motivo devuelven el mismo resultado. Reusar
el ID para otra intención o crear otro corte de la misma campaña se rechaza.
La UI conserva intención/UUID ante un fallo incierto y permite reintentar sin
generar silenciosamente otra operación. TenantContext/scope invalida consultas o
respuestas de otra empresa, incluido A→B→A.

El corte de administración es **independiente del cutover Harvest F5.6**: no lo
activa, cambia, retrasa ni reinterpreta. No mueve hechos ni cambia sus proyecciones.

## Protecciones backend y deshabilitación técnica

La identidad técnica se reconoce mediante `auth.uid()` y `integraciones_api`
persistida; nunca por un header, modo React o tenant arbitrario.

1. Se instrumentan todas las funciones PL/pgSQL `admin_guardar_*` existentes,
   tanto globales como `*_hoja`, manteniendo firmas, cuerpos y ACL. La guarda
   toma un lock administrativo por Tenant antes de escribir y rechaza campañas
   migradas. El corte usa el mismo lock; una escritura admitida antes del corte
   termina primero o una posterior se rechaza. No hay proceso de doble escritura.
2. Una llamada de maestro global sin contexto se rechaza si su Tenant tiene
   algún corte. Las campañas no migradas siguen usando sus adaptadores de archivo.
3. Triggers sobre OLD/NEW de campaña, trabajador, usuario_app, variedad, lote,
   lote_variedades, participación y relación de hoja impiden escapes por otro RPC,
   mover UUID o falsear GUC. El contexto transaccional heredado sólo enruta aliases;
   las filas reales y credenciales persistidas siguen siendo autoridad.
4. Trabajadores compartidos con una campaña migrada y variedades del mismo
   Tenant/cultivo quedan protegidos también desde campañas no migradas. Cambiar
   un maestro compartido afecta a la campaña migrada: debe hacerse en Portal.
   Los maestros exclusivos de otras campañas/Tenants continúan disponibles.
5. `integracion_campania.escritura_habilitada` queda false para la campaña cortada;
   se crean denegaciones explícitas para integraciones acceso_global. Un trigger
   mantiene false incluso si se añade o intenta rehabilitar una relación después
   del corte. El marcador de campaña bloquea igualmente credenciales globales
   antiguas, nuevas relaciones e intentos de usar una membresía Portal técnica.

No se borra ni desactiva globalmente integraciones_api.activo: una misma cuenta
puede seguir atendiendo otras campañas. Se retira su capacidad **de escritura en
esa campaña**, conservando activo/lectura para maestros/reportes históricos. No
se cambian permisos de lectura, se rotan contraseñas ni se borran cuentas/recibos.
Las credenciales Auth antiguas continúan autenticándose, pero ya no conceden
escritura sobre el contexto cortado.

No se alteran GUC permanentes/proconfig, SDK de campo, IndexedDB v5, comandos,
consumo único, cutover, reportes, Identity ni administración comercial. Un dueño
privilegiado de la base sigue siendo una autoridad de infraestructura; estas
guardas protegen las credenciales técnicas Auth de los scripts y sus endpoints.

## Procedimiento de operación y conservación

1. Desplegar migración y Portal; comprobar IAM, permisos, módulos y datos de la
   campaña. Inventariar archivo(s), cuenta(s) técnica(s), copias y triggers externos.
2. Detener temporalmente la edición administrativa del archivo. Revisar todas las
   filas PENDIENTE/ERROR de sus cinco maestros. Sincronizar antes del corte o
   conciliar explícitamente en Portal conservando UUID; no vaciar ni ocultar filas.
3. Comprobar lotes, variedades, trabajadores, participaciones y jornada JABERO.
   Comparar reportes; conservar acceso a comparación anterior si se utiliza.
4. Confirmar revisión, motivo y cutover desde el detalle de campaña. La revisión
   es una declaración auditada del gestor, no una lectura automática de Drive;
   el backend no puede descubrir pendientes en celdas sin sincronizar.
5. Verificar rechazo real de sincronización usando la cuenta antigua y escritura
   Portal. Los scripts antiguos muestran error y conservan sus filas/IDs; no
   actualizarlos para saltar el rechazo ni sincronizar el mismo cambio dos veces.
6. Conservar el archivo como histórico temporal. Ajustar permisos Drive a lectura
   donde corresponda; si se necesita refrescar la consulta comparativa, conservar
   sólo el operador autorizado de lectura. Retirar jobs de escritura inventariados.
   No se ejecuta ninguna modificación remota de Drive en esta implementación.
7. Repetir por campaña y Tenant. Declarar deprecación total de Apps Script sólo
   cuando el inventario confirme cero dependencias operativas y se resuelvan o
   archiven las consultas sin paridad. Hoy queda **legacy en transición**.

No se pueden eliminar aún: apps-script/, archivos Sheets, cuentas/relaciones
necesarias para campañas no migradas o consulta comparativa, tablas de integración,
trabajadores_campania_hoja, RPC legacy, recibos PDA, histórico de producción,
cutovers y auditoría. Tampoco se introducen pagos ni nuevas capacidades comerciales.

## Validación

La suite SQL de Sheets usa sus credenciales/ACL reales simuladas en PGlite y
migraciones hasta F7.7: antes/después, integración global antigua, flags reactivados,
contexto falso, maestros compartidos, ambas empresas, permisos, corte idempotente
e inmutable, escritura Portal, lectura histórica, jornada PWA y recibo repetido.
Las pruebas Node/React cubren los gaps y la revisión/reintento del corte, y las
guardas existentes prohíben SDK/RPC en Presentation/Application. Las demás suites
siguen comprobando Harvest, Identity, Platform, offline y Apps Script.
No sustituyen probar JWT reales, concurrencia con conexiones independientes ni
el inventario de archivos/triggers en Supabase/Drive de producción.
