import { validarIdentificador } from '../domain/identificadoresTickets.js'
import { ErrorPersistenciaTickets } from '../ports/tickets.js'

// Confirmación remota: el puerto valida autorización/sesión, deriva el trabajador
// y consume el ticket en la misma transacción que registra la cosecha y el recibo.
export function crearRegistrarCosecha({ repositorioTickets }) {
  return async function registrarCosecha({
    codigoTicket,
    operador,
    campania = operador?.campania,
    sesionId,
    registroId,
    fechaHora,
    operacionId
  }) {
    const codigo = validarIdentificador(codigoTicket, 'codigoTicket')
    const catalogo = await repositorioTickets.registrarCosecha({
      codigoTicket: codigo,
      campaniaId: validarIdentificador(campania?.id, 'campaniaId'),
      dniOperador: validarIdentificador(operador?.dni, 'dniOperador'),
      sesionId: validarIdentificador(sesionId, 'sesionId'),
      registroId: validarIdentificador(registroId, 'registroId'),
      fechaHora: validarIdentificador(fechaHora, 'fechaHora'),
      operacionId: validarIdentificador(operacionId, 'operacionId')
    })
    const ticket = catalogo.obtenerTicket(codigo)
    if (!ticket.registroCosecha)
      throw new ErrorPersistenciaTickets(
        'La confirmación no contiene el registro de cosecha.'
      )
    return {
      catalogo,
      ticket,
      lote: catalogo.identificarLote(codigo),
      registro: ticket.registroCosecha
    }
  }
}
