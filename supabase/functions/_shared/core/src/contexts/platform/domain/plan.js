import { Modulo } from './modulo.js'
import { requerido } from './contratos.js'

export class Plan {
  constructor({ id, codigo, nombre, modulos = [] }) {
    this.id = requerido(id, 'Plan')
    this.codigo = requerido(codigo, 'código de Plan')
    this.nombre = requerido(nombre, 'nombre de Plan')
    this.modulos = Object.freeze(
      [...new Set(modulos.map((m) => new Modulo(m).codigo))].sort()
    )
    Object.freeze(this)
  }
}
