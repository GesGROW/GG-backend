import { validarIdentificador } from '../domain/identificadoresTickets.js'

/**
 * Asignación confirmada. El puerto resuelve el código y decide con bloqueo SQL,
 * reutilizando los contratos de autorización y trabajador de los otros BC.
 * No decide a partir de un catálogo leído antes de la transacción.
 */
export function crearAsignarLoteDeTickets({ repositorioTickets }) {
  return async function asignarLoteDeTickets({
    codigoTicket,
    cosechador,
    trabajador = cosechador,
    operador,
    campania = operador?.campania,
    operacionId
  }) {
    const codigo = validarIdentificador(codigoTicket, 'codigoTicket')
    const catalogo = await repositorioTickets.asignarLoteDesdeTicket({
      codigoTicket: codigo,
      campaniaId: validarIdentificador(campania?.id, 'campaniaId'),
      dniOperador: validarIdentificador(operador?.dni, 'dniOperador'),
      dniCosechador: validarIdentificador(trabajador?.dni, 'dniCosechador'),
      operacionId: validarIdentificador(operacionId, 'operacionId')
    })
    const lote = catalogo.identificarLote(codigo)
    return {
      catalogo,
      lote,
      ticket: catalogo.obtenerTicket(codigo),
      asignacion: lote.obtenerAsignacion()
    }
  }
}
