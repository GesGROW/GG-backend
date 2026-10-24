import {
  DatoDeTicketsInvalido,
  LoteDeTicketsDuplicado,
  TicketDuplicado,
  TicketNoEncontrado,
  TicketSinLote
} from './erroresTickets.js'
import { validarIdentificador } from './identificadoresTickets.js'
import { LoteDeTickets } from './loteDeTickets.js'
import { Ticket } from './ticket.js'

// Servicio de dominio sobre agregados independientes, sin persistencia.
// La unicidad del código abarca todos los tickets entregados, entre campañas.
export class CatalogoDeTickets {
  #lotes = new Map()
  #tickets = new Map()

  constructor({ lotes, tickets }) {
    for (const lote of lotes) {
      if (!(lote instanceof LoteDeTickets)) throw new DatoDeTicketsInvalido('lote')
      if (this.#lotes.has(lote.id)) throw new LoteDeTicketsDuplicado(lote.id)
      this.#lotes.set(lote.id, lote)
    }
    for (const ticket of tickets) {
      if (!(ticket instanceof Ticket)) throw new DatoDeTicketsInvalido('ticket')
      if (this.#tickets.has(ticket.codigo)) throw new TicketDuplicado(ticket.codigo)
      if (!this.#lotes.has(ticket.loteId))
        throw new TicketSinLote(ticket.codigo, ticket.loteId)
      this.#tickets.set(ticket.codigo, ticket)
    }
    Object.freeze(this)
  }

  obtenerTicket(codigoTicket) {
    const codigo = validarIdentificador(codigoTicket, 'codigoTicket')
    const ticket = this.#tickets.get(codigo)
    if (!ticket) throw new TicketNoEncontrado(codigo)
    return ticket
  }

  identificarLote(codigoTicket) {
    return this.#lotes.get(this.obtenerTicket(codigoTicket).loteId)
  }

  asignarLoteDesdeTicket({ codigoTicket, trabajadorId, operacionId }) {
    return this.identificarLote(codigoTicket).asignar({ trabajadorId, operacionId })
  }

  registrarCosechaDesdeTicket({ codigoTicket, id, fechaHora }) {
    return this.obtenerTicket(codigoTicket).registrarCosecha({
      id,
      lote: this.identificarLote(codigoTicket),
      fechaHora
    })
  }
}
