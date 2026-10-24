function normalizarCodigoLoteScc_(valor) {
  var codigo = normalizarTextoObligatorioScc_(
    valor,
    'El código del lote es obligatorio'
  );
  if (codigo.length > 30) {
    throw new Error('El código del lote no puede exceder 30 caracteres');
  }
  return codigo;
}

function normalizarNombreLoteScc_(valor) {
  var nombre = String(valor == null ? '' : valor).trim();
  if (!nombre) return null;
  if (nombre.length > 100) {
    throw new Error('El nombre del lote no puede exceder 100 caracteres');
  }
  return nombre;
}

function debeMarcarPendienteLotesOnEditScc_(nombreHoja, fila, columnaInicial, numeroColumnas) {
  if (nombreHoja !== 'LOTES' || fila <= 1) return false;
  var columnaFinal = columnaInicial + Math.max(1, Number(numeroColumnas) || 1) - 1;
  return columnaInicial <= 5 && columnaFinal >= 1;
}

function resolverCampaniaLoteScc_(codigoVisible, campanias) {
  var codigo = normalizarTextoObligatorioScc_(codigoVisible, 'La campaña es obligatoria');
  var encontrada = (campanias || []).filter(function (campania) {
    return String(campania.codigo == null ? '' : campania.codigo).trim() === codigo;
  })[0];
  if (!encontrada || !esFilaSincronizadaConIdScc_(encontrada)) {
    throw new Error('La campaña seleccionada no está sincronizada');
  }
  return {
    id: normalizarIdSistemaScc_(encontrada.idSistema),
    codigo: codigo,
    estado: String(encontrada.estado == null ? '' : encontrada.estado).trim().toUpperCase()
  };
}

function resolverVariedadLoteScc_(nombreVisible, variedades) {
  var nombre = normalizarTextoObligatorioScc_(nombreVisible, 'La variedad es obligatoria');
  var encontrada = (variedades || []).filter(function (variedad) {
    return String(variedad.nombre == null ? '' : variedad.nombre).trim() === nombre;
  })[0];
  if (!encontrada || !esFilaSincronizadaConIdScc_(encontrada)) {
    throw new Error('La variedad seleccionada no está sincronizada');
  }
  return {
    id: normalizarIdSistemaScc_(encontrada.idSistema),
    nombre: nombre,
    activo: normalizarActivoScc_(encontrada.activo)
  };
}

function esFilaSincronizadaConIdScc_(fila) {
  if (!fila) return false;
  var estado = String(fila.estadoSync == null ? '' : fila.estadoSync).trim().toUpperCase();
  return estado === 'SINCRONIZADO' && !!normalizarIdSistemaScc_(fila && fila.idSistema);
}

function buscarLoteRemotoOriginalScc_(fila, campaniaId, codigo, lotesOriginales) {
  var id = normalizarIdSistemaScc_(fila.idSistema);
  var lotes = lotesOriginales || [];
  if (id) {
    return lotes.filter(function (lote) { return lote.id === id; })[0] || null;
  }
  return lotes.filter(function (lote) {
    return lote.campaniaId === campaniaId && lote.codigo === codigo;
  })[0] || null;
}

function prepararLoteParaGuardarScc_(fila, campanias, variedades, lotesOriginales) {
  var codigo = normalizarCodigoLoteScc_(fila.codigo);
  var nombre = normalizarNombreLoteScc_(fila.nombre);
  var campania = resolverCampaniaLoteScc_(fila.campania, campanias);
  var nombres = String(fila.variedad == null ? '' : fila.variedad).split(';').map(function (nombre) {
    return nombre.trim();
  });
  if (nombres.some(function (nombre) { return !nombre; })) {
    throw new Error('La variedad es obligatoria; separe varias variedades con punto y coma');
  }
  var seleccionadas = nombres.filter(function (nombre, indice) {
    return nombres.indexOf(nombre) === indice;
  }).map(function (nombre) { return resolverVariedadLoteScc_(nombre, variedades); });
  var original = buscarLoteRemotoOriginalScc_(
    fila,
    campania.id,
    codigo,
    lotesOriginales
  );
  var campaniaCambio = !original || original.campaniaId !== campania.id;
  var idsOriginales = original ? (original.variedadIds || [original.variedadId]) : [];

  if (campaniaCambio && campania.estado !== 'ACTIVA') {
    throw new Error('La campaña seleccionada no está activa');
  }
  if (seleccionadas.some(function (variedad) {
    return idsOriginales.indexOf(variedad.id) < 0 && variedad.activo !== true;
  })) {
    throw new Error('La variedad seleccionada no está activa');
  }

  return {
    p_lote_id: normalizarIdSistemaScc_(fila.idSistema),
    p_codigo: codigo,
    p_nombre: nombre,
    p_campania_id: campania.id,
    p_variedad_ids: seleccionadas.map(function (variedad) { return variedad.id; }),
    p_activo: normalizarActivoScc_(fila.activo)
  };
}

function normalizarLoteListadoScc_(lote) {
  if (!lote || typeof lote !== 'object') {
    throw new Error('Respuesta inválida al listar lotes');
  }
  var id = normalizarIdSistemaScc_(lote.id);
  var campaniaId = normalizarIdSistemaScc_(lote.campania_id);
  var variedades = Array.isArray(lote.variedades) ? lote.variedades : [{
    id: lote.variedad_id, nombre: lote.variedad, activo: lote.variedad_activa
  }];
  variedades = variedades.map(function (variedad) {
    var variedadId = normalizarIdSistemaScc_(variedad.id);
    if (!variedadId) throw new Error('Respuesta inválida al listar lotes');
    return {
      id: variedadId,
      nombre: normalizarTextoObligatorioScc_(variedad.nombre, 'Respuesta inválida al listar lotes'),
      activo: normalizarActivoScc_(variedad.activo)
    };
  });
  if (!id || !campaniaId || !variedades.length) {
    throw new Error('Respuesta inválida al listar lotes');
  }
  return {
    id: id,
    codigo: normalizarCodigoLoteScc_(lote.codigo),
    nombre: normalizarNombreLoteScc_(lote.nombre),
    campaniaId: campaniaId,
    campaniaCodigo: normalizarTextoObligatorioScc_(lote.campania_codigo, 'Respuesta inválida al listar lotes'),
    campaniaEstado: String(lote.campania_estado == null ? '' : lote.campania_estado).trim().toUpperCase(),
    variedadIds: variedades.map(function (variedad) { return variedad.id; }),
    variedad: variedades.map(function (variedad) { return variedad.nombre; }).join('; '),
    variedadActiva: variedades.every(function (variedad) { return variedad.activo; }),
    activo: normalizarActivoScc_(lote.activo)
  };
}

function normalizarListadoLotesScc_(respuesta) {
  if (!respuesta || respuesta.ok !== true || !Array.isArray(respuesta.lotes)) {
    throw new Error('Respuesta inválida al listar lotes');
  }
  return respuesta.lotes.map(normalizarLoteListadoScc_);
}

function obtenerOpcionesCampaniasLotesScc_(campanias) {
  return (campanias || []).filter(function (campania) {
    return esFilaSincronizadaConIdScc_(campania) &&
      String(campania.estado == null ? '' : campania.estado).trim().toUpperCase() === 'ACTIVA';
  }).map(function (campania) {
    return String(campania.codigo == null ? '' : campania.codigo).trim();
  }).filter(Boolean);
}

function obtenerOpcionesVariedadesLotesScc_(variedades) {
  return (variedades || []).filter(function (variedad) {
    return esFilaSincronizadaConIdScc_(variedad) && normalizarActivoScc_(variedad.activo) === true;
  }).map(function (variedad) {
    return String(variedad.nombre == null ? '' : variedad.nombre).trim();
  }).filter(Boolean);
}

function procesarFilasPendientesLotesScc_(filas, campanias, variedades, lotesOriginales, guardar, ahora) {
  var obtenerAhora = ahora || function () { return new Date(); };
  return filas.map(function (fila) {
    if (!esFilaPendienteScc_(fila.estadoSync) || esFilaAdministrativaVaciaScc_(fila)) {
      return Object.assign({}, fila);
    }

    var idAnterior = fila.idSistema;
    try {
      var payload = prepararLoteParaGuardarScc_(fila, campanias, variedades, lotesOriginales);
      var respuesta = guardar(payload);
      if (!respuesta || respuesta.ok !== true || !respuesta.lote || !respuesta.lote.id) {
        throw new Error('Respuesta inválida al guardar lote');
      }
      return Object.assign({}, fila, {
        estadoSync: 'SINCRONIZADO',
        observacion: '',
        idSistema: normalizarIdSistemaScc_(respuesta.lote.id),
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
