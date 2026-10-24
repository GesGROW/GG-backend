export function validarRepositorioEmpresasCliente(repositorio) {
  if (typeof repositorio?.guardar !== 'function')
    throw new Error('Platform requiere un repositorio de EmpresaCliente.')
  return repositorio
}
