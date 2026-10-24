export const FILTROS_JABEROS_CAMPANIA = Object.freeze({
  TODOS: 'TODOS',
  PENDIENTE: 'PENDIENTE',
  ERROR: 'ERROR'
})

export function filtrarJaberosCampania(
  trabajadores,
  { busqueda = '', filtro = FILTROS_JABEROS_CAMPANIA.TODOS } = {}
) {
  const consulta = normalizar(busqueda)

  return trabajadores
    .filter(esRegistroJaberoVisible)
    .filter((trabajador) => {
      if (filtro === FILTROS_JABEROS_CAMPANIA.PENDIENTE) {
        return trabajador.estado_sync_jabero === 'PENDIENTE'
      }
      if (filtro === FILTROS_JABEROS_CAMPANIA.ERROR) {
        return trabajador.estado_sync_jabero === 'ERROR'
      }
      return true
    })
    .filter((trabajador) => {
      if (!consulta) return true

      return [trabajador.nombre, trabajador.dni]
        .map(normalizar)
        .some((valor) => valor.includes(consulta))
    })
    .sort((a, b) => {
      const porNombre = normalizar(a.nombre).localeCompare(normalizar(b.nombre), 'es')
      if (porNombre !== 0) return porNombre
      return String(a.dni ?? '').localeCompare(String(b.dni ?? ''), 'es')
    })
}

export function obtenerBadgeEstadoJabero(estado) {
  if (estado === FILTROS_JABEROS_CAMPANIA.PENDIENTE) {
    return { etiqueta: 'Pendiente', clase: 'sync-badge--pending' }
  }
  if (estado === FILTROS_JABEROS_CAMPANIA.ERROR) {
    return { etiqueta: 'Error', clase: 'sync-badge--error' }
  }
  return null
}

function esRegistroJaberoVisible(trabajador) {
  return (
    trabajador.roles?.includes('JABERO') ||
    trabajador.estado_sync_jabero === 'PENDIENTE' ||
    trabajador.estado_sync_jabero === 'ERROR'
  )
}

function normalizar(valor) {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-PE')
}
