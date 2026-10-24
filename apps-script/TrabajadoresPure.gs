function normalizarDniScc_(valor) {
  var dni = String(valor == null ? '' : valor).trim();
  if (!/^\d{8}$/.test(dni)) {
    throw new Error('DNI debe contener exactamente 8 dígitos');
  }
  return dni;
}

function normalizarTextoObligatorioScc_(valor, mensaje) {
  var texto = String(valor == null ? '' : valor).trim();
  if (!texto) throw new Error(mensaje);
  return texto;
}

function normalizarTextoListadoScc_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function normalizarActivoScc_(valor) {
  if (valor === true || valor === false) return valor;
  var texto = String(valor == null ? '' : valor)
    .trim()
    .toLocaleLowerCase('es');
  if (texto === 'sí' || texto === 'si' || texto === 'true') return true;
  if (texto === 'no' || texto === 'false') return false;
  throw new Error('Activo debe ser Sí o No');
}

function normalizarIdSistemaScc_(valor) {
  var id = String(valor == null ? '' : valor).trim();
  if (!id) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('ID Sistema no tiene un UUID válido');
  }
  return id;
}

function esFilaPendienteScc_(estado) {
  return String(estado == null ? '' : estado).trim().toUpperCase() === 'PENDIENTE';
}

function tieneValorAdministrativoScc_(valor) {
  return valor != null && String(valor).trim() !== '';
}

function obtenerCamposAdministrativosFilaScc_(fila) {
  var actual = fila || {};
  if (Object.prototype.hasOwnProperty.call(actual, 'rol')) {
    return ['dni', 'campania', 'rol', 'activo'];
  }
  if (Object.prototype.hasOwnProperty.call(actual, 'variedad')) {
    return ['codigo', 'nombre', 'campania', 'variedad', 'activo'];
  }
  if (Object.prototype.hasOwnProperty.call(actual, 'fechaInicio') ||
      Object.prototype.hasOwnProperty.call(actual, 'fechaFin') ||
      Object.prototype.hasOwnProperty.call(actual, 'estado')) {
    return ['codigo', 'nombre', 'fechaInicio', 'fechaFin', 'estado'];
  }
  if (Object.prototype.hasOwnProperty.call(actual, 'nombres') ||
      Object.prototype.hasOwnProperty.call(actual, 'apellidos') ||
      Object.prototype.hasOwnProperty.call(actual, 'dni')) {
    return ['dni', 'nombres', 'apellidos', 'activo'];
  }
  if (Object.prototype.hasOwnProperty.call(actual, 'nombre') ||
      Object.prototype.hasOwnProperty.call(actual, 'activo')) {
    return ['nombre', 'activo'];
  }
  return [];
}

function esFilaAdministrativaVaciaScc_(fila) {
  var campos = obtenerCamposAdministrativosFilaScc_(fila);
  if (!campos.length) return false;
  return !campos.some(function (campo) {
    return tieneValorAdministrativoScc_(fila && fila[campo]);
  });
}

function filtrarFilasPendientesConDatosScc_(filas) {
  return (filas || []).filter(function (fila) {
    return esFilaPendienteScc_(fila.estadoSync) && !esFilaAdministrativaVaciaScc_(fila);
  });
}

function obtenerUltimaFilaAdministrativaScc_(hoja, columnasAdministrativas) {
  var ultimaFilaHoja = hoja.getLastRow();
  if (ultimaFilaHoja <= 1) return 1;

  var columnas = (columnasAdministrativas || []).slice();
  if (!columnas.length) return 1;
  var ultimaColumna = Math.max.apply(null, columnas);
  var valores = hoja.getRange(2, 1, ultimaFilaHoja - 1, ultimaColumna).getValues();

  for (var indice = valores.length - 1; indice >= 0; indice -= 1) {
    var tieneDatos = columnas.some(function (columna) {
      return tieneValorAdministrativoScc_(valores[indice][columna - 1]);
    });
    if (tieneDatos) return indice + 2;
  }
  return 1;
}

function debeMarcarPendienteOnEditScc_(nombreHoja, fila, columnaInicial, numeroColumnas) {
  if (nombreHoja !== 'TRABAJADORES' || fila <= 1) return false;
  var columnaFinal = columnaInicial + Math.max(1, Number(numeroColumnas) || 1) - 1;
  return columnaInicial <= 4 && columnaFinal >= 1;
}

function normalizarTrabajadorListadoScc_(trabajador) {
  if (!trabajador || typeof trabajador !== 'object') {
    throw new Error('Respuesta inválida al listar trabajadores');
  }
  return {
    id: normalizarIdSistemaScc_(trabajador.id),
    dni: normalizarDniScc_(trabajador.dni),
    nombres: normalizarTextoListadoScc_(trabajador.nombres),
    apellidos: normalizarTextoListadoScc_(trabajador.apellidos),
    activo: normalizarActivoScc_(trabajador.activo)
  };
}

function normalizarListadoTrabajadoresScc_(respuesta) {
  if (!respuesta || respuesta.ok !== true || !Array.isArray(respuesta.trabajadores)) {
    throw new Error('Respuesta inválida al listar trabajadores');
  }
  return respuesta.trabajadores.map(normalizarTrabajadorListadoScc_);
}

function tieneCambiosLocalesNoResueltosScc_(filas) {
  return filas.some(function (fila) {
    if (esFilaAdministrativaVaciaScc_(fila)) return false;
    var estado = String(fila.estadoSync == null ? '' : fila.estadoSync)
      .trim()
      .toUpperCase();
    return estado === 'PENDIENTE' || estado === 'ERROR';
  });
}

function prepararTrabajadorParaGuardarScc_(fila) {
  return {
    p_trabajador_id: normalizarIdSistemaScc_(fila.idSistema),
    p_dni: normalizarDniScc_(fila.dni),
    p_nombres: normalizarTextoObligatorioScc_(
      fila.nombres,
      'Los nombres son obligatorios'
    ),
    p_apellidos: normalizarTextoObligatorioScc_(
      fila.apellidos,
      'Los apellidos son obligatorios'
    ),
    p_activo: normalizarActivoScc_(fila.activo)
  };
}

function procesarFilasPendientesScc_(filas, guardar, ahora) {
  var obtenerAhora = ahora || function () { return new Date(); };
  return filas.map(function (fila) {
    if (!esFilaPendienteScc_(fila.estadoSync) || esFilaAdministrativaVaciaScc_(fila)) {
      return Object.assign({}, fila);
    }

    var idAnterior = fila.idSistema;
    try {
      var payload = prepararTrabajadorParaGuardarScc_(fila);
      var respuesta = guardar(payload);
      if (!respuesta || respuesta.ok !== true || !respuesta.trabajador || !respuesta.trabajador.id) {
        throw new Error('Respuesta inválida al guardar trabajador');
      }
      return Object.assign({}, fila, {
        estadoSync: 'SINCRONIZADO',
        observacion: '',
        idSistema: normalizarIdSistemaScc_(respuesta.trabajador.id),
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
