import { ErrorDominioTickets } from './erroresTickets.js'

export class PoliticaHarvestDesconocida extends ErrorDominioTickets {
  constructor() {
    super('Actualice la caché para conocer el modelo operativo de esta campaña.')
  }
}
export class EscrituraLegacyRetirada extends ErrorDominioTickets {
  constructor() {
    super(
      'Esta campaña utiliza Harvest. Las escrituras legacy están retiradas; la intención anterior requiere revisión.'
    )
  }
}
export class CampaniaSinCutover extends ErrorDominioTickets {
  constructor() {
    super('La campaña todavía no tiene un cutover Harvest confirmado.')
  }
}

// No consulta registros ni compara el reloj del PDA con el del servidor.
export function modeloOperativoHarvest(cutover, campaniaId) {
  if (cutover === undefined) throw new PoliticaHarvestDesconocida()
  if (cutover === null) return 'LEGACY'
  if (
    cutover.campaniaId !== campaniaId ||
    cutover.version !== 1 ||
    typeof cutover.activadoEn !== 'string' ||
    !Number.isFinite(Date.parse(cutover.activadoEn))
  ) {
    throw new ErrorDominioTickets('La política de cutover Harvest no es válida.')
  }
  return 'HARVEST'
}
