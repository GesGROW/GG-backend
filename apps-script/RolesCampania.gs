function configurarHojaRolesCampania_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaRolesCampania) ||
    libro.insertSheet(SCC_CONFIG.hojaRolesCampania);
  var filasDatos = Math.max(1, hoja.getMaxRows() - 1);

  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_ROLES_CAMPANIA.length)
    .setValues([SCC_ENCABEZADOS_ROLES_CAMPANIA])
    .setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.getRange(2, SCC_CONFIG.columnasRolesCampania.activo, filasDatos, 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['S\u00ed', 'No'], true)
        .setAllowInvalid(false)
        .build()
    );

  hoja.setColumnWidth(1, 110);
  hoja.setColumnWidth(2, 240);
  hoja.setColumnWidth(3, 170);
  hoja.setColumnWidth(4, 150);
  hoja.setColumnWidth(5, 90);
  hoja.setColumnWidth(6, 120);
  hoja.setColumnWidth(7, 300);
  hoja.setColumnWidth(8, 260);
  hoja.setColumnWidth(9, 170);
  protegerColumnasTecnicasRolesCampania_(hoja);
  refrescarValidacionesRolesCampania_();
  return hoja;
}

function protegerColumnasTecnicasRolesCampania_(hoja) {
  var descripcion = 'SCC - ROLES_CAMPANIA - columnas t\u00e9cnicas F:I';
  var proteccion = hoja.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(function (item) { return item.getDescription() === descripcion; })[0];
  if (!proteccion) {
    proteccion = hoja.getRange(1, 6, hoja.getMaxRows(), 4)
      .protect()
      .setDescription(descripcion);
  } else {
    proteccion.setRange(hoja.getRange(1, 6, hoja.getMaxRows(), 4));
  }
  if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
}

function leerFilasRolesCampania_(hoja) {
  var ultimaFila = obtenerUltimaFilaAdministrativaScc_(hoja, [1, 3, 4, 5]);
  if (ultimaFila <= SCC_CONFIG.filaEncabezado) return [];
  return hoja.getRange(2, 1, ultimaFila - 1, 9).getValues().map(function (valores, indice) {
    return {
      fila: indice + 2,
      dni: valores[0],
      trabajador: valores[1],
      campania: valores[2],
      rol: valores[3],
      activo: valores[4],
      estadoSync: valores[5],
      observacion: valores[6],
      idSistema: valores[7],
      ultimaSincronizacion: valores[8]
    };
  });
}

function refrescarValidacionesRolesCampania_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaRolesCampania);
  if (!hoja) return;

  var hojaTrabajadores = libro.getSheetByName(SCC_CONFIG.hojaTrabajadores);
  var hojaCampanias = libro.getSheetByName(SCC_CONFIG.hojaCampanias);
  var trabajadores = hojaTrabajadores ? leerFilasTrabajadores_(hojaTrabajadores) : [];
  var campanias = hojaCampanias ? leerFilasCampanias_(hojaCampanias) : [];
  var opcionesTrabajadores = obtenerOpcionesTrabajadoresRolesCampaniaScc_(trabajadores);
  var opcionesCampanias = obtenerOpcionesCampaniasRolesCampaniaScc_(campanias);
  var opcionesRoles = obtenerOpcionesRolesCampaniaScc_();
  var filasDatos = Math.max(1, hoja.getMaxRows() - 1);
  var rangoTrabajador = hoja.getRange(2, SCC_CONFIG.columnasRolesCampania.dni, filasDatos, 1);
  var rangoCampania = hoja.getRange(2, SCC_CONFIG.columnasRolesCampania.campania, filasDatos, 1);
  var rangoRol = hoja.getRange(2, SCC_CONFIG.columnasRolesCampania.rol, filasDatos, 1);

  if (opcionesTrabajadores.length) {
    rangoTrabajador.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(opcionesTrabajadores, true)
        .setAllowInvalid(true)
        .build()
    );
  } else {
    rangoTrabajador.clearDataValidations();
  }

  if (opcionesCampanias.length) {
    rangoCampania.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(opcionesCampanias, true)
        .setAllowInvalid(true)
        .build()
    );
  } else {
    rangoCampania.clearDataValidations();
  }

  rangoRol.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(opcionesRoles, true)
      .setAllowInvalid(false)
      .build()
  );
}

function completarNombresRolesCampaniaDesdeDni_(hoja, filaInicial, filaFinal) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hojaTrabajadores = libro.getSheetByName(SCC_CONFIG.hojaTrabajadores);
  if (!hojaTrabajadores) return;
  var trabajadores = leerFilasTrabajadores_(hojaTrabajadores);

  for (var fila = filaInicial; fila <= filaFinal; fila += 1) {
    var dni = hoja.getRange(fila, SCC_CONFIG.columnasRolesCampania.dni).getValue();
    if (!String(dni == null ? '' : dni).trim()) {
      hoja.getRange(fila, SCC_CONFIG.columnasRolesCampania.trabajador).clearContent();
      continue;
    }
    try {
      var trabajador = resolverTrabajadorRolCampaniaScc_(dni, trabajadores);
      hoja.getRange(fila, SCC_CONFIG.columnasRolesCampania.trabajador)
        .setValue(trabajador.nombre);
    } catch (error) {
      // Se conserva el texto visible si la referencia no se puede resolver todav\u00eda.
    }
  }
}

function sincronizarRolesCampania_() {
  var hoja = configurarHojaRolesCampania_();
  var filas = leerFilasRolesCampania_(hoja);
  var pendientes = filtrarFilasPendientesConDatosScc_(filas);
  if (!pendientes.length) return { procesadas: 0, sincronizados: 0, errores: 0 };

  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hojaTrabajadores = libro.getSheetByName(SCC_CONFIG.hojaTrabajadores) ||
    configurarHojaTrabajadores_();
  var hojaCampanias = libro.getSheetByName(SCC_CONFIG.hojaCampanias) ||
    configurarHojaCampanias_();

  var trabajadores = leerFilasTrabajadores_(hojaTrabajadores);
  var campanias = leerFilasCampanias_(hojaCampanias);
  var rolesOriginales = normalizarListadoRolesCampaniaScc_(
    llamarRpcSupabase_('admin_listar_roles_campania', {})
  );
  var resultados = procesarFilasPendientesRolesCampaniaScc_(
    pendientes,
    trabajadores,
    campanias,
    rolesOriginales,
    function (payload) {
      return llamarRpcSupabase_('admin_guardar_rol_campania', payload);
    },
    function () { return new Date(); }
  );

  resultados.forEach(function (fila) {
    hoja.getRange(fila.fila, SCC_CONFIG.columnasRolesCampania.estadoSync, 1, 4)
      .setValues([[
        fila.estadoSync,
        fila.observacion,
        fila.idSistema || '',
        fila.ultimaSincronizacion || ''
      ]]);
  });

  refrescarValidacionesRolesCampania_();
  var errores = resultados.filter(function (fila) { return fila.estadoSync === 'ERROR'; }).length;
  return {
    procesadas: resultados.length,
    sincronizados: resultados.length - errores,
    errores: errores
  };
}

function actualizarRolesCampaniaDesdeSistema_() {
  var hoja = configurarHojaRolesCampania_();
  var actuales = leerFilasRolesCampania_(hoja);
  if (tieneCambiosLocalesNoResueltosScc_(actuales)) {
    throw new Error(
      'Hay cambios locales pendientes o con error. Sincron\u00edzalos o resu\u00e9lvelos antes de actualizar desde el sistema.'
    );
  }

  var roles = normalizarListadoRolesCampaniaScc_(
    llamarRpcSupabase_('admin_listar_roles_campania', {})
  );
  var ahora = new Date();
  var ultimaFila = Math.max(hoja.getLastRow(), 2);
  hoja.getRange(2, 1, ultimaFila - 1, 9).clearContent();

  if (roles.length) {
    var valores = roles.map(function (item) {
      return [
        item.dni,
        item.trabajador,
        item.campaniaCodigo,
        item.rol,
        item.activo ? 'S\u00ed' : 'No',
        'SINCRONIZADO',
        '',
        item.id,
        ahora
      ];
    });
    hoja.getRange(2, 1, valores.length, 9).setValues(valores);
  }

  refrescarValidacionesRolesCampania_();
  return roles.length;
}

function marcarEdicionRolesCampania_(evento) {
  if (!evento || !evento.range) return;
  var rango = evento.range;
  var hoja = rango.getSheet();
  if (!debeMarcarPendienteRolesCampaniaOnEditScc_(
    hoja.getName(),
    rango.getRow(),
    rango.getColumn(),
    rango.getNumColumns()
  )) return;

  var filaInicial = Math.max(2, rango.getRow());
  var filaFinal = rango.getLastRow();
  if (filaFinal < filaInicial) return;
  var columnaFinal = rango.getColumn() + rango.getNumColumns() - 1;
  if (rango.getColumn() <= SCC_CONFIG.columnasRolesCampania.dni &&
      columnaFinal >= SCC_CONFIG.columnasRolesCampania.dni) {
    completarNombresRolesCampaniaDesdeDni_(hoja, filaInicial, filaFinal);
  }

  var cantidad = filaFinal - filaInicial + 1;
  hoja.getRange(filaInicial, SCC_CONFIG.columnasRolesCampania.estadoSync, cantidad, 1)
    .setValues(Array.from({ length: cantidad }, function () { return ['PENDIENTE']; }));
  hoja.getRange(filaInicial, SCC_CONFIG.columnasRolesCampania.observacion, cantidad, 1)
    .clearContent();
}
