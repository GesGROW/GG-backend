import { identidad } from './identidad.js'
import { Permiso } from './permiso.js'

// Plantillas de aprovisionamiento; la autorización solo consulta permisos.
export const ROLES_APLICACION = Object.freeze({
  ADMIN_EMPRESA: Object.freeze(['company.manage', 'reports.view']),
  SUPERVISOR_COSECHA: Object.freeze([
    'harvest.view',
    'harvest.manage',
    'harvest.operate',
    'reports.view'
  ]),
  GESTOR: Object.freeze([
    'campaign.manage',
    'workforce.manage',
    'harvest.view',
    'reports.view'
  ]),
  OPERADOR_CAMPO: Object.freeze(['harvest.operate', 'harvest.view']),
  CONSULTA: Object.freeze(['harvest.view', 'reports.view'])
})

export class RolAplicacion {
  constructor({ id, tenantId, codigo, permisos = [], activo = true }) {
    this.id = identidad(id, 'rol')
    this.tenantId = identidad(tenantId, 'empresa')
    this.codigo = identidad(codigo, 'código')
    this.permisos = Object.freeze(
      [...new Set(permisos.map((p) => new Permiso(p).codigo))].sort()
    )
    this.activo = activo === true
    Object.freeze(this)
  }
}
