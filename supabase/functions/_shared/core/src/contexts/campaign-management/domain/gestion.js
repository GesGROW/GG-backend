export function datosCampania(d) {
  const codigo = d.codigo?.trim(),
    nombre = d.nombre?.trim()
  if (
    !codigo ||
    !nombre ||
    !d.cultivoId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.fechaInicio ?? '')
  )
    throw new Error('Código, nombre, cultivo y fecha de inicio requeridos.')
  if (d.fechaFin && d.fechaFin < d.fechaInicio)
    throw new Error('La fecha de fin no puede ser anterior al inicio.')
  return {
    codigo,
    nombre,
    cultivoId: d.cultivoId,
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin || null
  }
}
export function validarEstadoInicial(estado = 'ACTIVA') {
  if (!['ACTIVA', 'CERRADA'].includes(estado))
    throw new Error('Estado de campaña inválido.')
  return estado
}
