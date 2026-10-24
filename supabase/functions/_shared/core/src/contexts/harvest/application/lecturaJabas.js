import { backend } from '../../../backend/backend.js'

export async function listarLotesActivos() {
  return backend.listarLotesActivos()
}

export async function iniciarSesionLectura(parametros) {
  return backend.iniciarSesionLectura(parametros)
}

export async function registrarLecturaJaba(parametros) {
  return backend.registrarLecturaJaba(parametros)
}

export async function cerrarSesionLectura(parametros) {
  return backend.cerrarSesionLectura(parametros)
}
