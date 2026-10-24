// La caché anterior solo guardaba el nombre de una variedad por lote.
export function obtenerVariedadesLote(lote) {
  if (Array.isArray(lote?.variedades)) {
    return lote.variedades
      .filter((variedad) => variedad.activo !== false)
      .map((variedad) => ({
        id: variedad.id ?? variedad.variedad_id,
        nombre: variedad.nombre ?? variedad.variedad
      }))
      .filter((variedad) => variedad.id && variedad.nombre)
  }
  return lote?.variedad ? [{ id: lote.variedad_id ?? null, nombre: lote.variedad }] : []
}

export function seleccionarVariedadLote(lote, variedadId) {
  const variedades = obtenerVariedadesLote(lote)
  const seleccionada = variedades.find((variedad) => variedad.id === variedadId)
  if (seleccionada) return seleccionada
  if (!variedadId && variedades.length === 1) return variedades[0]
  throw new Error('Seleccione una variedad del lote.')
}
