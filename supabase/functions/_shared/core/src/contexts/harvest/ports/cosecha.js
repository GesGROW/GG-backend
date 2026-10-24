/**
 * Consulta y escritura operacional local.
 * Las cuatro escrituras son indivisibles: cambio local y trabajo pendiente se
 * confirman juntos o no se confirma ninguno. El resultado de escritura es el
 * objeto existente, opaco para Application; no debe interpretar su contenido.
 * @typedef {Object} PuertoCosecha
 * @property {(codigo: string) => Promise<Object|undefined>} obtenerTicket
 * @property {() => Promise<Array>} obtenerLotes
 * @property {(dni: string) => Promise<Object|undefined>} obtenerSesionActivaJabero
 * @property {(sesionId: string) => Promise<number>} contarLecturasSesion
 * @property {(sesionId: string, dni: string) => Promise<number>} contarLecturasCosechador
 * @property {(asignacion: Object) => Promise<Object>} guardarAsignacion Atómica.
 * @property {(sesion: Object, dniOperador: string) => Promise<Object>} iniciarSesion Atómica.
 * @property {(lectura: Object, dniOperador: string) => Promise<Object>} registrarLectura Atómica.
 * @property {(sesionId: string, dniOperador: string) => Promise<Object>} cerrarSesion Atómica.
 */
export const operacionesCosecha = Object.freeze([
  'obtenerTicket',
  'obtenerLotes',
  'obtenerSesionActivaJabero',
  'contarLecturasSesion',
  'contarLecturasCosechador',
  'guardarAsignacion',
  'iniciarSesion',
  'registrarLectura',
  'cerrarSesion'
])
