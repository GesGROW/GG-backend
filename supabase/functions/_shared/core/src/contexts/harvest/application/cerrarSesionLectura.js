export function crearCerrarSesionLectura(dependencias) {
  return async function cerrarSesionLectura({ operador, sesionLectura }) {
    const operacion = await dependencias.cosecha.cerrarSesion(
      sesionLectura.sesion_id,
      operador.dni
    )
    return {
      operacion,
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar el cierre de lectura:'
      )
    }
  }
}
