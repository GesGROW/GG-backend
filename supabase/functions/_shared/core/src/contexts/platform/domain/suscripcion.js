import { requerido, intervalo, vigente } from './contratos.js'

export const ESTADOS_SUSCRIPCION = Object.freeze([
  'TRIAL',
  'ACTIVA',
  'SUSPENDIDA',
  'CANCELADA',
  'VENCIDA'
])

export class Suscripcion {
  constructor({ id, tenantId, planId, estado, desde, hasta = null }) {
    this.id = requerido(id, 'Suscripción')
    this.tenantId = requerido(tenantId, 'Tenant')
    this.planId = requerido(planId, 'Plan')
    if (!ESTADOS_SUSCRIPCION.includes(estado))
      throw new Error('Estado de suscripción inválido.')
    this.estado = estado
    Object.assign(this, intervalo(desde, hasta))
    if (estado === 'TRIAL' && this.hasta === null)
      throw new Error('El trial requiere vencimiento.')
    Object.freeze(this)
  }

  vigente(ahora) {
    return (
      ['TRIAL', 'ACTIVA'].includes(this.estado) &&
      vigente(this.desde, this.hasta, ahora)
    )
  }
}
