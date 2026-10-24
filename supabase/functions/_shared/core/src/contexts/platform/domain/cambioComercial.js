import { requerido, fecha } from './contratos.js'
import { Modulo } from './modulo.js'

export const PERMISO_COMERCIAL = 'subscription.manage'
export class ConflictoVersionComercial extends Error {
  constructor(mensaje = 'Conflicto de versión comercial. Actualice la suscripción.') {
    super(mensaje)
    this.name = 'ConflictoVersionComercial'
  }
}
export const EVENTOS_COMERCIALES = Object.freeze({
  crearSuscripcion: 'CREAR_SUSCRIPCION',
  cambiarPlan: 'CAMBIAR_PLAN',
  renovarSuscripcion: 'RENOVAR_SUSCRIPCION',
  suspenderSuscripcion: 'SUSPENDER_SUSCRIPCION',
  reactivarSuscripcion: 'REACTIVAR_SUSCRIPCION',
  cancelarSuscripcion: 'CANCELAR_SUSCRIPCION',
  habilitarModulo: 'HABILITAR_MODULO',
  deshabilitarModulo: 'DESHABILITAR_MODULO'
})

export class CambioComercial {
  constructor({
    operacionId,
    tenantId,
    tipoEvento,
    datos = {},
    motivo,
    effectiveAt = null,
    versionBase
  }) {
    this.operacionId = requerido(operacionId, 'ID idempotente de operación')
    this.tenantId = requerido(tenantId, 'Tenant')
    if (!Object.values(EVENTOS_COMERCIALES).includes(tipoEvento))
      throw new Error('Evento comercial desconocido.')
    this.tipoEvento = tipoEvento
    this.motivo = requerido(motivo, 'motivo comercial')
    this.effectiveAt = effectiveAt === null ? null : fecha(effectiveAt)
    // Opcional para conservar los contratos F6.4. La entrada del Portal la
    // requiere y el servidor siempre la contrasta contra el estado persistido.
    if (versionBase !== undefined) {
      if (!/^\d+$/.test(String(versionBase)))
        throw new Error('Versión comercial inválida.')
      this.versionBase = String(versionBase)
    }
    // Lista explícita: actor, autoridad y reloj nunca proceden del formulario.
    const parametros = {}
    if (['CREAR_SUSCRIPCION', 'CAMBIAR_PLAN'].includes(tipoEvento))
      parametros.planId = requerido(datos.planId, 'Plan')
    if (tipoEvento === 'CREAR_SUSCRIPCION') {
      parametros.estado = datos.estado ?? 'ACTIVA'
      if (!['ACTIVA', 'TRIAL'].includes(parametros.estado))
        throw new Error('Estado inicial inválido.')
    }
    if (
      ['CREAR_SUSCRIPCION', 'RENOVAR_SUSCRIPCION', 'HABILITAR_MODULO'].includes(
        tipoEvento
      )
    )
      parametros.hasta = datos.hasta == null ? null : fecha(datos.hasta)
    if (tipoEvento === 'RENOVAR_SUSCRIPCION' && parametros.hasta === null)
      throw new Error('Renovar requiere una fecha final.')
    if (
      tipoEvento === 'CREAR_SUSCRIPCION' &&
      parametros.estado === 'TRIAL' &&
      parametros.hasta === null
    )
      throw new Error('El trial requiere vencimiento.')
    if (['HABILITAR_MODULO', 'DESHABILITAR_MODULO'].includes(tipoEvento))
      parametros.modulo = new Modulo(datos.modulo).codigo
    if (tipoEvento === 'HABILITAR_MODULO') {
      parametros.origen = datos.origen ?? 'ADD_ON'
      if (!['ADD_ON', 'EXCEPCION'].includes(parametros.origen))
        throw new Error('Origen comercial inválido.')
    }
    this.parametros = Object.freeze(parametros)
    Object.freeze(this)
  }
}
