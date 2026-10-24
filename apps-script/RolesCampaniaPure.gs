var SCC_ROLES_CAMPANIA_PERMITIDOS = Object.freeze([
  'COSECHADOR',
  'JABERO',
  'SUPERVISORA'
]);

function normalizarRolCampaniaScc_(valor) {
  var rol = String(valor == null ? '' : valor).trim().toUpperCase();
  if (!rol) throw new Error('El rol es obligatorio');
  if (SCC_ROLES_CAMPANIA_PERMITIDOS.indexOf(rol) === -1) {
    throw new Error('El rol seleccionado no es v\u00e1lido');
  }
  return rol;
}

function nombreVisibleTrabajadorRolCampaniaScc_(trabajador) {
  return [trabajador && trabajador.nombres, trabajador && trabajador.apellidos]
    .map(function (valor) { return String(valor == null ? '' : valor).trim(); })
    .filter(Boolean)
    .join(' ') || 'ASIGNAR NOMBRE';
}

function debeMarcarPendienteRolesCampaniaOnEditScc_(
  nombreHoja,
  fila,
  columnaInicial,
  numeroColumnas
) {
  if (nombreHoja !== 'ROLES_CAMPANIA' || fila <= 1) return false;
  var columnaFinal = columnaInicial + Math.max(1, Number(numeroColumnas) || 1) - 1;
  return [1, 3, 4, 5].some(function (columna) {
    return columna >= columnaInicial && columna <= columnaFinal;
  });
}

function resolverTrabajadorRolCampaniaScc_(dniVisible, trabajadores) {
  var texto = String(dniVisible == null ? '' : dniVisible).trim();
  if (!texto) throw new Error('El trabajador es obligatorio');
  var dni = normalizarDniScc_(texto);
  var encontrados = (trabajadores || []).filter(function (trabajador) {
    return String(trabajador.dni == null ? '' : trabajador.dni).trim() === dni &&
      esFilaSincronizadaConIdScc_(trabajador);
  });
  if (!encontrados.length) {
    throw new Error('El trabajador seleccionado no est\u00e1 sincronizado');
  }
  if (encontrados.length > 1) {
    throw new Error('El trabajador seleccionado es ambiguo');
  }
  return {
    id: normalizarIdSistemaScc_(encontrados[0].idSistema),
    dni: dni,
    nombre: nombreVisibleTrabajadorRolCampaniaScc_(encontrados[0]),
    activo: normalizarActivoScc_(encontrados[0].activo)
  };
}

function resolverCampaniaRolCampaniaScc_(codigoVisible, campanias) {
  var codigo = normalizarTextoObligatorioScc_(
    codigoVisible,
    'La campa\u00f1a es obligatoria'
  );
  var encontradas = (campanias || []).filter(function (campania) {
    return String(campania.codigo == null ? '' : campania.codigo).trim() === codigo &&
      esFilaSincronizadaConIdScc_(campania);
  });
  if (!encontradas.length) {
    throw new Error('La campa\u00f1a seleccionada no est\u00e1 sincronizada');
  }
  if (encontradas.length > 1) {
    throw new Error('La campa\u00f1a seleccionada es ambigua');
  }
  return {
    id: normalizarIdSistemaScc_(encontradas[0].idSistema),
    codigo: codigo,
    estado: String(encontradas[0].estado == null ? '' : encontradas[0].estado)
      .trim()
      .toUpperCase()
  };
}

function buscarRolCampaniaRemotoOriginalScc_(
  fila,
  trabajadorId,
  campaniaId,
  rol,
  rolesOriginales
) {
  var id = normalizarIdSistemaScc_(fila.idSistema);
  var roles = rolesOriginales || [];
  if (id) {
    return roles.filter(function (item) { return item.id === id; })[0] || null;
  }
  return roles.filter(function (item) {
    return item.trabajadorId === trabajadorId &&
      item.campaniaId === campaniaId &&
      item.rol === rol;
  })[0] || null;
}

function prepararRolCampaniaParaGuardarScc_(
  fila,
  trabajadores,
  campanias,
  rolesOriginales
) {
  var trabajador = resolverTrabajadorRolCampaniaScc_(fila.dni, trabajadores);
  var campania = resolverCampaniaRolCampaniaScc_(fila.campania, campanias);
  var rol = normalizarRolCampaniaScc_(fila.rol);
  var activo = normalizarActivoScc_(fila.activo);
  var original = buscarRolCampaniaRemotoOriginalScc_(
    fila,
    trabajador.id,
    campania.id,
    rol,
    rolesOriginales
  );
  var esNuevo = !original;
  var reactivacion = !!original && original.activo !== true && activo === true;
  var cambioIdentidad = !!original && (
    original.trabajadorId !== trabajador.id ||
    original.campaniaId !== campania.id ||
    original.rol !== rol
  );

  if (esNuevo || reactivacion || cambioIdentidad) {
    if (trabajador.activo !== true) {
      throw new Error('El trabajador seleccionado no est\u00e1 activo');
    }
    if (campania.estado !== 'ACTIVA') {
      throw new Error('La campa\u00f1a seleccionada no est\u00e1 activa');
    }
  }

  return {
    p_rol_id: normalizarIdSistemaScc_(fila.idSistema),
    p_trabajador_id: trabajador.id,
    p_campania_id: campania.id,
    p_rol: rol,
    p_activo: activo
  };
}

function normalizarRolCampaniaListadoScc_(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('Respuesta inv\u00e1lida al listar roles de campa\u00f1a');
  }
  var id = normalizarIdSistemaScc_(item.id);
  var trabajadorId = normalizarIdSistemaScc_(item.trabajador_id);
  var campaniaId = normalizarIdSistemaScc_(item.campania_id);
  if (!id || !trabajadorId || !campaniaId) {
    throw new Error('Respuesta inv\u00e1lida al listar roles de campa\u00f1a');
  }
  return {
    id: id,
    trabajadorId: trabajadorId,
    dni: normalizarDniScc_(item.dni),
    trabajador: normalizarTextoListadoScc_(item.trabajador) || 'ASIGNAR NOMBRE',
    campaniaId: campaniaId,
    campaniaCodigo: normalizarTextoObligatorioScc_(
      item.campania_codigo,
      'Respuesta inv\u00e1lida al listar roles de campa\u00f1a'
    ),
    campaniaEstado: String(item.campania_estado == null ? '' : item.campania_estado)
      .trim()
      .toUpperCase(),
    rol: normalizarRolCampaniaScc_(item.rol),
    activo: normalizarActivoScc_(item.activo),
    accesoApp: normalizarActivoScc_(item.acceso_app)
  };
}

function normalizarListadoRolesCampaniaScc_(respuesta) {
  if (!respuesta || respuesta.ok !== true || !Array.isArray(respuesta.roles)) {
    throw new Error('Respuesta inv\u00e1lida al listar roles de campa\u00f1a');
  }
  return respuesta.roles.map(normalizarRolCampaniaListadoScc_);
}

function obtenerOpcionesTrabajadoresRolesCampaniaScc_(trabajadores) {
  return (trabajadores || []).filter(function (trabajador) {
    return esFilaSincronizadaConIdScc_(trabajador) &&
      normalizarActivoScc_(trabajador.activo) === true;
  }).map(function (trabajador) {
    return String(trabajador.dni == null ? '' : trabajador.dni).trim();
  }).filter(function (dni, indice, todos) {
    return !!dni && todos.indexOf(dni) === indice;
  });
}

function obtenerOpcionesCampaniasRolesCampaniaScc_(campanias) {
  return (campanias || []).filter(function (campania) {
    return esFilaSincronizadaConIdScc_(campania) &&
      String(campania.estado == null ? '' : campania.estado).trim().toUpperCase() === 'ACTIVA';
  }).map(function (campania) {
    return String(campania.codigo == null ? '' : campania.codigo).trim();
  }).filter(function (codigo, indice, todos) {
    return !!codigo && todos.indexOf(codigo) === indice;
  });
}

function obtenerOpcionesRolesCampaniaScc_() {
  return SCC_ROLES_CAMPANIA_PERMITIDOS.slice();
}

function procesarFilasPendientesRolesCampaniaScc_(
  filas,
  trabajadores,
  campanias,
  rolesOriginales,
  guardar,
  ahora
) {
  var obtenerAhora = ahora || function () { return new Date(); };
  return filas.map(function (fila) {
    if (!esFilaPendienteScc_(fila.estadoSync) || esFilaAdministrativaVaciaScc_(fila)) {
      return Object.assign({}, fila);
    }

    var idAnterior = fila.idSistema;
    try {
      var payload = prepararRolCampaniaParaGuardarScc_(
        fila,
        trabajadores,
        campanias,
        rolesOriginales
      );
      var respuesta = guardar(payload);
      if (!respuesta || respuesta.ok !== true ||
          !respuesta.rol_campania || !respuesta.rol_campania.id) {
        throw new Error('Respuesta inv\u00e1lida al guardar rol de campa\u00f1a');
      }
      return Object.assign({}, fila, {
        estadoSync: 'SINCRONIZADO',
        observacion: '',
        idSistema: normalizarIdSistemaScc_(respuesta.rol_campania.id),
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
