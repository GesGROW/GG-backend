export function validarTicketDisponible(ticketExistente, ticketPendiente) {
  if (ticketExistente || ticketPendiente) throw new Error('El ticket ya fue asignado.')
}

export function validarTicketParaLectura(ticket) {
  if (!ticket) throw new Error('El ticket no está asignado a ningún cosechador.')
  if (ticket.estado_sync === 'ERROR')
    throw new Error('Este ticket presenta un error de sincronización.')
}

export function validarNuevaSesion(existente) {
  if (existente)
    throw new Error('El jabero ya tiene una sesión activa. Continúe esa sesión.')
}

export function validarLoteOperativo(lote) {
  if (!lote) throw new Error('El lote seleccionado no está disponible.')
}

export function validarInicioNoRechazado(rechazado) {
  if (rechazado)
    throw new Error('El inicio de esta sesión fue rechazado. Revise sincronización.')
}
