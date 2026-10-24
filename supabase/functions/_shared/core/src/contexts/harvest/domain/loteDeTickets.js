import { AsignacionDeLote } from './asignacionDeLote.js'
import { LoteSinAsignar, LoteYaAsignado } from './erroresTickets.js'
import { validarIdentificador } from './identificadoresTickets.js'

// Agregado de asignación. No contiene ni controla el uso de los tickets.
export class LoteDeTickets {
  #asignacion = null

  constructor({ id, campaniaId, tenantId }) {
    this.id = validarIdentificador(id, 'id')
    this.campaniaId = validarIdentificador(campaniaId, 'campaniaId')
    if (tenantId !== undefined)
      this.tenantId = validarIdentificador(tenantId, 'tenantId')
    Object.freeze(this)
  }

  get estado() {
    return this.#asignacion ? 'ASIGNADO' : 'DISPONIBLE'
  }

  get asignacion() {
    return this.#asignacion
  }

  asignar({ trabajadorId, operacionId }) {
    const propuesta = new AsignacionDeLote({
      loteId: this.id,
      trabajadorId,
      operacionId
    })
    if (this.#asignacion) {
      if (
        this.#asignacion.operacionId === propuesta.operacionId &&
        this.#asignacion.trabajadorId === propuesta.trabajadorId
      )
        return this.#asignacion
      throw new LoteYaAsignado(this.id)
    }
    this.#asignacion = propuesta
    return this.#asignacion
  }

  obtenerAsignacion() {
    if (!this.#asignacion) throw new LoteSinAsignar(this.id)
    return this.#asignacion
  }
}
