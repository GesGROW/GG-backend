import { identidad, AccesoDenegado } from './identidad.js'

export class MembresiaEmpresa {
  constructor({ id, usuarioId, tenantId, activo = true, trabajadorId = null }) {
    this.id = identidad(id, 'membresía')
    this.usuarioId = identidad(usuarioId, 'usuario')
    this.tenantId = identidad(tenantId, 'empresa')
    this.activo = activo === true
    this.trabajadorId =
      trabajadorId === null ? null : identidad(trabajadorId, 'trabajador')
    Object.freeze(this)
  }

  permisosEfectivos(roles) {
    if (!this.activo) throw new AccesoDenegado('Membresía inactiva.')
    const permisos = new Set()
    for (const rol of roles) {
      if (rol.tenantId !== this.tenantId)
        throw new AccesoDenegado('Rol de otra empresa.')
      if (rol.activo) for (const permiso of rol.permisos) permisos.add(permiso)
    }
    return Object.freeze([...permisos].sort())
  }
}
