/**
 * Información pública mínima de Workforce, inyectada por la coordinación.
 * Se conservan los DTO actuales; Harvest no define Trabajador ni roles laborales.
 * @typedef {Object} WorkforceParaHarvest
 * @property {(dni: string) => Promise<Object|undefined>} obtenerTrabajador
 * @property {(trabajador: Object) => void} validarJaberoParaInicio
 * @property {(trabajador: Object|undefined) => void} validarJaberoParaLectura
 */
export const operacionesWorkforceParaHarvest = Object.freeze([
  'obtenerTrabajador',
  'validarJaberoParaInicio',
  'validarJaberoParaLectura'
])
