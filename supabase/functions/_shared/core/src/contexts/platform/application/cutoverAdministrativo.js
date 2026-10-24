export function crearCutoverAdministrativo({ cutoverAdministrativo: puerto }) {
  for (const m of ['consultar', 'activar'])
    if (typeof puerto?.[m] !== 'function')
      throw new Error('Puerto cutover administrativo incompleto: ' + m)
  return Object.freeze({
    consultar: (tenant, campaniaId) => puerto.consultar(tenant, campaniaId),
    activar(tenant, d) {
      if (
        !d.campaniaId ||
        !d.operacionId ||
        !d.motivo?.trim() ||
        d.pendientesRevisados !== true
      )
        throw new Error('Campaña, ID, motivo y revisión de pendientes requeridos.')
      return puerto.activar(tenant, {
        campaniaId: d.campaniaId,
        operacionId: d.operacionId,
        motivo: d.motivo.trim(),
        pendientesRevisados: true
      })
    }
  })
}
