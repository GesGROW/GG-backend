function normalizarCodigoCampaniaScc_(valor) {
  return normalizarTextoObligatorioScc_(
    valor,
    'El código de campaña es obligatorio'
  );
}

function normalizarNombreCampaniaScc_(valor) {
  return normalizarTextoObligatorioScc_(
    valor,
    'El nombre de campaña es obligatorio'
  );
}

function normalizarEstadoCampaniaScc_(valor) {
  var estado = String(valor == null ? '' : valor).trim().toUpperCase();
  if (estado !== 'ACTIVA' && estado !== 'CERRADA') {
    throw new Error('El estado de campaña debe ser ACTIVA o CERRADA');
  }
  return estado;
}

function esFechaIsoCalendarioValidaScc_(valor) {
  var match = String(valor == null ? '' : valor)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  var anio = Number(match[1]);
  var mes = Number(match[2]);
  var dia = Number(match[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;

  var diasPorMes = [31, (anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasPorMes[mes - 1];
}

function normalizarFechaCampaniaScc_(valor, mensajeObligatorio, nullable, formatearDate) {
  if (valor == null || valor === '') {
    if (nullable) return null;
    throw new Error(mensajeObligatorio);
  }

  if (Object.prototype.toString.call(valor) === '[object Date]') {
    if (isNaN(valor.getTime()) || typeof formatearDate !== 'function') {
      throw new Error('La fecha indicada no es válida');
    }
    var isoDesdeDate = String(formatearDate(valor) || '').trim();
    if (!esFechaIsoCalendarioValidaScc_(isoDesdeDate)) {
      throw new Error('La fecha indicada no es válida');
    }
    return isoDesdeDate;
  }

  var texto = String(valor).trim();
  var matchVisual = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (matchVisual) {
    texto = matchVisual[3] + '-' + matchVisual[2] + '-' + matchVisual[1];
  }

  if (!esFechaIsoCalendarioValidaScc_(texto)) {
    throw new Error('La fecha indicada no es válida');
  }
  return texto;
}

function convertirFechaPostgresParaHojaScc_(valor, parsearFecha, zonaHoraria) {
  var iso = normalizarFechaCampaniaScc_(
    valor,
    'La fecha de inicio es obligatoria',
    false
  );
  if (typeof parsearFecha !== 'function') {
    throw new Error('No se pudo convertir la fecha para Google Sheets');
  }
  return parsearFecha(iso, zonaHoraria, 'yyyy-MM-dd');
}

function debeMarcarPendienteCampaniasOnEditScc_(
  nombreHoja,
  fila,
  columnaInicial,
  numeroColumnas
) {
  if (nombreHoja !== 'CAMPANIAS' || fila <= 1) return false;
  var columnaFinal = columnaInicial + Math.max(1, Number(numeroColumnas) || 1) - 1;
  return columnaInicial <= 5 && columnaFinal >= 1;
}

function prepararCampaniaParaGuardarScc_(fila, formatearDate) {
  var fechaInicio = normalizarFechaCampaniaScc_(
    fila.fechaInicio,
    'La fecha de inicio es obligatoria',
    false,
    formatearDate
  );
  var fechaFin = normalizarFechaCampaniaScc_(
    fila.fechaFin,
    '',
    true,
    formatearDate
  );

  if (fechaFin && fechaFin < fechaInicio) {
    throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
  }

  return {
    p_campania_id: normalizarIdSistemaScc_(fila.idSistema),
    p_codigo: normalizarCodigoCampaniaScc_(fila.codigo),
    p_nombre: normalizarNombreCampaniaScc_(fila.nombre),
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
    p_estado: normalizarEstadoCampaniaScc_(fila.estado)
  };
}

function normalizarCampaniaListadoScc_(campania) {
  if (!campania || typeof campania !== 'object') {
    throw new Error('Respuesta inválida al listar campañas');
  }

  var id = normalizarIdSistemaScc_(campania.id);
  if (!id) throw new Error('Respuesta inválida al listar campañas');

  return {
    id: id,
    codigo: normalizarCodigoCampaniaScc_(campania.codigo),
    nombre: normalizarNombreCampaniaScc_(campania.nombre),
    fechaInicio: normalizarFechaCampaniaScc_(
      campania.fecha_inicio,
      'La fecha de inicio es obligatoria',
      false
    ),
    fechaFin: normalizarFechaCampaniaScc_(
      campania.fecha_fin,
      '',
      true
    ),
    estado: normalizarEstadoCampaniaScc_(campania.estado)
  };
}

function normalizarListadoCampaniasScc_(respuesta) {
  if (!respuesta || respuesta.ok !== true || !Array.isArray(respuesta.campanias)) {
    throw new Error('Respuesta inválida al listar campañas');
  }
  return respuesta.campanias.map(normalizarCampaniaListadoScc_);
}

function procesarFilasPendientesCampaniasScc_(
  filas,
  guardar,
  ahora,
  formatearDate
) {
  var obtenerAhora = ahora || function () { return new Date(); };
  return filas.map(function (fila) {
    if (!esFilaPendienteScc_(fila.estadoSync) || esFilaAdministrativaVaciaScc_(fila)) {
      return Object.assign({}, fila);
    }

    var idAnterior = fila.idSistema;
    try {
      var payload = prepararCampaniaParaGuardarScc_(fila, formatearDate);
      var respuesta = guardar(payload);
      if (!respuesta || respuesta.ok !== true || !respuesta.campania || !respuesta.campania.id) {
        throw new Error('Respuesta inválida al guardar campaña');
      }
      return Object.assign({}, fila, {
        estadoSync: 'SINCRONIZADO',
        observacion: '',
        idSistema: normalizarIdSistemaScc_(respuesta.campania.id),
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
