import {
  validarNuevaSesion,
  validarLoteOperativo
} from '../domain/validacionesLectura.js'

export function crearIniciarSesionLectura(dependencias) {
  return async function iniciarSesionLectura({ operador, dni, loteId, variedadId }) {
    const trabajador = await dependencias.workforce.obtenerTrabajador(dni)
    dependencias.workforce.validarJaberoParaInicio(trabajador)
    const existente = await dependencias.cosecha.obtenerSesionActivaJabero(dni)
    validarNuevaSesion(existente)
    const lotes = await dependencias.cosecha.obtenerLotes()
    const lote = lotes.find((item) => item.lote_id === loteId)
    validarLoteOperativo(lote)
    const variedad = dependencias.campaignManagement.seleccionarVariedadLote(
      lote,
      variedadId
    )
    const sesionId = dependencias.generarId()
    const sesion = {
      sesion_id: sesionId,
      jabero: trabajador.nombre,
      lote_id: lote.lote_id,
      lote_codigo: lote.codigo,
      campania_id: operador.campania.id,
      variedad_id: variedad.id,
      variedad: variedad.nombre,
      dni_jabero: dni,
      dni_operador: operador.dni,
      estado: 'ACTIVA',
      fecha_inicio: dependencias.ahora()
    }
    const operacion = await dependencias.cosecha.iniciarSesion(
      { id: sesionId, ...sesion },
      operador.dni
    )
    return {
      sesion,
      operacion,
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar el inicio de lectura:'
      )
    }
  }
}
