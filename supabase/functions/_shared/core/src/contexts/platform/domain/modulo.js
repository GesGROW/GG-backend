export const MODULOS = Object.freeze([
  'HARVEST',
  'CAMPAIGN',
  'WORKFORCE',
  'FARM_STRUCTURE'
])
// Reservados para evolucionar el catálogo; todavía no se pueden contratar.
export const MODULOS_FUTUROS = Object.freeze([
  'INVENTORY',
  'MACHINERY',
  'IRRIGATION',
  'QUALITY'
])

export class Modulo {
  constructor(codigo) {
    if (!MODULOS.includes(codigo)) throw new Error('Módulo no disponible.')
    this.codigo = codigo
    Object.freeze(this)
  }
}

export class ModuloNoHabilitado extends Error {
  constructor(modulo) {
    super(`El módulo ${modulo} no está habilitado para esta empresa.`)
    this.name = 'ModuloNoHabilitado'
  }
}
