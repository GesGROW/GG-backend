const requerido = (v, campo) => {
  if (typeof v !== 'string' || !v.trim())
    throw new Error('Farm Structure requiere ' + campo + '.')
  return v.trim()
}
export function datosEstructura(d) {
  const codigo = requerido(d.codigo, 'código').toUpperCase(),
    nombre = requerido(d.nombre, 'nombre')
  if (codigo.length > 30 || nombre.length > 150 || typeof d.activo !== 'boolean')
    throw new Error('Código, nombre o estado de estructura inválidos.')
  return { codigo, nombre, activo: d.activo }
}
class ElementoFisico {
  constructor(d) {
    Object.assign(this, datosEstructura(d), {
      id: requerido(d.id, 'id'),
      tenantId: requerido(d.tenantId, 'Tenant')
    })
  }
}
export class Fundo extends ElementoFisico {
  constructor(d) {
    super(d)
    Object.freeze(this)
  }
}
export class Sector extends ElementoFisico {
  constructor(d) {
    super(d)
    this.fundoId = requerido(d.fundoId, 'Fundo')
    Object.freeze(this)
  }
}
export class ParcelaAgricola extends ElementoFisico {
  constructor(d) {
    super(d)
    this.sectorId = requerido(d.sectorId, 'Sector')
    Object.freeze(this)
  }
}
export function exigirJerarquiaDelTenant(hijo, padre) {
  if (hijo.tenantId !== padre.tenantId)
    throw new Error('Jerarquía cross-tenant rechazada.')
  if ((hijo.fundoId ?? hijo.sectorId) !== padre.id)
    throw new Error('Padre físico incorrecto.')
  return hijo
}
