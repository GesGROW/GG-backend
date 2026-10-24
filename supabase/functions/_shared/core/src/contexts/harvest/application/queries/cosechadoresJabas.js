export const ORDEN_COSECHADORES_JABAS = Object.freeze({
  MAS_JABAS: 'MAS_JABAS',
  RECIENTES: 'RECIENTES',
  AZ: 'AZ'
})

function textoNormalizado(valor) {
  return String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
}

function fechaValida(valor) {
  if (!valor) return null
  const timestamp = Date.parse(valor)
  return Number.isNaN(timestamp) ? null : { valor, timestamp }
}

function compararTexto(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', {
    sensitivity: 'base'
  })
}

function compararRecenciaDesc(a, b) {
  const fechaA = fechaValida(a.ultimaLectura)?.timestamp ?? -Infinity
  const fechaB = fechaValida(b.ultimaLectura)?.timestamp ?? -Infinity
  return fechaB - fechaA
}

export function agruparLecturasPorCosechador(lecturas, trabajadores = []) {
  const nombresPorDni = new Map(
    trabajadores.map((trabajador) => [String(trabajador.dni), trabajador.nombre])
  )
  const grupos = new Map()

  for (const lectura of lecturas) {
    const dni = String(lectura.cosechador_dni ?? '')
    let grupo = grupos.get(dni)

    if (!grupo) {
      grupo = {
        dni,
        nombre: '',
        jabas: 0,
        ultimaLectura: null
      }
      grupos.set(dni, grupo)
    }

    grupo.jabas += 1

    if (lectura.cosechador?.trim()) {
      grupo.nombre = lectura.cosechador.trim()
    }

    const fecha = fechaValida(lectura.fecha_hora)
    const ultima = fechaValida(grupo.ultimaLectura)
    if (fecha && (!ultima || fecha.timestamp > ultima.timestamp)) {
      grupo.ultimaLectura = fecha.valor
    }
  }

  return [...grupos.values()].map((grupo) => ({
    ...grupo,
    nombre: nombresPorDni.get(grupo.dni)?.trim() || grupo.nombre || grupo.dni
  }))
}

export function buscarCosechadoresJabas(grupos, busqueda = '') {
  const termino = textoNormalizado(busqueda)
  if (!termino) return [...grupos]

  return grupos.filter((grupo) =>
    textoNormalizado(`${grupo.nombre} ${grupo.dni}`).includes(termino)
  )
}

export function ordenarCosechadoresJabas(
  grupos,
  orden = ORDEN_COSECHADORES_JABAS.MAS_JABAS
) {
  return [...grupos].sort((a, b) => {
    if (orden === ORDEN_COSECHADORES_JABAS.RECIENTES) {
      return compararRecenciaDesc(a, b) || compararTexto(a.nombre, b.nombre)
    }

    if (orden === ORDEN_COSECHADORES_JABAS.AZ) {
      return compararTexto(a.nombre, b.nombre) || compararTexto(a.dni, b.dni)
    }

    return (
      b.jabas - a.jabas ||
      compararRecenciaDesc(a, b) ||
      compararTexto(a.nombre, b.nombre)
    )
  })
}

export function resumirCosechadoresJabas(grupos) {
  return {
    cosechadores: grupos.length,
    jabas: grupos.reduce((total, grupo) => total + grupo.jabas, 0)
  }
}

export function formatearHoraUltimaLectura(fechaHora) {
  const fecha = fechaValida(fechaHora)
  if (!fecha) return '—'

  return new Date(fecha.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
}
