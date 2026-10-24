export function crearRegistrarJabero(dependencias) {
  return async function registrarJabero({ operador, dni }) {
    const trabajador = await dependencias.trabajadores.obtener(dni)
    const operacion = await dependencias.trabajadores.registrarJabero(operador.dni, dni)
    return {
      trabajador,
      operacion,
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar el registro de jabero:'
      )
    }
  }
}
