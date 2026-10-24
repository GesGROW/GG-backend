import { validarOperadorConFuentes } from './authLogic.js'
// LEGACY PROVISIONAL: autoriza al PDA por DNI agrícola. No es una cuenta Usuario.

export function crearValidarOperador({
  backend,
  offline,
  validarConFuentes = validarOperadorConFuentes
}) {
  return async function validarOperador(dni) {
    return validarConFuentes(
      dni,
      backend.validarOperador,
      (dni) => offline.operadores.obtener(dni),
      (operador) => offline.operadores.guardar(operador)
    )
  }
}
