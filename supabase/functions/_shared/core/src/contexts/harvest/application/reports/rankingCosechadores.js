export async function obtenerRankingCosechadores(
  dniOperador,
  consultar,
  periodo = 'HOY'
) {
  if (typeof consultar !== 'function') {
    throw new Error('No se configuró el backend para obtener el ranking.')
  }

  if (!['HOY', 'SEMANA', 'MES', 'CAMPANIA'].includes(periodo)) {
    throw new Error('Período de ranking inválido.')
  }

  let data
  try {
    data = await consultar({ dniOperador, periodo })
  } catch (error) {
    throw new Error(error.message || 'No se pudo obtener el ranking de cosechadores.')
  }

  return normalizarRankingCosechadores(data)
}

export function normalizarRankingCosechadores(data) {
  if (!data || data.ok !== true || !Array.isArray(data.ranking)) {
    throw new Error('La respuesta del ranking no tiene el formato esperado.')
  }

  const ranking = data.ranking
    .map((fila) => ({
      posicion: numeroSeguro(fila.posicion),
      cosechador_dni: String(fila.cosechador_dni ?? '').trim(),
      cosechador: String(fila.cosechador ?? '').trim(),
      total_jabas: numeroSeguro(fila.total_jabas),
      ultima_lectura: fila.ultima_lectura ? String(fila.ultima_lectura) : null
    }))
    .filter((fila) => fila.total_jabas > 0)
    .sort(compararRanking)

  return {
    ok: true,
    campania: String(data.campania ?? '').trim(),
    ranking
  }
}

export function buscarRankingCosechadores(ranking, busqueda = '') {
  const consulta = normalizarTexto(busqueda)
  if (!consulta) return [...ranking]

  return ranking.filter((fila) =>
    [fila.cosechador, fila.cosechador_dni]
      .map(normalizarTexto)
      .some((valor) => valor.includes(consulta))
  )
}

export function resumirRankingCosechadores(ranking) {
  return {
    cosechadores: ranking.length,
    jabas: ranking.reduce((total, fila) => total + numeroSeguro(fila.total_jabas), 0)
  }
}

export function formatearUltimaLectura(fechaHora, ahora = new Date()) {
  if (!fechaHora) return '—'

  const fecha = new Date(fechaHora)
  if (Number.isNaN(fecha.getTime())) return '—'

  const hora = `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  const esHoy =
    fecha.getFullYear() === ahora.getFullYear() &&
    fecha.getMonth() === ahora.getMonth() &&
    fecha.getDate() === ahora.getDate()

  if (esHoy) return hora

  return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)} ${hora}`
}

export function reemplazarRankingCosechadores(_actual, siguiente) {
  return siguiente.map((fila) => ({ ...fila }))
}

export function esErrorConexionRanking(error) {
  const mensaje = String(error?.message ?? error ?? '').toLocaleLowerCase('es-PE')
  return (
    mensaje.includes('failed to fetch') ||
    mensaje.includes('networkerror') ||
    mensaje.includes('network error') ||
    mensaje.includes('load failed') ||
    mensaje.includes('fetch')
  )
}

function compararRanking(a, b) {
  const porJabas = b.total_jabas - a.total_jabas
  if (porJabas !== 0) return porJabas

  const porNombre = normalizarTexto(a.cosechador).localeCompare(
    normalizarTexto(b.cosechador),
    'es'
  )
  if (porNombre !== 0) return porNombre

  return a.cosechador_dni.localeCompare(b.cosechador_dni, 'es')
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
