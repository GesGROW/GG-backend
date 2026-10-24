import { validarTicketDisponible } from '../domain/validacionesLectura.js'

export function crearAsignarTicket(dependencias) {
  // Compatibilidad legacy para campañas anteriores al cutover explícito.
  // Después del corte, Application reserva el lote mediante HarvestLocal.
  return async function asignarTicket({ operador, cosechador, codigoTicket }) {
    const ticketExistente = await dependencias.cosecha.obtenerTicket(codigoTicket)
    const ticketPendiente = await dependencias.cola.existeTicketPendiente(codigoTicket)
    validarTicketDisponible(ticketExistente, ticketPendiente)
    const operacion = await dependencias.cosecha.guardarAsignacion({
      codigoTicket,
      cosechadorDni: cosechador.dni,
      cosechador: cosechador.nombre,
      dniOperador: operador.dni
    })
    return {
      operacion,
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar el ticket guardado:'
      )
    }
  }
}
