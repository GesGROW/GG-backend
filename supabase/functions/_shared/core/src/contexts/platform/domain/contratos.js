export function requerido(valor, campo) {
  if (typeof valor !== 'string' || !valor.trim()) throw new Error(`Falta ${campo}.`)
  return valor.trim()
}

export function fecha(valor) {
  if (!valor || !Number.isFinite(new Date(valor).getTime()))
    throw new Error('Fecha de vigencia inválida.')
  return new Date(valor).toISOString()
}

export function intervalo(inicio, fin) {
  const desde = fecha(inicio),
    hasta = fin == null ? null : fecha(fin)
  if (hasta && hasta <= desde) throw new Error('Intervalo de vigencia inválido.')
  return { desde, hasta }
}

export function vigente(desde, hasta, ahora) {
  const instante = fecha(ahora)
  return instante >= desde && (hasta === null || instante < hasta)
}
