export function resolverCampaniaOperador(operador, id) {
  if (!Array.isArray(operador.campanias))
    throw new Error('Conéctese para actualizar las campañas asignadas a este operador.')
  const opciones = operador.campanias ?? []
  if (!opciones.length) throw new Error('No tiene campañas activas asignadas.')
  if (id) {
    const seleccionada = opciones.find((campania) => campania.id === id)
    if (!seleccionada)
      throw new Error('La campaña ya no está asignada a este operador.')
    return seleccionada
  }
  return opciones.length === 1 ? opciones[0] : null
}
