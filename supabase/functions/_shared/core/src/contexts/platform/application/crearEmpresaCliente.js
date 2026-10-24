import { EmpresaCliente } from '../domain/empresaCliente.js'
import { validarRepositorioEmpresasCliente } from '../ports/empresasCliente.js'

export function crearCrearEmpresaCliente({ empresasCliente, generarId, ahora }) {
  const repositorio = validarRepositorioEmpresasCliente(empresasCliente)
  return async ({ nombre, codigo }) => {
    const empresa = new EmpresaCliente({
      id: generarId(),
      nombre,
      codigo,
      createdAt: ahora()
    })
    await repositorio.guardar(empresa)
    return empresa
  }
}
