import { identidad, AccesoDenegado } from './identidad.js'
import { Permiso } from './permiso.js'

// DTO reconstituido exclusivamente desde el resultado del puerto autorizado.
// Su constructor no convierte un objeto de UI en autoridad para el servidor.
export class TenantContext {
  constructor({ usuarioId, membresiaId, tenantId, empresa, permisos = [] }) {
    this.usuarioId = identidad(usuarioId, 'usuario')
    this.membresiaId = identidad(membresiaId, 'membresía')
    this.tenantId = identidad(tenantId, 'empresa')
    this.empresa = empresa
    this.permisos = Object.freeze(
      [...new Set(permisos.map((p) => new Permiso(p).codigo))].sort()
    )
    Object.freeze(this)
  }

  permite(permiso) {
    return this.permisos.includes(new Permiso(permiso).codigo)
  }

  exigir(permiso, tenantId = this.tenantId) {
    if (tenantId !== this.tenantId || !this.permite(permiso))
      throw new AccesoDenegado('No tiene permiso para esta empresa y operación.')
    return this
  }
}
