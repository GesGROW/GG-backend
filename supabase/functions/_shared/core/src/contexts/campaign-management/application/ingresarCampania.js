import { resolverCampaniaOperador } from '../domain/campaniaOperador.js'
import { esErrorTemporal } from '../../../shared/erroresConexion.js'
import { exigirMismoTenant } from '../../platform/index.js'

export function crearIngresarCampania(dependencias) {
  const clasificarError = dependencias.esErrorTemporal ?? esErrorTemporal
  return async function ingresarCampania({ operador, campania }) {
    campania = resolverCampaniaOperador(operador, campania.id)
    await dependencias.offline.campanias.seleccionar(campania.id)
    const cacheLocal = await dependencias.offline.campanias.obtenerCache(campania.id)
    if (cacheLocal) exigirMismoTenant(campania, cacheLocal.campania ?? cacheLocal)
    if (operador.offline) {
      if (!cacheLocal)
        throw new Error(
          'Esta campaña no está disponible sin conexión. Conéctese para cargarla por primera vez.'
        )
    } else {
      try {
        const cache = await dependencias.backend.obtenerCacheOperativa(
          operador.dni,
          campania.id
        )
        if (cache?.campania) exigirMismoTenant(campania, cache.campania)
        await dependencias.offline.campanias.guardarCache(cache)
      } catch (error) {
        if (!clasificarError(error) || !cacheLocal) throw error
      }
    }
    return {
      operador: { ...operador, campania },
      sincronizar: dependencias.sincronizacionPosterior()
    }
  }
}
