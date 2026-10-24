export async function obtenerProduccionDiaria(
  dniOperador,
  consultar,
  resolverZonaHoraria = obtenerZonaHorariaCliente
) {
  if (typeof consultar !== 'function') {
    throw new Error('No se configuró el backend para obtener la producción.')
  }

  const zonaHoraria = resolverZonaHoraria()
  if (!zonaHoraria) {
    throw new Error('No se pudo determinar la zona horaria del dispositivo.')
  }

  let data
  try {
    data = await consultar({ dniOperador, zonaHoraria })
  } catch (error) {
    throw new Error(error.message || 'No se pudo obtener la producción diaria.')
  }

  return normalizarProduccionDiaria(data)
}

export function obtenerZonaHorariaCliente() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function normalizarProduccionDiaria(data) {
  if (!data || data.ok !== true || !Array.isArray(data.produccion)) {
    throw new Error('La respuesta de producción no tiene el formato esperado.')
  }

  const campania =
    data.campania && typeof data.campania === 'object' ? data.campania : {}

  const produccion = data.produccion
    .map((fila) => ({
      fecha: normalizarFechaCalendario(fila.fecha),
      total_jabas: numeroSeguro(fila.total_jabas),
      total_cosechadores: numeroSeguro(fila.total_cosechadores),
      total_sesiones: numeroSeguro(fila.total_sesiones)
    }))
    .filter((fila) => fila.fecha && fila.total_jabas > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  return {
    ok: true,
    campania: {
      id: String(campania.id ?? '').trim(),
      nombre: String(campania.nombre ?? '').trim()
    },
    zona_horaria: String(data.zona_horaria ?? '').trim(),
    produccion
  }
}

export function resumirProduccionDiaria(produccion) {
  return {
    jabas: produccion.reduce(
      (total, fila) => total + numeroSeguro(fila.total_jabas),
      0
    ),
    dias: produccion.length
  }
}

export function formatearFechaCalendario(fecha) {
  const fechaNormalizada = normalizarFechaCalendario(fecha)
  if (!fechaNormalizada) return '—'

  const [anio, mes, dia] = fechaNormalizada.split('-')
  return `${dia}/${mes}/${anio}`
}

export function reemplazarProduccionDiaria(_actual, siguiente) {
  return siguiente.map((fila) => ({ ...fila }))
}

export function esErrorConexionProduccion(error) {
  const mensaje = String(error?.message ?? error ?? '').toLocaleLowerCase('es-PE')
  return (
    mensaje.includes('failed to fetch') ||
    mensaje.includes('networkerror') ||
    mensaje.includes('network error') ||
    mensaje.includes('load failed') ||
    mensaje.includes('fetch')
  )
}

function normalizarFechaCalendario(valor) {
  const fecha = String(valor ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : ''
}

function numeroSeguro(valor) {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}
