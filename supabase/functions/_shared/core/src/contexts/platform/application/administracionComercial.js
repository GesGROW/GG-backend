import { CambioComercial, EVENTOS_COMERCIALES } from '../domain/cambioComercial.js'
import { validarAdministracionComercial } from '../ports/comercial.js'
import { validarTenantContext } from '../ports/tenantContext.js'

export function crearAdministracionComercial({ tenantContext, comercial }) {
  validarTenantContext(tenantContext)
  validarAdministracionComercial(comercial)
  async function contexto() {
    const c = await tenantContext.obtener()
    c.exigir('company.manage')
    return c
  }
  const operaciones = Object.fromEntries(
    Object.entries(EVENTOS_COMERCIALES).map(([metodo, tipoEvento]) => [
      metodo,
      async (datos) => {
        const c = await contexto()
        return comercial.solicitarCambio(
          new CambioComercial({
            operacionId: datos.operacionId,
            tenantId: c.tenantId,
            tipoEvento,
            datos,
            motivo: datos.motivo,
            effectiveAt: datos.effectiveAt ?? null,
            versionBase: datos.versionBase
          })
        )
      }
    ])
  )
  return Object.freeze({
    ...operaciones,
    async consultar() {
      return comercial.consultar((await contexto()).tenantId)
    },
    async puedeAdministrar() {
      const c = await tenantContext.obtener()
      if (!c.permite('company.manage')) return false
      return (await comercial.puedeAdministrar(c.tenantId)) === true
    }
  })
}
