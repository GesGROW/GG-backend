import { CatalogoDeTickets } from '../domain/catalogoDeTickets.js'
import { DatoDeTicketsInvalido } from '../domain/erroresTickets.js'
import { validarIdentificador } from '../domain/identificadoresTickets.js'
import { LoteDeTickets } from '../domain/loteDeTickets.js'
import { Ticket } from '../domain/ticket.js'

/** @param {{repositorioTickets: import('../ports/tickets.js').RepositorioTicketsHarvest, generadorCodigoTicket: import('../ports/tickets.js').GeneradorCodigoTicket, generarIdLote: Function}} dependencias */
export function crearGenerarLotesDeTickets({
  repositorioTickets,
  generadorCodigoTicket,
  generarIdLote
}) {
  return async function generarLotesDeTickets({
    campaniaId,
    cantidadTickets,
    tamanioLote
  }) {
    const campania = validarIdentificador(campaniaId, 'campaniaId')
    for (const [campo, valor] of Object.entries({ cantidadTickets, tamanioLote })) {
      if (!Number.isSafeInteger(valor) || valor <= 0)
        throw new DatoDeTicketsInvalido(campo)
    }
    const lotes = []
    const tickets = []
    for (let indice = 0; indice < cantidadTickets; indice++) {
      if (indice % tamanioLote === 0)
        lotes.push(
          new LoteDeTickets({ id: await generarIdLote(), campaniaId: campania })
        )
      const lote = lotes.at(-1)
      tickets.push(
        new Ticket({
          codigo: await generadorCodigoTicket.generar({
            campaniaId: campania,
            loteId: lote.id,
            indice
          }),
          loteId: lote.id
        })
      )
    }
    // Detecta errores del generador en esta solicitud; la autoridad global es SQL.
    const catalogo = new CatalogoDeTickets({ lotes, tickets })
    await repositorioTickets.guardarLotesConTickets({
      campaniaId: campania,
      lotes,
      tickets
    })
    return { lotes, tickets, catalogo }
  }
}
