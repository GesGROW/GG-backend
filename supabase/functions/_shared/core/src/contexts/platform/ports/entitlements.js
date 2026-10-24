export function validarEntitlements(puerto) {
  if (typeof puerto?.puedeUsarModulo !== 'function')
    throw new Error('Platform requiere un puerto de entitlements.')
  return puerto
}
