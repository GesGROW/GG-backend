export class Trabajador {
  constructor({ id, tenantId, dni, ...datos }) {
    if (!id || !tenantId || !/^\d{8}$/.test(dni))
      throw new Error('Trabajador requiere id, Tenant y DNI de ocho dígitos.')
    Object.assign(this, datos, { id, tenantId, dni })
    Object.freeze(this)
  }
}
