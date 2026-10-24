export function validarGestionCampaign(puerto) {
  for (const m of [
    'listar',
    'obtener',
    'crear',
    'editar',
    'activar',
    'cerrar',
    'cultivos',
    'variedades',
    'guardarVariedad',
    'lotes',
    'configurarVariedadesLote'
  ])
    if (typeof puerto?.[m] !== 'function') throw new Error(`Campaign requiere ${m}.`)
  return puerto
}
