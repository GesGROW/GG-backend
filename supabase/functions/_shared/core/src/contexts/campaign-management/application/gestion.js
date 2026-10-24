import { validarGestionCampaign } from '../ports/gestion.js'
import { datosCampania, validarEstadoInicial } from '../domain/gestion.js'

export function crearGestionCampanias({ campaign }) {
  const p = validarGestionCampaign(campaign)
  return Object.freeze({
    listar: (t, { busqueda = '', estado = '', cultivoId = null, offset = 0 } = {}) =>
      p.listar(t, { busqueda, estado, cultivoId, offset }),
    obtener: (t, id) => p.obtener(t, id),
    crear: (t, d) =>
      p.crear(t, { ...datosCampania(d), estado: validarEstadoInicial(d.estado) }),
    editar: (t, id, d) => p.editar(t, id, datosCampania(d)),
    activar: (t, id) => p.activar(t, id),
    cerrar: (t, id, fechaFin) => p.cerrar(t, id, fechaFin || null),
    cultivos: (t) => p.cultivos(t),
    variedades: (t, c) => p.variedades(t, c),
    guardarVariedad(t, c, d) {
      if (!d.nombre?.trim() || typeof d.activo !== 'boolean')
        throw new Error('Nombre y estado de variedad requeridos.')
      return p.guardarVariedad(t, c, {
        id: d.id || null,
        nombre: d.nombre.trim(),
        activo: d.activo
      })
    },
    lotes: (t, c) => p.lotes(t, c),
    ...(p.guardarLote
      ? {
          guardarLote(t, c, d) {
            if (
              !d.codigo?.trim() ||
              d.codigo.trim().length > 30 ||
              (d.nombre?.trim().length ?? 0) > 100 ||
              typeof d.activo !== 'boolean' ||
              !Array.isArray(d.variedadIds) ||
              !d.variedadIds.length
            )
              throw new Error(
                'Código, nombre, estado y variedades válidos requeridos para el lote operativo.'
              )
            return p.guardarLote(t, c, {
              id: d.id || null,
              codigo: d.codigo.trim(),
              nombre: d.nombre?.trim() || null,
              activo: d.activo,
              variedadIds: [...new Set(d.variedadIds)]
            })
          }
        }
      : {}),
    configurarVariedadesLote(t, c, l, ids) {
      if (!Array.isArray(ids) || !ids.length || ids.some((id) => !id))
        throw new Error('Seleccione al menos una variedad.')
      return p.configurarVariedadesLote(t, c, l, [...new Set(ids)])
    }
  })
}
