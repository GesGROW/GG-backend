import { Modulo } from './modulo.js'
import { requerido, intervalo, vigente } from './contratos.js'

export class ModuloContratado {
  constructor({
    tenantId,
    suscripcionId,
    modulo,
    habilitado = true,
    origen = 'EXCEPCION',
    desde,
    hasta = null
  }) {
    this.tenantId = requerido(tenantId, 'Tenant')
    this.suscripcionId = requerido(suscripcionId, 'Suscripción')
    this.modulo = new Modulo(modulo).codigo
    if (typeof habilitado !== 'boolean') throw new Error('Entitlement inválido.')
    if (!['PLAN', 'ADD_ON', 'EXCEPCION'].includes(origen))
      throw new Error('Origen inválido.')
    this.habilitado = habilitado
    this.origen = origen
    Object.assign(this, intervalo(desde, hasta))
    Object.freeze(this)
  }

  permite(suscripcion, ahora) {
    if (suscripcion.tenantId !== this.tenantId || suscripcion.id !== this.suscripcionId)
      throw new Error('Relación cross-tenant o suscripción incorrecta.')
    return (
      this.habilitado &&
      suscripcion.vigente(ahora) &&
      vigente(this.desde, this.hasta, ahora)
    )
  }
}

export { ModuloContratado as TenantModuleEntitlement }
