import { validarIdentificador } from './identificadoresTickets.js'

// La identidad de operación está acotada al lote; se recibe del llamador.
export class AsignacionDeLote {
  constructor({ loteId, trabajadorId, operacionId }) {
    this.loteId = validarIdentificador(loteId, 'loteId')
    this.trabajadorId = validarIdentificador(trabajadorId, 'trabajadorId')
    this.operacionId = validarIdentificador(operacionId, 'operacionId')
    Object.freeze(this)
  }
}
