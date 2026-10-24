import { validarGestionWorkforce } from '../ports/gestion.js'
import { datosTrabajador, rolAdministrable } from '../domain/gestion.js'

export function crearGestionPersonal({ workforce }) {
  const p = validarGestionWorkforce(workforce)
  return Object.freeze({
    listar: (t, { busqueda = '', activo = null, offset = 0 } = {}) =>
      p.listar(t, { busqueda, activo, offset }),
    obtener: (t, id) => p.obtener(t, id),
    crear: (t, d) => p.crear(t, datosTrabajador(d)),
    editar: (t, id, d) => p.editar(t, id, datosTrabajador(d)),
    activar: (t, id) => p.activar(t, id),
    desactivar: (t, id) => p.desactivar(t, id),
    catalogo: (t) => p.catalogo(t),
    participaciones: (t, id) => p.participaciones(t, id),
    ...(p.habilitarJaberoDelDia
      ? {
          habilitarJaberoDelDia: (t, id, c) => p.habilitarJaberoDelDia(t, id, c),
          retirarJabero: (t, id, c) => p.retirarJabero(t, id, c)
        }
      : {}),
    asignarRol: (t, id, c, rol) => p.asignarRol(t, id, c, rolAdministrable(rol)),
    retirarRol: (t, id, c, rol) => p.retirarRol(t, id, c, rolAdministrable(rol))
  })
}
