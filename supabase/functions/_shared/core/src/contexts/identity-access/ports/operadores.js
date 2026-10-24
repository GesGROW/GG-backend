/**
 * Almacenamiento local de autorizaciones; no decide su vigencia.
 * @typedef {Object} PuertoOperadores
 * @property {(dni: string) => Promise<Object|undefined>} obtener
 * @property {(operador: Object) => Promise<void>} guardar
 */
export const operacionesOperadores = Object.freeze(['obtener', 'guardar'])
