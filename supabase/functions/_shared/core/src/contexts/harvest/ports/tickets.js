/**
 * @typedef {import('../domain/loteDeTickets.js').LoteDeTickets} LoteDeTickets
 * @typedef {import('../domain/ticket.js').Ticket} Ticket
 * @typedef {import('../domain/catalogoDeTickets.js').CatalogoDeTickets} CatalogoDeTickets
 *
 * Persistencia específica del nuevo modelo Harvest, separada del puerto legacy.
 * Nunca entrega filas: recibe agregados y devuelve un catálogo de dominio.
 * @typedef {Object} RepositorioTicketsHarvest
 * @property {(generacion: {campaniaId: string, lotes: LoteDeTickets[], tickets: Ticket[]}) => Promise<void>} guardarLotesConTickets
 * Confirma TODA la generación en una transacción; ante un error no guarda nada.
 * @property {(consulta: {campaniaId: string, codigoTicket: string}) => Promise<CatalogoDeTickets>} resolverCatalogoPorCodigo
 * Consulta puntual indexada. No requiere cargar la campaña completa.
 * @property {(solicitud: {campaniaId: string, codigoTicket: string, dniOperador: string, dniCosechador: string, operacionId: string}) => Promise<CatalogoDeTickets>} asignarLoteDesdeTicket
 * Resuelve y asigna en UNA transacción, con autorización del operador por
 * campaña y resolución Workforce. Confirma o revierte también el recibo de
 * operación y el alta provisional del trabajador. PostgreSQL es la autoridad.
 * @property {(solicitud: {campaniaId: string, codigoTicket: string, dniOperador: string, sesionId: string, registroId: string, fechaHora: string, operacionId: string}) => Promise<CatalogoDeTickets>} registrarCosecha
 * Deriva atribución desde la asignación y confirma consumo, registro y recibo
 * atómicamente. Mismo UUID/ticket/contexto devuelve el registro original;
 * otro UUID para un ticket consumido rechaza. No recibe trabajador del cliente.
 * @typedef {Object} GeneradorCodigoTicket
 * @property {(contexto: {campaniaId: string, loteId: string, indice: number}) => Promise<string>|string} generar
 * La representación del código pertenece a la implementación inyectada.
 */
export const operacionesRepositorioTicketsHarvest = Object.freeze([
  'guardarLotesConTickets',
  'resolverCatalogoPorCodigo',
  'asignarLoteDesdeTicket',
  'registrarCosecha'
])

export class ErrorPersistenciaTickets extends Error {
  constructor(mensaje, { causa } = {}) {
    super(mensaje, { cause: causa })
    this.name = 'ErrorPersistenciaTickets'
  }
}
