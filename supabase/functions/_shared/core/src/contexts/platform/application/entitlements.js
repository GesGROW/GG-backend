import { MODULOS, Modulo, ModuloNoHabilitado } from '../domain/modulo.js'
import { validarEntitlements } from '../ports/entitlements.js'
import { requerido } from '../domain/contratos.js'

// El puerto resuelve en servidor: la selección del Tenant es una solicitud,
// validada nuevamente contra la sesión/membresía. No recibe módulos de la UI.
export function crearEntitlements({ entitlements }) {
  const puerto = validarEntitlements(entitlements)
  const puedeUsarModulo = async (tenantId, modulo) => {
    requerido(tenantId, 'Tenant')
    new Modulo(modulo)
    return (await puerto.puedeUsarModulo(tenantId, modulo)) === true
  }
  return Object.freeze({
    puedeUsarModulo,
    async exigirModulo(tenantId, modulo) {
      if (!(await puedeUsarModulo(tenantId, modulo)))
        throw new ModuloNoHabilitado(modulo)
    },
    async modulosHabilitados(tenantId) {
      const resultados = await Promise.all(
        MODULOS.map(async (m) => ((await puedeUsarModulo(tenantId, m)) ? m : null))
      )
      return resultados.filter(Boolean)
    }
  })
}
