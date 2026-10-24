import { PoliticaHarvestDesconocida } from '../domain/cutoverHarvest.js'

export function crearOperacionSegunCutover({
  harvestLocal,
  operarHarvest,
  operarLegacy
}) {
  return async (solicitud) => {
    const modelo = await harvestLocal.obtenerModeloOperativo(
      solicitud.operador.campania.id
    )
    if (!['HARVEST', 'LEGACY'].includes(modelo)) throw new PoliticaHarvestDesconocida()
    return (modelo === 'HARVEST' ? operarHarvest : operarLegacy)(solicitud)
  }
}
