/**
 * @typedef {Object} PuertoTrabajadores
 * @property {(dni: string) => Promise<Object|undefined>} obtener
 * @property {(dniOperador: string, dni: string) => Promise<Object>} registrarJabero
 * registrarJabero confirma conjuntamente el cambio laboral local y su trabajo
 * pendiente, utilizando la transacción existente. No se divide esa escritura.
 */
export const operacionesTrabajadores = Object.freeze(['obtener', 'registrarJabero'])
