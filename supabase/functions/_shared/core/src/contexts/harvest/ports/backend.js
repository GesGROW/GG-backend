// Contrato de backend del contexto: datos o errores neutrales; sin transporte.
export const operacionesBackendHarvest = Object.freeze([
  'obtenerSnapshotHarvest',
  'asignarTicket',
  'listarLotesActivos',
  'iniciarSesionLectura',
  'registrarLecturaJaba',
  'cerrarSesionLectura',
  'obtenerProduccionDiaria',
  'obtenerProduccionLotes',
  'obtenerResumenCampania',
  'obtenerRankingCosechadores'
])
