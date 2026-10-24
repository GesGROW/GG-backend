/** @typedef {import('./ports/campanias.js').PuertoCampanias} PuertoCampanias */
// API pública del contexto. Los demás contextos no importan sus internos.
export { crearIngresarCampania } from './application/ingresarCampania.js'
export { resolverCampaniaOperador } from './domain/campaniaOperador.js'
export {
  obtenerVariedadesLote,
  seleccionarVariedadLote
} from './domain/variedadesLote.js'
export { operacionesCampanias } from './ports/campanias.js'
export { operacionesBackendCampaignManagement } from './ports/backend.js'
export { Campania } from './domain/campania.js'
export { crearGestionCampanias } from './application/gestion.js'
export { LoteOperativoCampania } from './domain/loteOperativoCampania.js'
export { crearVinculacionParcelas } from './application/parcelasOperativas.js'
