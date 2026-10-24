export async function obtenerResumenCampania(
  dniOperador,
  consultar,
  resolverZonaHoraria = obtenerZonaHorariaCliente
) {
  if (typeof consultar !== 'function') {
    throw new Error('No se configuró el backend para obtener el resumen de campaña.')
  }

  const zonaHoraria = resolverZonaHoraria()
  if (!zonaHoraria) {
    throw new Error('No se pudo determinar la zona horaria del dispositivo.')
  }

  let data
  try {
    data = await consultar({ dniOperador, zonaHoraria })
  } catch (error) {
    throw new Error(error.message || 'No se pudo obtener el resumen de campaña.')
  }

  return normalizarResumenCampania(data)
}

export function obtenerZonaHorariaCliente() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function normalizarResumenCampania(data) {
  if (!data || data.ok !== true || !data.resumen || typeof data.resumen !== 'object') {
    throw new Error('La respuesta del resumen de campaña no tiene el formato esperado.')
  }

  const campania =
    data.campania && typeof data.campania === 'object' ? data.campania : {}
  const resumen = data.resumen

  return {
    ok: true,
    campania: {
      id: String(campania.id ?? '').trim(),
      nombre: String(campania.nombre ?? '').trim(),
      fecha_inicio: normalizarFechaCalendario(campania.fecha_inicio) || null
    },
    zona_horaria: String(data.zona_horaria ?? '').trim(),
    resumen: {
      total_jabas: numeroSeguro(resumen.total_jabas),
      total_cosechadores: numeroSeguro(resumen.total_cosechadores),
      total_lotes: numeroSeguro(resumen.total_lotes),
      total_sesiones: numeroSeguro(resumen.total_sesiones),
      dias_con_produccion: numeroSeguro(resumen.dias_con_produccion),
      ultima_lectura: resumen.ultima_lectura ? String(resumen.ultima_lectura) : null
    }
  }
}

export function reemplazarResumenCampania(_actual, siguiente) {
  return {
    ...siguiente,
    campania: { ...siguiente.campania },
    resumen: { ...siguiente.resumen }
  }
}

export function formatearNumeroResumen(valor, locale) {
  return new Intl.NumberFormat(locale).format(numeroSeguro(valor))
}

export function formatearFechaInicioCampania(fecha) {
  const normalizada = normalizarFechaCalendario(fecha)
  if (!normalizada) return ''

  const [anio, mes, dia] = normalizada.split('-')
  return `${dia}/${mes}/${anio}`
}

export function formatearUltimaActividad(fechaHora, ahora = new Date()) {
  if (!fechaHora) return 'Sin actividad registrada'

  const fecha = new Date(fechaHora)
  if (Number.isNaN(fecha.getTime())) return 'Sin actividad registrada'

  const hora = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  const esHoy =
    fecha.getFullYear() === ahora.getFullYear() &&
    fecha.getMonth() === ahora.getMonth() &&
    fecha.getDate() === ahora.getDate()

  if (esHoy) return `Hoy ${hora}`

  return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)} ${hora}`
}

export function esErrorConexionResumenCampania(error) {
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
  return Number.isFinite(numero) && numero >= 0 ? numero : 0
}

function dosDigitos(valor) {
  return String(valor).padStart(2, '0')
}
