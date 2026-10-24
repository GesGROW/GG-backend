import { TicketSinLote, TicketYaUtilizado } from './erroresTickets.js'
import { validarIdentificador } from './identificadoresTickets.js'
import { LoteDeTickets } from './loteDeTickets.js'
import { RegistroCosecha } from './registroCosecha.js'

// Agregado de uso único; conserva solamente la referencia al lote.
export class Ticket {
  #registroCosecha = null

  constructor({ codigo, loteId }) {
    this.codigo = validarIdentificador(codigo, 'codigo')
    if (typeof loteId !== 'string' || !loteId.trim())
      throw new TicketSinLote(this.codigo)
    this.loteId = loteId.trim()
    Object.freeze(this)
  }

  get estado() {
    return this.#registroCosecha ? 'UTILIZADO' : 'DISPONIBLE'
  }

  get registroCosecha() {
    return this.#registroCosecha
  }

  registrarCosecha({ id, lote, fechaHora, sesionId, operacionId, versionProduccion }) {
    if (this.#registroCosecha) throw new TicketYaUtilizado(this.codigo)
    if (!(lote instanceof LoteDeTickets) || lote.id !== this.loteId)
      throw new TicketSinLote(this.codigo, this.loteId)
    const registro = new RegistroCosecha({
      id,
      codigoTicket: this.codigo,
      campaniaId: lote.campaniaId,
      asignacion: lote.obtenerAsignacion(),
      fechaHora,
      sesionId,
      operacionId,
      versionProduccion
    })
    this.#registroCosecha = registro
    return registro
  }
}
