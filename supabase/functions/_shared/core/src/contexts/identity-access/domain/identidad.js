export class AccesoDenegado extends Error {
  constructor(mensaje = 'Acceso no autorizado.') {
    super(mensaje)
    this.name = 'AccesoDenegado'
  }
}

export function identidad(valor, campo) {
  if (typeof valor !== 'string' || !valor.trim())
    throw new AccesoDenegado(`Falta ${campo}.`)
  return valor.trim()
}
