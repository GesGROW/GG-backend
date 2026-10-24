import { validarReportesHarvest } from '../../ports/reportes.js'
import { buscarRankingCosechadores } from './rankingCosechadores.js'
import { buscarProduccionLotes, ordenarProduccionLotes } from './produccionLotes.js'

export function crearReportesHarvest({ reportesHarvest: puerto }) {
  validarReportesHarvest(puerto)
  return Object.freeze({
    campanias: (tenant) => puerto.campanias(tenant),
    validar: (tenant, campania) => puerto.validar(tenant, campania),
    async consultar(tenant, solicitud) {
      const {
        campaniaId,
        tipo,
        periodo = 'CAMPANIA',
        busqueda = '',
        orden = 'mas-jabas'
      } = solicitud
      if (
        !campaniaId ||
        !['DASHBOARD', 'RESUMEN', 'RANKING', 'DIARIA', 'LOTES'].includes(tipo)
      )
        throw new Error('Campaña y reporte válidos requeridos.')
      if (!['HOY', 'SEMANA', 'MES', 'CAMPANIA'].includes(periodo))
        throw new Error('Periodo inválido.')
      if (!['mas-jabas', 'az'].includes(orden)) throw new Error('Orden inválido.')
      const r = await puerto.consultar(tenant, { campaniaId, tipo, periodo })
      if (
        r.tenantId !== tenant ||
        r.campaniaId !== campaniaId ||
        r.tipo !== tipo ||
        r.datos?.ok !== true
      )
        throw new Error('Respuesta de reportes inválida.')
      const datos = { ...r.datos }
      // Búsqueda existente sobre la proyección autorizada. Nunca reconstruye
      // ranking ni sus posiciones, ni combina hechos legacy y nuevos.
      if (tipo === 'RANKING')
        datos.ranking = buscarRankingCosechadores(datos.ranking, busqueda)
      if (tipo === 'LOTES')
        datos.produccion = ordenarProduccionLotes(
          buscarProduccionLotes(datos.produccion, busqueda),
          orden
        )
      return { ...r, datos, filtros: { campaniaId, tipo, periodo, busqueda, orden } }
    }
  })
}
