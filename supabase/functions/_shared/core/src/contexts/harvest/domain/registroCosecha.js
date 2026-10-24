import { AsignacionDeLote } from './asignacionDeLote.js'
import { DatoDeTicketsInvalido } from './erroresTickets.js'
import { validarIdentificador } from './identificadoresTickets.js'

// Resultado inmutable del uso de un ticket. La atribución viene de la asignación.
export class RegistroCosecha {
  constructor({
    id,
    codigoTicket,
    campaniaId,
    asignacion,
    fechaHora,
    sesionId,
    operacionId,
    versionProduccion
  }) {
    if (!(asignacion instanceof AsignacionDeLote))
      throw new DatoDeTicketsInvalido('asignacion')
    this.id = validarIdentificador(id, 'id')
    this.codigoTicket = validarIdentificador(codigoTicket, 'codigoTicket')
    this.campaniaId = validarIdentificador(campaniaId, 'campaniaId')
    this.fechaHora = validarIdentificador(fechaHora, 'fechaHora')
    this.loteId = asignacion.loteId
    this.trabajadorId = asignacion.trabajadorId
    this.asignacionOperacionId = asignacion.operacionId
    if (sesionId != null || operacionId != null) {
      this.sesionId = validarIdentificador(sesionId, 'sesionId')
      this.operacionId = validarIdentificador(operacionId, 'operacionId')
    }
    if (versionProduccion !== undefined) {
      if (versionProduccion !== null && versionProduccion !== 1)
        throw new DatoDeTicketsInvalido('versionProduccion')
      this.versionProduccion = versionProduccion
    }
    Object.freeze(this)
  }
}
