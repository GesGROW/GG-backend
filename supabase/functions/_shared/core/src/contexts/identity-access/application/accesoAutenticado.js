import { Usuario } from '../domain/usuario.js'
import { MembresiaEmpresa } from '../domain/membresiaEmpresa.js'
import { TenantContext } from '../domain/tenantContext.js'
import { AccesoDenegado } from '../domain/identidad.js'
import { validarPuertoIdentity } from '../ports/identity.js'
import { validarPuertoAcceso } from '../ports/acceso.js'

export function crearAccesoAutenticado({ identity, acceso }) {
  validarPuertoIdentity(identity)
  validarPuertoAcceso(acceso)
  let seleccion = null

  async function sesion() {
    const actual = await identity.obtenerSesion()
    if (!actual?.sujeto) {
      seleccion = null
      throw new AccesoDenegado('Inicie sesión con su cuenta.')
    }
    return actual
  }
  async function obtenerIdentidad() {
    await sesion()
    const resultado = await acceso.obtenerIdentidad()
    const usuario = new Usuario(resultado.usuario)
    if (!usuario.activo) throw new AccesoDenegado('Usuario inactivo.')
    const membresias = resultado.membresias.map((m) => new MembresiaEmpresa(m))
    if (membresias.some((m) => m.usuarioId !== usuario.id))
      throw new AccesoDenegado('Identidad incompatible.')
    return { usuario, membresias, empresas: resultado.empresas }
  }
  async function seleccionarEmpresa(tenantId) {
    await sesion()
    // tenantId es una solicitud de selección. La pertenencia se comprueba en servidor.
    const contexto = new TenantContext(await acceso.resolverContexto(tenantId))
    if (tenantId && contexto.tenantId !== tenantId)
      throw new AccesoDenegado('Empresa no autorizada.')
    seleccion = contexto.tenantId
    return contexto
  }
  async function obtener() {
    // Siempre refrescar membresía y permisos; no autorizar desde una caché del DTO.
    return seleccionarEmpresa(seleccion)
  }
  return Object.freeze({
    obtenerIdentidad,
    seleccionarEmpresa,
    obtener,
    async iniciarSesion(credenciales) {
      seleccion = null
      await identity.iniciarSesion(credenciales)
      const resultado = await obtenerIdentidad()
      const contexto =
        resultado.membresias.length === 1
          ? await seleccionarEmpresa(resultado.membresias[0].tenantId)
          : null
      return { ...resultado, contexto }
    },
    async autorizar(permiso, tenantId) {
      return (await obtener()).exigir(permiso, tenantId)
    },
    async cerrarSesion() {
      seleccion = null
      await identity.cerrarSesion()
    }
  })
}
