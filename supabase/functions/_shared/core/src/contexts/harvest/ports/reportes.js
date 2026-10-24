// Consultas autorizadas de proyecciones unificadas. El proveedor verifica
// sesión, empresa, reports.view, HARVEST y ownership en cada llamada.
export function validarReportesHarvest(puerto) {
  for (const metodo of ['campanias', 'consultar', 'validar'])
    if (typeof puerto?.[metodo] !== 'function')
      throw new Error('Puerto de reportes Harvest incompleto: ' + metodo)
}
