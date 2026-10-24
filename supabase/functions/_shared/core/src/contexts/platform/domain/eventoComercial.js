import { requerido, fecha } from './contratos.js'

function inmutable(valor) {
  if (valor && typeof valor === 'object') {
    for (const hijo of Object.values(valor)) inmutable(hijo)
    Object.freeze(valor)
  }
  return valor
}

// Reconstitución de un hecho del servidor, conservando snapshots completos.
export class EventoComercial {
  constructor({
    id,
    tenantId,
    tipoEvento,
    fase,
    actor,
    fechaHora,
    effectiveAt,
    estadoAnterior,
    estadoNuevo,
    motivo,
    contexto = {}
  }) {
    this.id = requerido(id, 'Evento')
    this.tenantId = requerido(tenantId, 'Tenant')
    this.tipoEvento = requerido(tipoEvento, 'tipo de evento')
    if (!['BASELINE', 'PROGRAMADA', 'APLICADA', 'RECHAZADA'].includes(fase))
      throw new Error('Fase de auditoría inválida.')
    this.fase = fase
    this.fechaHora = fecha(fechaHora)
    this.effectiveAt = fecha(effectiveAt)
    this.motivo = requerido(motivo, 'motivo')
    if (!actor?.tipo) throw new Error('Actor de auditoría requerido.')
    for (const [campo, valor] of Object.entries({
      actor,
      estadoAnterior,
      estadoNuevo,
      contexto
    }))
      this[campo] = inmutable(structuredClone(valor))
    Object.freeze(this)
  }
}
