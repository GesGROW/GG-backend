// F6.2 inyectará este puerto desde Identity & Access. La UI nunca lo establece.
export function validarTenantContext(contexto) {
  if (typeof contexto?.obtener !== 'function')
    throw new Error('TenantContext requiere obtener().')
  return contexto
}
