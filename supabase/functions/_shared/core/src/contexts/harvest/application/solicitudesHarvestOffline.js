export function crearSolicitarAsignacionHarvest(dependencias) {
  return async ({ operador, cosechador, codigoTicket }) => {
    const operacion = await dependencias.harvestLocal.reservarAsignacion({
      codigoTicket,
      cosechadorDni: cosechador.dni,
      cosechador: cosechador.nombre,
      dniOperador: operador.dni,
      campaniaId: operador.campania.id
    })
    return {
      operacion,
      estado: 'PENDIENTE',
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar la asignación del lote:'
      )
    }
  }
}

export function crearSolicitarRegistroCosecha(dependencias) {
  return async ({ operador, sesionLectura, codigo }) => {
    dependencias.workforce.validarJaberoParaLectura(
      await dependencias.workforce.obtenerTrabajador(sesionLectura.dni_jabero)
    )
    const { operacion, ticket } = await dependencias.harvestLocal.reservarConsumo({
      codigoTicket: codigo,
      sesionId: sesionLectura.sesion_id,
      registroId: dependencias.generarId(),
      fechaHora: dependencias.ahora(),
      dniOperador: operador.dni,
      campaniaId: operador.campania.id
    })
    return {
      operacion,
      ticket,
      total: await dependencias.cosecha.contarLecturasSesion(sesionLectura.sesion_id),
      totalPersona: await dependencias.cosecha.contarLecturasCosechador(
        sesionLectura.sesion_id,
        ticket.cosechador_dni
      ),
      sincronizar: dependencias.sincronizacionPosterior(
        'No se pudo sincronizar el registro de cosecha:'
      )
    }
  }
}

// Alias transicional de F5.5, sin una implementación alternativa.
export const crearSolicitarConsumoHarvest = crearSolicitarRegistroCosecha
