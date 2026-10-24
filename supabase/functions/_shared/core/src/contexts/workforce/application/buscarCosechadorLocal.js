import { resolverCosechadorLocal } from '../domain/cosechadorLocal.js'

export function crearBuscarCosechadorLocal({ trabajadores, campaignManagement }) {
  return async function buscarCosechadorLocal(
    dni,
    { permitirProvisional = false } = {}
  ) {
    const dniNormalizado = String(dni ?? '').trim()
    if (!/^\d{8}$/.test(dniNormalizado)) {
      throw new Error('El DNI debe contener 8 dígitos.')
    }
    const [trabajador, campania] = await Promise.all([
      trabajadores.obtener(dniNormalizado),
      campaignManagement.obtenerActiva()
    ])
    return resolverCosechadorLocal(dniNormalizado, trabajador, campania, {
      permitirProvisional
    })
  }
}
