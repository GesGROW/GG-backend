import { exigirMismoTenant, tenantDeRecurso } from '../domain/empresaCliente.js'
import { validarTenantContext } from '../ports/tenantContext.js'

export function crearResolverTenantContext({ campanias, tenantContext }) {
  if (tenantContext) validarTenantContext(tenantContext)
  // La campaña se carga del puerto de persistencia, no del DTO enviado por UI.
  return async (campaniaId, ...recursos) => {
    const cache = await campanias.obtenerCache(campaniaId)
    const campania = cache?.campania ?? cache
    if (!campania) throw new Error('La campaña no tiene ownership local confirmado.')
    const tenantId = exigirMismoTenant(campania, ...recursos)
    if (tenantContext) {
      const contexto = await tenantContext.obtener()
      if (
        !(contexto?.tenantId ?? contexto?.tenant_id) ||
        tenantDeRecurso(contexto) !== tenantId
      )
        throw new Error('La campaña no pertenece al TenantContext autorizado.')
    }
    return Object.freeze({ tenantId, campaniaId })
  }
}
