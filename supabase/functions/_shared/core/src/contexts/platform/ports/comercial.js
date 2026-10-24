export function validarAdministracionComercial(puerto) {
  for (const metodo of ['solicitarCambio', 'consultar', 'puedeAdministrar'])
    if (typeof puerto?.[metodo] !== 'function')
      throw new Error(`Administración comercial requiere ${metodo}.`)
  return puerto
}
