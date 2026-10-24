export class LoteOperativoCampania {
  constructor({ id, tenantId, campaniaId, codigo, parcelaIds = [] }) {
    if (
      ![id, tenantId, campaniaId, codigo].every(
        (v) => typeof v === 'string' && v.trim()
      )
    )
      throw new Error('Lote operativo requiere id, Tenant, campaña y código.')
    if (
      !Array.isArray(parcelaIds) ||
      parcelaIds.some((id) => typeof id !== 'string' || !id.trim())
    )
      throw new Error('Referencias de parcelas inválidas.')
    Object.assign(this, {
      id,
      tenantId,
      campaniaId,
      codigo,
      parcelaIds: Object.freeze([...new Set(parcelaIds)])
    })
    Object.freeze(this)
  }
}
