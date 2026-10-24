function configurarHojaTrabajadores_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaTrabajadores) ||
    libro.insertSheet(SCC_CONFIG.hojaTrabajadores);

  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_TRABAJADORES.length)
    .setValues([SCC_ENCABEZADOS_TRABAJADORES])
    .setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.getRange(2, SCC_CONFIG.columnas.dni, Math.max(1, hoja.getMaxRows() - 1), 1)
    .setNumberFormat('@');
  hoja.getRange(2, SCC_CONFIG.columnas.activo, Math.max(1, hoja.getMaxRows() - 1), 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Sí', 'No'], true)
        .setAllowInvalid(false)
        .build()
    );
  protegerColumnasTecnicas_(hoja);
  return hoja;
}

function protegerColumnasTecnicas_(hoja) {
  var descripcion = 'SCC - columnas técnicas E:H';
  var proteccion = hoja.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(function (item) { return item.getDescription() === descripcion; })[0];
  if (!proteccion) {
    proteccion = hoja.getRange(1, 5, hoja.getMaxRows(), 4).protect().setDescription(descripcion);
  } else {
    proteccion.setRange(hoja.getRange(1, 5, hoja.getMaxRows(), 4));
  }
  if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
}

function leerFilasTrabajadores_(hoja) {
  var ultimaFila = obtenerUltimaFilaAdministrativaScc_(hoja, [1, 2, 3, 4]);
  if (ultimaFila <= SCC_CONFIG.filaEncabezado) return [];
  return hoja.getRange(2, 1, ultimaFila - 1, 8).getValues().map(function (valores, indice) {
    return {
      fila: indice + 2,
      dni: valores[0],
      nombres: valores[1],
      apellidos: valores[2],
      activo: valores[3],
      estadoSync: valores[4],
      observacion: valores[5],
      idSistema: valores[6],
      ultimaSincronizacion: valores[7]
    };
  });
}

function sincronizarTrabajadores_() {
  var hoja = configurarHojaTrabajadores_();
  var filas = leerFilasTrabajadores_(hoja);
  var pendientes = filtrarFilasPendientesConDatosScc_(filas);
  if (!pendientes.length) return { procesadas: 0, errores: 0 };

  var resultados = procesarFilasPendientesScc_(
    pendientes,
    function (payload) { return llamarRpcSupabase_('admin_guardar_trabajador', payload); },
    function () { return new Date(); }
  );

  resultados.forEach(function (fila) {
    hoja.getRange(fila.fila, SCC_CONFIG.columnas.estadoSync, 1, 4).setValues([[
      fila.estadoSync,
      fila.observacion,
      fila.idSistema || '',
      fila.ultimaSincronizacion || ''
    ]]);
  });

  return {
    procesadas: resultados.length,
    errores: resultados.filter(function (fila) { return fila.estadoSync === 'ERROR'; }).length
  };
}

function actualizarTrabajadoresDesdeSistema_() {
  var hoja = configurarHojaTrabajadores_();
  var actuales = leerFilasTrabajadores_(hoja);
  if (tieneCambiosLocalesNoResueltosScc_(actuales)) {
    throw new Error(
      'Hay cambios locales pendientes o con error. Sincronízalos o resuélvelos antes de actualizar desde el sistema.'
    );
  }

  var respuesta = llamarRpcSupabase_('admin_listar_trabajadores', {});
  var trabajadores = normalizarListadoTrabajadoresScc_(respuesta);
  var ahora = new Date();
  var ultimaFila = Math.max(hoja.getLastRow(), 2);
  hoja.getRange(2, 1, ultimaFila - 1, 8).clearContent();

  if (trabajadores.length) {
    var valores = trabajadores.map(function (trabajador) {
      return [
        trabajador.dni,
        trabajador.nombres,
        trabajador.apellidos,
        trabajador.activo ? 'Sí' : 'No',
        'SINCRONIZADO',
        '',
        trabajador.id,
        ahora
      ];
    });
    hoja.getRange(2, 1, valores.length, 8).setValues(valores);
  }
  return trabajadores.length;
}

function marcarEdicionTrabajadores_(evento) {
  if (!evento || !evento.range) return;
  var rango = evento.range;
  var hoja = rango.getSheet();
  if (!debeMarcarPendienteOnEditScc_(
    hoja.getName(),
    rango.getRow(),
    rango.getColumn(),
    rango.getNumColumns()
  )) return;

  var filaInicial = Math.max(2, rango.getRow());
  var filaFinal = rango.getLastRow();
  if (filaFinal < filaInicial) return;
  var cantidad = filaFinal - filaInicial + 1;
  hoja.getRange(filaInicial, SCC_CONFIG.columnas.estadoSync, cantidad, 1)
    .setValues(Array.from({ length: cantidad }, function () { return ['PENDIENTE']; }));
  hoja.getRange(filaInicial, SCC_CONFIG.columnas.observacion, cantidad, 1).clearContent();
}
