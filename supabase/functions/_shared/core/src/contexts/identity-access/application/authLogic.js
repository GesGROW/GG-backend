import { esErrorTemporal } from '../../../shared/erroresConexion.js'
import { autorizacionOperadorVigente } from '../domain/fechaOperativa.js'

export async function validarOperadorConFuentes(
  dni,
  consultar,
  obtenerLocal,
  guardarLocal
) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const local = await obtenerLocal(dni)
    if (!local)
      throw new Error(
        'Este operador no está disponible sin conexión. Conéctese a Internet al menos una vez para validar el dispositivo.'
      )
    return validarLocal(local)
  }
  try {
    const data = await consultar(dni)
    if (!data?.dni) throw new Error('El servidor no autorizó al operador.')
    if (!autorizacionOperadorVigente(data)) {
      throw new Error('La autorización del operador no corresponde al día de hoy.')
    }
    await guardarLocal({
      dni: data.dni,
      nombre: data.nombre,
      autorizado_para_fecha: data.autorizado_para_fecha,
      ...(data.campanias ? { campanias: data.campanias } : {}),
      actualizado_en: new Date().toISOString()
    })
    return data
  } catch (error) {
    if (!esErrorTemporal(error)) throw error
    const local = await obtenerLocal(dni)
    if (local) return validarLocal(local)
    throw error
  }
}

function validarLocal(local) {
  if (!autorizacionOperadorVigente(local)) {
    throw new Error(
      'La autorización guardada venció. Conéctese para validar la asignación de hoy.'
    )
  }
  return { ...local, offline: true }
}
