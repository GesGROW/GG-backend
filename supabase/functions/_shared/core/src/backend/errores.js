// Contrato de errores independiente del proveedor. El estado numérico conserva
// la clasificación de errores temporales que usa la cola offline.
export class ErrorBackend extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'ErrorBackend'
    if (Number.isFinite(status)) this.status = status
  }
}

export class OperacionNoDisponible extends ErrorBackend {
  constructor(message, opciones) {
    super(message, opciones)
    this.name = 'OperacionNoDisponible'
  }
}
