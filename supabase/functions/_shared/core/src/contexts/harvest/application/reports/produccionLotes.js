export const ORDEN_PRODUCCION_LOTES = Object.freeze({
  MAS_JABAS: 'mas-jabas',
  AZ: 'az'
})

export async function obtenerProduccionLotes(dniOperador, consultar) {
  if (typeof consultar !== 'function') {
    throw new Error('No se configuró el backend para obtener la producción por lote.')
  }

  let data
  try {
    data = await consultar({ dniOperador })
  } catch (error) {
    throw new Error(error.message || 'No se pudo obtener la producción por lote.')
  }

  return normalizarProduccionLotes(data)
}

export function normalizarProduccionLotes(data) {
  if (!data || data.ok !== true || !Array.isArray(data.produccion)) {
    throw new Error('La respuesta de producción por lote no tiene el formato esperado.')
  }

  const campania =
    data.campania && typeof data.campania === 'object' ? data.campania : {}

  const produccion = data.produccion
    .map((fila) => ({
      lote_id: String(fila.lote_id ?? '').trim(),
      lote_codigo: String(fila.lote_codigo ?? '').trim(),
      lote_nombre: String(fila.lote_nombre ?? '').trim(),
      variedad: String(fila.variedad ?? '').trim(),
      ...(fila.variedad_id ? { variedad_id: String(fila.variedad_id).trim() } : {}),
      total_jabas: numeroSeguro(fila.total_jabas),
      total_cosechadores: numeroSeguro(fila.total_cosechadores),
      total_sesiones: numeroSeguro(fila.total_sesiones),
      ultima_lectura: fila.ultima_lectura ? String(fila.ultima_lectura) : null
    }))
    .filter((fila) => fila.lote_id && fila.total_jabas > 0)

  return {
    ok: true,
    campania: {
      id: String(campania.id ?? '').trim(),
      nombre: String(campania.nombre ?? '').trim()
    },
    produccion: ordenarProduccionLotes(produccion, ORDEN_PRODUCCION_LOTES.MAS_JABAS)
  }
}

export function buscarProduccionLotes(produccion, busqueda = '') {
  const consulta = normalizarTexto(busqueda)
  if (!consulta) return [...produccion]

  return produccion.filter((fila) =>
    [fila.lote_codigo, fila.lote_nombre, fila.variedad]
      .map(normalizarTexto)
      .some((valor) => valor.includes(consulta))
  )
}

export function ordenarProduccionLotes(
  produccion,
  orden = ORDEN_PRODUCCION_LOTES.MAS_JABAS
) {
  const filas = produccion.map((fila) => ({ ...fila }))

  if (orden === ORDEN_PRODUCCION_LOTES.AZ) {
    return filas.sort(
      (a, b) =>
        compararTexto(a.lote_codigo, b.lote_codigo) ||
        compararTexto(a.variedad, b.variedad)
    )
  }

  return filas.sort((a, b) => {
    const porJabas = numeroSeguro(b.total_jabas) - numeroSeguro(a.total_jabas)
    if (porJabas !== 0) return porJabas
    return (
      compararTexto(a.lote_codigo, b.lote_codigo) ||
      compararTexto(a.variedad, b.variedad)
    )
  })
}

export function resumirProduccionLotes(produccion) {
  return {
    lotes: new Set(produccion.map((fila) => fila.lote_id)).size,
    jabas: produccion.reduce((total, fila) => total + numeroSeguro(fila.total_jabas), 0)
  }
}

export function formatearUltimaLecturaLote(fechaHora, ahora = new Date()) {
  if (!fechaHora) return '—'

  const fecha = new Date(fechaHora)
  if (Number.isNaN(fecha.getTime())) return '—'

  const hora = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  const esHoy =
    fecha.getFullYear() === ahora.getFullYear() &&
    fecha.getMonth() === ahora.getMonth() &&
    fecha.getDate() === ahora.getDate()

  if (esHoy) return `Hoy ${hora}`

  return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)} ${hora}`
}

export function reemplazarProduccionLotes(_actual, siguiente) {
  return siguiente.map((fila) => ({ ...fila }))
}

export function esErrorConexionProduccionLotes(error) {
  const mensaje = String(error?.message ?? error ?? '').toLocaleLowerCase('es-PE')
  return (
    mensaje.includes('failed to fetch') ||
    mensaje.includes('networkerror') ||
    mensaje.includes('network error') ||
    mensaje.includes('load failed') ||
    mensaje.includes('fetch')
  )
}

function compararTexto(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', {
    sensitivity: 'base',
    numeric: true
  })
}

function normalizarTexto(valor) {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-PE')
}

function numeroSeguro(valor) {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : 0
}

function dosDigitos(valor) {
  return String(valor).padStart(2, '0')
}
