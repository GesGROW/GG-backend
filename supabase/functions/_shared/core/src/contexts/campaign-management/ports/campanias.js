/**
 * Contexto local y caché de campaña. Conserva los formatos actuales.
 * @typedef {Object} PuertoCampanias
 * @property {() => Promise<Object|string|undefined>} obtenerActiva
 * @property {(id: string) => Promise<void>} seleccionar
 * @property {(id: string) => Promise<Object|undefined>} obtenerCache
 * @property {(cache: Object) => Promise<void>} guardarCache
 */
export const operacionesCampanias = Object.freeze([
  'obtenerActiva',
  'seleccionar',
  'obtenerCache',
  'guardarCache'
])
