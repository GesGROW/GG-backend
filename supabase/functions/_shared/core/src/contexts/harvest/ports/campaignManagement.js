/**
 * @typedef {Object} CampaignManagementParaHarvest
 * @property {(loteOperativo: Object, variedadId: string) => Object} seleccionarVariedadLote
 * Usa la proyección operativa existente; no convierte lote en una entidad física.
 */
export const operacionesCampaignManagementParaHarvest = Object.freeze([
  'seleccionarVariedadLote'
])
