import { AccesoDenegado } from './identidad.js'

export const PERMISOS = Object.freeze([
  'company.manage',
  'campaign.manage',
  'workforce.manage',
  'harvest.operate',
  'harvest.manage',
  'harvest.view',
  'reports.view',
  'farm.manage'
])

export class Permiso {
  constructor(codigo) {
    if (!PERMISOS.includes(codigo)) throw new AccesoDenegado('Permiso desconocido.')
    this.codigo = codigo
    Object.freeze(this)
  }
}
