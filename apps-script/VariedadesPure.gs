function normalizarNombreVariedadScc_(valor) {
  return normalizarTextoObligatorioScc_(
    valor,
    'El nombre de la variedad es obligatorio'
  );
}

function debeMarcarPendienteVariedadesOnEditScc_(
  nombreHoja,
  fila,
  columnaInicial,
  numeroColumnas
) {
  if (nombreHoja !== 'VARIEDADES' || fila <= 1) return false;
  var columnaFinal = columnaInicial + Math.max(1, Number(numeroColumnas) || 1) - 1;
  return columnaInicial <= 2 && columnaFinal >= 1;
}

function prepararVariedadParaGuardarScc_(fila) {
  return {
    p_variedad_id: normalizarIdSistemaScc_(fila.idSistema),
    p_nombre: normalizarNombreVariedadScc_(fila.nombre),
    p_activo: normalizarActivoScc_(fila.activo)
  };
}

function normalizarVariedadListadoScc_(variedad) {
  if (!variedad || typeof variedad !== 'object') {
    throw new Error('Respuesta inválida al listar variedades');
  }

  var id = normalizarIdSistemaScc_(variedad.id);
  if (!id) throw new Error('Respuesta inválida al listar variedades');

  return {
    id: id,
    nombre: normalizarNombreVariedadScc_(variedad.nombre),
    activo: normalizarActivoScc_(variedad.activo)
  };
}

function normalizarListadoVariedadesScc_(respuesta) {
  if (!respuesta || respuesta.ok !== true || !Array.isArray(respuesta.variedades)) {
    throw new Error('Respuesta inválida al listar variedades');
  }
  return respuesta.variedades.map(normalizarVariedadListadoScc_);
}

function procesarFilasPendientesVariedadesScc_(filas, guardar, ahora) {
  var obtenerAhora = ahora || function () { return new Date(); };
  return filas.map(function (fila) {
    if (!esFilaPendienteScc_(fila.estadoSync) || esFilaAdministrativaVaciaScc_(fila)) {
      return Object.assign({}, fila);
    }

    var idAnterior = fila.idSistema;
    try {
      var payload = prepararVariedadParaGuardarScc_(fila);
      var respuesta = guardar(payload);
      if (!respuesta || respuesta.ok !== true || !respuesta.variedad || !respuesta.variedad.id) {
        throw new Error('Respuesta inválida al guardar variedad');
      }
      return Object.assign({}, fila, {
        estadoSync: 'SINCRONIZADO',
        observacion: '',
        idSistema: normalizarIdSistemaScc_(respuesta.variedad.id),
        ultimaSincronizacion: obtenerAhora()
      });
    } catch (error) {
      return Object.assign({}, fila, {
        estadoSync: 'ERROR',
        observacion: error && error.message ? error.message : 'No se pudo sincronizar la fila',
        idSistema: idAnterior
      });
    }
  });
}
