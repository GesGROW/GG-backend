import {
  validarInicioNoRechazado,
  validarTicketParaLectura
} from '../domain/validacionesLectura.js'

export function crearRegistrarLecturaJaba(dependencias) {
  // Compatibilidad antes del cutover explícito de la campaña.
  // Después del corte, Application usa crearSolicitarRegistroCosecha.
  return async function registrarLecturaJaba({ operador, sesionLectura, codigo }) {
    const jabero = await dependencias.workforce.obtenerTrabajador(
      sesionLectura.dni_jabero
    )
    dependencias.workforce.validarJaberoParaLectura(jabero)
    validarInicioNoRechazado(
      await dependencias.cola.inicioSesionRechazado(sesionLectura.sesion_id)
    )
    const ticket = await dependencias.cosecha.obtenerTicket(codigo)
    validarTicketParaLectura(ticket)
    const lecturaId = dependencias.generarId()
    const fechaHora = dependencias.ahora()
    const operacion = await dependencias.cosecha.registrarLectura(
      {
        id: lecturaId,
        sesion_id: sesionLectura.sesion_id,
        codigo_ticket: codigo,
        cosechador_dni: ticket.cosechador_dni,
        cosechador: ticket.cosechador,
        fecha_hora: fechaHora,
        estado_sync: 'PENDIENTE'
      },
      operador.dni
    )
    const total = await dependencias.cosecha.contarLecturasSesion(
      sesionLectura.sesion_id
    )
    const totalPersona = await dependencias.cosecha.contarLecturasCosechador(
      sesionLectura.sesion_id,
      ticket.cosechador_dni
    )
    return {
      ticket,
      total,
      totalPersona,
      operacion,
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar la lectura de jaba:'
      )
    }
  }
}
