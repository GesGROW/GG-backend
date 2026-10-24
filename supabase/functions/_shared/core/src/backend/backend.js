// Puerto de la aplicación: recibe una implementación en el punto de arranque.
// No importa infraestructura, SDK ni conoce nombres de funciones remotas.
let implementacion

export const backend = Object.freeze({
  validarOperador: (...args) => obtenerBackend().validarOperador(...args),
  obtenerCacheOperativa: (...args) => obtenerBackend().obtenerCacheOperativa(...args),
  obtenerSnapshotHarvest: (...args) => obtenerBackend().obtenerSnapshotHarvest(...args),
  asignarTicket: (...args) => obtenerBackend().asignarTicket(...args),
  registrarJabero: (...args) => obtenerBackend().registrarJabero(...args),
  listarLotesActivos: (...args) => obtenerBackend().listarLotesActivos(...args),
  iniciarSesionLectura: (...args) => obtenerBackend().iniciarSesionLectura(...args),
  registrarLecturaJaba: (...args) => obtenerBackend().registrarLecturaJaba(...args),
  cerrarSesionLectura: (...args) => obtenerBackend().cerrarSesionLectura(...args),
  obtenerProduccionDiaria: (...args) =>
    obtenerBackend().obtenerProduccionDiaria(...args),
  obtenerProduccionLotes: (...args) => obtenerBackend().obtenerProduccionLotes(...args),
  obtenerResumenCampania: (...args) => obtenerBackend().obtenerResumenCampania(...args),
  obtenerRankingCosechadores: (...args) =>
    obtenerBackend().obtenerRankingCosechadores(...args)
})

export function configurarBackend(adapter) {
  for (const operacion of Object.keys(backend)) {
    if (typeof adapter?.[operacion] !== 'function')
      throw new Error(`Falta la operación de backend: ${operacion}`)
  }
  implementacion = adapter
}

function obtenerBackend() {
  if (!implementacion) throw new Error('No se configuró el backend de la aplicación.')
  return implementacion
}
