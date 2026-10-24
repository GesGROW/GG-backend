import { DatoDeTicketsInvalido } from './erroresTickets.js'

export function validarIdentificador(valor, campo) {
  if (typeof valor !== 'string' || !valor.trim()) throw new DatoDeTicketsInvalido(campo)
  return valor.trim()
}
