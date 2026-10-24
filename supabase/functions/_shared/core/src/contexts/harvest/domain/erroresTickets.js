export class ErrorDominioTickets extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = new.target.name
  }
}

export class DatoDeTicketsInvalido extends ErrorDominioTickets {
  constructor(campo) {
    super(`El campo ${campo} debe ser un identificador no vacío.`)
    this.campo = campo
  }
}

export class LoteYaAsignado extends ErrorDominioTickets {
  constructor(loteId) {
    super(`El lote de tickets ${loteId} ya está asignado.`)
    this.loteId = loteId
  }
}

export class TicketYaUtilizado extends ErrorDominioTickets {
  constructor(codigoTicket) {
    super(`El ticket ${codigoTicket} ya fue utilizado para registrar cosecha.`)
    this.codigoTicket = codigoTicket
  }
}

export class TicketSinLote extends ErrorDominioTickets {
  constructor(codigoTicket, loteId = null) {
    super(
      `No se encontró el lote de tickets ${loteId ?? ''} del ticket ${codigoTicket}.`
    )
    this.codigoTicket = codigoTicket
    this.loteId = loteId
  }
}

export class LoteSinAsignar extends ErrorDominioTickets {
  constructor(loteId) {
    super(`El lote de tickets ${loteId} todavía no está asignado.`)
    this.loteId = loteId
  }
}

export class TicketDuplicado extends ErrorDominioTickets {
  constructor(codigoTicket) {
    super(`El código de ticket ${codigoTicket} ya existe.`)
    this.codigoTicket = codigoTicket
  }
}

export class TicketNoEncontrado extends ErrorDominioTickets {
  constructor(codigoTicket) {
    super(`No se encontró el ticket ${codigoTicket}.`)
    this.codigoTicket = codigoTicket
  }
}

export class LoteDeTicketsDuplicado extends ErrorDominioTickets {
  constructor(loteId) {
    super(`El lote de tickets ${loteId} ya existe.`)
    this.loteId = loteId
  }
}

export class CampaniaTicketIncorrecta extends ErrorDominioTickets {
  constructor(codigoTicket) {
    super(`El ticket ${codigoTicket} y su lote no corresponden a la campaña operativa.`)
    this.codigoTicket = codigoTicket
  }
}

export class SesionCosechaInvalida extends ErrorDominioTickets {
  constructor(sesionId) {
    super(
      'La sesión de cosecha no está activa o no corresponde al operador y la campaña.'
    )
    this.sesionId = sesionId
  }
}
