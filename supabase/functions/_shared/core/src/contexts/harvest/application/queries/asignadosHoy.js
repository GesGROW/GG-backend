export const FILTROS_ASIGNADOS_HOY = Object.freeze({
  TODOS: 'TODOS',
  SINCRONIZADO: 'SINCRONIZADO',
  PENDIENTE: 'PENDIENTE',
  ERROR: 'ERROR'
})

export function perteneceAlDiaLocal(fecha, referencia = new Date()) {
  const valor = fecha instanceof Date ? fecha : new Date(fecha)
  const hoy = referencia instanceof Date ? referencia : new Date(referencia)

  if (Number.isNaN(valor.getTime()) || Number.isNaN(hoy.getTime())) return false

  return (
    valor.getFullYear() === hoy.getFullYear() &&
    valor.getMonth() === hoy.getMonth() &&
    valor.getDate() === hoy.getDate()
  )
}

export function filtrarAsignacionesHoy(
  tickets,
  { busqueda = '', filtro = FILTROS_ASIGNADOS_HOY.TODOS, ahora = new Date() } = {}
) {
  return filtrarAsignaciones(
    tickets
      .filter((ticket) => perteneceAlDiaLocal(ticket.fecha_asignacion, ahora))
      .filter(
        (ticket) =>
          filtro === FILTROS_ASIGNADOS_HOY.TODOS || ticket.estado_sync === filtro
      ),
    { busqueda }
  )
}

export function filtrarAsignaciones(tickets, { busqueda = '' } = {}) {
  const consulta = normalizar(busqueda)
  return tickets
    .filter((ticket) => {
      if (!consulta) return true

      return [ticket.cosechador, ticket.cosechador_dni, ticket.codigo_ticket]
        .map(normalizar)
        .some((valor) => valor.includes(consulta))
    })
    .sort(
      (a, b) =>
        new Date(b.fecha_asignacion).getTime() - new Date(a.fecha_asignacion).getTime()
    )
}

export function obtenerBadgeEstadoAsignacion(estado) {
  if (estado === FILTROS_ASIGNADOS_HOY.PENDIENTE) {
    return { etiqueta: 'Pendiente', clase: 'sync-badge--pending' }
  }
  if (estado === FILTROS_ASIGNADOS_HOY.ERROR) {
    return { etiqueta: 'Error', clase: 'sync-badge--error' }
  }
  return null
}

export function formatearHoraAsignacion(fecha) {
  const valor = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(valor.getTime())) return '—'

  return new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(valor)
}

function normalizar(valor) {
  return String(valor ?? '')
    .trim()
    .toLocaleLowerCase('es-PE')
}
