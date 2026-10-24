export const TENANT_INICIAL_ID = '00000000-0000-4000-8000-000000000001'

export class EmpresaCliente {
  constructor({ id, nombre, codigo, estado = 'ACTIVA', createdAt }) {
    for (const [campo, valor] of Object.entries({ id, nombre, codigo })) {
      if (typeof valor !== 'string' || !valor.trim())
        throw new Error(`EmpresaCliente requiere ${campo}.`)
    }
    if (!['ACTIVA', 'SUSPENDIDA', 'INACTIVA'].includes(estado))
      throw new Error('Estado de EmpresaCliente inválido.')
    if (!createdAt || !Number.isFinite(Date.parse(createdAt)))
      throw new Error('EmpresaCliente requiere createdAt válido.')
    this.id = id.trim()
    this.nombre = nombre.trim()
    this.codigo = codigo.trim().toUpperCase()
    this.estado = estado
    this.createdAt = new Date(createdAt).toISOString()
    Object.freeze(this)
  }
}

export { EmpresaCliente as Tenant }

export function tenantDeRecurso(recurso) {
  if (
    recurso?.tenantId !== undefined &&
    recurso?.tenant_id !== undefined &&
    recurso.tenantId !== recurso.tenant_id
  )
    throw new Error('El recurso tiene ownership Tenant contradictorio.')
  const id = recurso?.tenantId ?? recurso?.tenant_id
  // DTO previos a F6.1 pertenecen exclusivamente al SCC inicial.
  if (id === undefined) return TENANT_INICIAL_ID
  if (typeof id !== 'string' || !id.trim())
    throw new Error('El recurso requiere Tenant.')
  return id.trim()
}

export function exigirMismoTenant(...recursos) {
  const ids = recursos.map(tenantDeRecurso)
  if (new Set(ids).size > 1) throw new Error('Relación cross-tenant rechazada.')
  return ids[0]
}
