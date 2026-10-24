export const FILTROS_SESIONES_LECTURA = Object.freeze({
  TODAS: 'TODAS',
  ACTIVAS: 'ACTIVA',
  CERRADAS: 'CERRADA'
})

function normalizar(valor) {
  return String(valor ?? '')
    .trim()
    .toLocaleLowerCase()
}

function fechaEnMs(valor) {
  const timestamp = new Date(valor ?? 0).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function mismoDiaLocal(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dosDigitos(valor) {
  return String(valor).padStart(2, '0')
}

function formatearHora(fecha) {
  return `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
}

function formatearDiaHora(fecha, ahora) {
  if (mismoDiaLocal(fecha, ahora)) return `Hoy ${formatearHora(fecha)}`

  const dia = `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}`
  return `${dia} ${formatearHora(fecha)}`
}

export function formatearFechaSesion(valor, ahora = new Date()) {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ''
  return formatearDiaHora(fecha, ahora)
}

export function enriquecerSesionLectura(sesion, lecturas = []) {
  const sesionId = sesion.id ?? sesion.sesion_id
  const lecturasSesion = lecturas.filter((lectura) => lectura.sesion_id === sesionId)
  const cosechadores = new Set(
    lecturasSesion.map((lectura) => lectura.cosechador_dni).filter(Boolean)
  )

  return {
    ...sesion,
    total_jabas: lecturasSesion.length,
    cosechadores_distintos: cosechadores.size
  }
}

export function ordenarSesionesLectura(sesiones) {
  return [...sesiones].sort((a, b) => {
    const aActiva = a.estado === 'ACTIVA'
    const bActiva = b.estado === 'ACTIVA'
    if (aActiva !== bActiva) return aActiva ? -1 : 1
    return fechaEnMs(b.fecha_inicio) - fechaEnMs(a.fecha_inicio)
  })
}

export function filtrarSesionesLectura(
  sesiones,
  { busqueda = '', filtro = FILTROS_SESIONES_LECTURA.TODAS } = {}
) {
  const termino = normalizar(busqueda)
  const filtradas = sesiones.filter((sesion) => {
    if (filtro !== FILTROS_SESIONES_LECTURA.TODAS && sesion.estado !== filtro) {
      return false
    }
    if (!termino) return true

    return [
      sesion.jabero,
      sesion.dni_jabero,
      sesion.lote_codigo,
      sesion.lote_id,
      sesion.variedad
    ].some((valor) => normalizar(valor).includes(termino))
  })

  return ordenarSesionesLectura(filtradas)
}

export function formatearPeriodoSesion(sesion, ahora = new Date()) {
  const inicio = new Date(sesion.fecha_inicio)
  if (Number.isNaN(inicio.getTime())) return 'Hora no disponible'

  const inicioTexto = formatearFechaSesion(sesion.fecha_inicio, ahora)
  if (sesion.estado !== 'CERRADA' || !sesion.fecha_fin) return inicioTexto

  const fin = new Date(sesion.fecha_fin)
  if (Number.isNaN(fin.getTime())) return inicioTexto

  if (mismoDiaLocal(inicio, fin)) return `${inicioTexto} – ${formatearHora(fin)}`
  return `${inicioTexto} – ${formatearDiaHora(fin, ahora)}`
}

export function obtenerBadgeEstadoSesion(estado) {
  if (estado === 'ACTIVA') {
    return { etiqueta: 'Activa', clase: 'sync-badge--active' }
  }
  if (estado === 'CERRADA') {
    return { etiqueta: 'Cerrada', clase: 'sync-badge--closed' }
  }
  return null
}
