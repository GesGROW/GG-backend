/**
 * Reserva + comando (+ lectura en consumo) se confirman indivisiblemente.
 * El servidor y las intenciones locales son proyecciones distintas.
 * @typedef {Object} HarvestLocal
 * @property {(solicitud: Object) => Promise<Object>} reservarAsignacion
 * @property {(solicitud: Object) => Promise<Object>} reservarConsumo
 * @property {(campaniaId: string) => Promise<'LEGACY'|'HARVEST'>} obtenerModeloOperativo
 */
export const operacionesHarvestLocal = Object.freeze([
  'reservarAsignacion',
  'reservarConsumo',
  'obtenerModeloOperativo'
])
