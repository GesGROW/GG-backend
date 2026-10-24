import { identidad } from './identidad.js'

// Principal del sistema; no contiene DNI ni exige identidad de Workforce.
export class Usuario {
  constructor({ id, nombre = 'Usuario', email = null, activo = true }) {
    this.id = identidad(id, 'usuario')
    this.nombre = identidad(nombre, 'nombre')
    this.email = email
    this.activo = activo === true
    Object.freeze(this)
  }
}
