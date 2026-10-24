-- Sólo lectura. Ejecutar en el mismo proyecto Supabase que utiliza la aplicación.
-- Una lista faltantes vacía indica únicamente presencia de estos objetos;
-- no certifica que la migración completa figure en el historial o esté íntegra.
with requisitos(orden, etapa, objetos) as (
  values
    (1, 'Base operativa anterior a F5', array[
      'campanias','trabajadores','usuarios_app','trabajador_campania_rol',
      'variedades','lotes','lote_variedades','sesiones_lectura','asignaciones_ticket',
      'lecturas_jaba','operaciones_pda_campania','operaciones_pda_procesadas'
    ]::text[]),
    (2, '202610140100_harvest_tickets.sql', array['harvest_lotes_tickets','harvest_tickets']),
    (3, '202610140200_harvest_asignar_lote.sql', array['harvest_asignaciones_lote']),
    (4, '202610140300_harvest_registrar_cosecha.sql', array['harvest_registros_cosecha']),
    (5, '202610140600_harvest_cutover.sql', array['harvest_cutovers']),
    (6, '202610140610_harvest_proyecciones.sql', array['harvest_produccion_reportable']),
    (7, '202610140700_platform_tenants.sql', array['tenants']),
    (8, '202610140800_identity_access.sql', array[
      'identity_usuarios','identity_identidades','identity_membresias',
      'identity_roles','identity_permisos','identity_membresia_roles','identity_rol_permisos'
    ]),
    (9, '202610140900_platform_suscripciones.sql', array[
      'platform_modulos','platform_planes','platform_plan_modulos',
      'platform_suscripciones','platform_tenant_modulos'
    ]),
    (10, '202610141000_platform_ciclo_vida.sql', array[
      'platform_delegaciones_comerciales','platform_operaciones_comerciales','platform_eventos_comerciales'
    ]),
    (11, '202610141100_portal_identity_admin.sql', array['identity_invitaciones'])
)
select etapa,
  array(
    select objeto from unnest(objetos) as objeto
    where to_regclass('public.' || objeto) is null
  ) as faltantes
from requisitos
order by orden;
