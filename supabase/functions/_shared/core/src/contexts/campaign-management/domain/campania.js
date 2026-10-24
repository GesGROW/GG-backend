export class Campania {
  constructor({ id, tenantId, nombre, ...datos }) {
    if (!id || !tenantId || !nombre)
      throw new Error('Campaña requiere id, Tenant y nombre.')
    Object.assign(this, datos, { id, tenantId, nombre })
    Object.freeze(this)
  }
}
