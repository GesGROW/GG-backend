/** @typedef {import('./ports/cosecha.js').PuertoCosecha} PuertoCosecha */
// API pública del contexto. Los demás contextos no importan sus internos.
export { crearAsignarTicket } from './application/asignarTicket.js'
export { crearIniciarSesionLectura } from './application/iniciarSesionLectura.js'
export { crearRegistrarLecturaJaba } from './application/registrarLecturaJaba.js'
export { crearCerrarSesionLectura } from './application/cerrarSesionLectura.js'
export { asignarTicket } from './application/asignacionTickets.js'
export {
  listarLotesActivos,
  iniciarSesionLectura,
  registrarLecturaJaba,
  cerrarSesionLectura
} from './application/lecturaJabas.js'
export {
  FILTROS_ASIGNADOS_HOY,
  perteneceAlDiaLocal,
  filtrarAsignacionesHoy,
  filtrarAsignaciones,
  obtenerBadgeEstadoAsignacion,
  formatearHoraAsignacion
} from './application/queries/asignadosHoy.js'
export {
  ORDEN_COSECHADORES_JABAS,
  agruparLecturasPorCosechador,
  buscarCosechadoresJabas,
  ordenarCosechadoresJabas,
  resumirCosechadoresJabas,
  formatearHoraUltimaLectura
} from './application/queries/cosechadoresJabas.js'
export {
  FILTROS_SESIONES_LECTURA,
  formatearFechaSesion,
  enriquecerSesionLectura,
  ordenarSesionesLectura,
  filtrarSesionesLectura,
  formatearPeriodoSesion,
  obtenerBadgeEstadoSesion
} from './application/queries/sesionesLectura.js'
export {
  obtenerProduccionDiaria,
  obtenerZonaHorariaCliente,
  normalizarProduccionDiaria,
  resumirProduccionDiaria,
  formatearFechaCalendario,
  reemplazarProduccionDiaria,
  esErrorConexionProduccion
} from './application/reports/produccionDiaria.js'
export {
  ORDEN_PRODUCCION_LOTES,
  obtenerProduccionLotes,
  normalizarProduccionLotes,
  buscarProduccionLotes,
  ordenarProduccionLotes,
  resumirProduccionLotes,
  formatearUltimaLecturaLote,
  reemplazarProduccionLotes,
  esErrorConexionProduccionLotes
} from './application/reports/produccionLotes.js'
export {
  obtenerRankingCosechadores,
  normalizarRankingCosechadores,
  buscarRankingCosechadores,
  resumirRankingCosechadores,
  formatearUltimaLectura,
  reemplazarRankingCosechadores,
  esErrorConexionRanking
} from './application/reports/rankingCosechadores.js'
export {
  obtenerResumenCampania,
  normalizarResumenCampania,
  reemplazarResumenCampania,
  formatearNumeroResumen,
  formatearFechaInicioCampania,
  formatearUltimaActividad,
  esErrorConexionResumenCampania
} from './application/reports/resumenCampania.js'
export {
  validarTicketDisponible,
  validarTicketParaLectura,
  validarNuevaSesion,
  validarLoteOperativo,
  validarInicioNoRechazado
} from './domain/validacionesLectura.js'
export { operacionesCosecha } from './ports/cosecha.js'
export { operacionesWorkforceParaHarvest } from './ports/workforce.js'
export { operacionesCampaignManagementParaHarvest } from './ports/campaignManagement.js'
export { operacionesBackendHarvest } from './ports/backend.js'
export { LoteDeTickets } from './domain/loteDeTickets.js'
export { Ticket } from './domain/ticket.js'
export { AsignacionDeLote } from './domain/asignacionDeLote.js'
export { RegistroCosecha } from './domain/registroCosecha.js'
export { CatalogoDeTickets } from './domain/catalogoDeTickets.js'
export { crearGenerarLotesDeTickets } from './application/generarLotesDeTickets.js'
export { crearAdministracionHarvest } from './application/administracion.js'
export { crearResolverCatalogoDeTickets } from './application/resolverCatalogoDeTickets.js'
export { crearAsignarLoteDeTickets } from './application/asignarLoteDeTickets.js'
export { crearRegistrarCosecha } from './application/registrarCosecha.js'
export {
  crearSolicitarAsignacionHarvest,
  crearSolicitarConsumoHarvest,
  crearSolicitarRegistroCosecha
} from './application/solicitudesHarvestOffline.js'
export { operacionesHarvestLocal } from './ports/harvestLocal.js'
export { validarSnapshotHarvest } from './domain/snapshotTickets.js'
export {
  modeloOperativoHarvest,
  PoliticaHarvestDesconocida,
  EscrituraLegacyRetirada,
  CampaniaSinCutover
} from './domain/cutoverHarvest.js'
export { crearOperacionSegunCutover } from './application/operarSegunCutover.js'
export {
  operacionesRepositorioTicketsHarvest,
  ErrorPersistenciaTickets
} from './ports/tickets.js'
export {
  ErrorDominioTickets,
  DatoDeTicketsInvalido,
  LoteYaAsignado,
  TicketYaUtilizado,
  TicketSinLote,
  LoteSinAsignar,
  TicketDuplicado,
  TicketNoEncontrado,
  LoteDeTicketsDuplicado,
  CampaniaTicketIncorrecta,
  SesionCosechaInvalida
} from './domain/erroresTickets.js'
export { crearReportesHarvest } from './application/reports/reportesPortal.js'
