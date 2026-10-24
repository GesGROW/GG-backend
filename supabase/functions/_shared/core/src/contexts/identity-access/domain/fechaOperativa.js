export function fechaOperativa(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(ahora)
}

export function autorizacionOperadorVigente(operador, ahora = new Date()) {
  return Boolean(
    operador?.dni && operador.autorizado_para_fecha === fechaOperativa(ahora)
  )
}
