import { datosEstructura } from '../domain/estructura.js'
import { validarEstructuraAgricola } from '../ports/estructura.js'
export function crearGestionEstructuraAgricola({ estructuraAgricola }) {
  const p = validarEstructuraAgricola(estructuraAgricola)
  const tipo = (v) => {
    if (!['fundos', 'sectores', 'parcelas'].includes(v))
      throw new Error('Tipo físico desconocido.')
    return v
  }
  return Object.freeze({
    listar: (t, k, { busqueda = '', activo = null, padreId = null, offset = 0 } = {}) =>
      p.listar(t, tipo(k), { busqueda, activo, padreId, offset }),
    guardar: (t, k, d) =>
      p.guardar(t, tipo(k), {
        ...datosEstructura(d),
        id: d.id || null,
        padreId: k === 'fundos' ? null : d.padreId
      }),
    activar: (t, k, id) => p.estado(t, tipo(k), id, true),
    desactivar: (t, k, id) => p.estado(t, tipo(k), id, false)
  })
}
