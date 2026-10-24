function configurarHojaCampanias_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaCampanias) ||
    libro.insertSheet(SCC_CONFIG.hojaCampanias);
  var filasDatos = Math.max(1, hoja.getMaxRows() - 1);

  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_CAMPANIAS.length)
    .setValues([SCC_ENCABEZADOS_CAMPANIAS])
    .setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.getRange(2, SCC_CONFIG.columnasCampanias.fechaInicio, filasDatos, 2)
    .setNumberFormat('dd/MM/yyyy');
  hoja.getRange(2, SCC_CONFIG.columnasCampanias.estado, filasDatos, 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['ACTIVA', 'CERRADA'], true)
        .setAllowInvalid(false)
        .build()
    );

  hoja.setColumnWidth(1, 140);
  hoja.setColumnWidth(2, 240);
  hoja.setColumnWidth(3, 110);
  hoja.setColumnWidth(4, 110);
  hoja.setColumnWidth(5, 100);
  hoja.setColumnWidth(6, 120);
  hoja.setColumnWidth(7, 300);
  hoja.setColumnWidth(8, 260);
  hoja.setColumnWidth(9, 170);
  protegerColumnasTecnicasCampanias_(hoja);
  return hoja;
}

function protegerColumnasTecnicasCampanias_(hoja) {
  var descripcion = 'SCC - CAMPANIAS - columnas técnicas F:I';
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

function leerFilasCampanias_(hoja) {
  var ultimaFila = obtenerUltimaFilaAdministrativaScc_(hoja, [1, 2, 3, 4, 5]);
  if (ultimaFila <= SCC_CONFIG.filaEncabezado) return [];
  return hoja.getRange(2, 1, ultimaFila - 1, 9).getValues().map(function (valores, indice) {
    return {
      fila: indice + 2,
      codigo: valores[0],
      nombre: valores[1],
      fechaInicio: valores[2],
      fechaFin: valores[3],
      estado: valores[4],
      estadoSync: valores[5],
      observacion: valores[6],
      idSistema: valores[7],
      ultimaSincronizacion: valores[8]
    };
  });
}

function obtenerZonaHorariaSpreadsheetScc_() {
  return SpreadsheetApp.getActive().getSpreadsheetTimeZone();
}

function crearFormateadorFechaCampaniaScc_() {
  var zonaHoraria = obtenerZonaHorariaSpreadsheetScc_();
  return function (fecha) {
    return Utilities.formatDate(fecha, zonaHoraria, 'yyyy-MM-dd');
  };
}

function parsearFechaCampaniaDesdePostgres_(valor) {
  var zonaHoraria = obtenerZonaHorariaSpreadsheetScc_();
  return convertirFechaPostgresParaHojaScc_(
    valor,
    function (texto, zona, formato) {
      return Utilities.parseDate(texto, zona, formato);
    },
    zonaHoraria
  );
}

function sincronizarCampanias_() {
  var hoja = configurarHojaCampanias_();
  var filas = leerFilasCampanias_(hoja);
  var pendientes = filtrarFilasPendientesConDatosScc_(filas);
  if (!pendientes.length) return { procesadas: 0, sincronizados: 0, errores: 0 };

  var resultados = procesarFilasPendientesCampaniasScc_(
    pendientes,
    function (payload) { return llamarRpcSupabase_('admin_guardar_campania', payload); },
    function () { return new Date(); },
    crearFormateadorFechaCampaniaScc_()
  );

  resultados.forEach(function (fila) {
    hoja.getRange(fila.fila, SCC_CONFIG.columnasCampanias.estadoSync, 1, 4).setValues([[
      fila.estadoSync,
      fila.observacion,
      fila.idSistema || '',
      fila.ultimaSincronizacion || ''
    ]]);
  });

  var errores = resultados.filter(function (fila) { return fila.estadoSync === 'ERROR'; }).length;
  return {
    procesadas: resultados.length,
    sincronizados: resultados.length - errores,
    errores: errores
  };
}

function actualizarCampaniasDesdeSistema_() {
  var hoja = configurarHojaCampanias_();
  var actuales = leerFilasCampanias_(hoja);
  if (tieneCambiosLocalesNoResueltosScc_(actuales)) {
    throw new Error(
      'Hay cambios locales pendientes o con error. Sincronízalos o resuélvelos antes de actualizar desde el sistema.'
    );
  }

  var respuesta = llamarRpcSupabase_('admin_listar_campanias', {});
  var campanias = normalizarListadoCampaniasScc_(respuesta);
  var ahora = new Date();
  var ultimaFila = Math.max(hoja.getLastRow(), 2);
  hoja.getRange(2, 1, ultimaFila - 1, 9).clearContent();

  if (campanias.length) {
    var valores = campanias.map(function (campania) {
      return [
        campania.codigo,
        campania.nombre,
        parsearFechaCampaniaDesdePostgres_(campania.fechaInicio),
        campania.fechaFin ? parsearFechaCampaniaDesdePostgres_(campania.fechaFin) : '',
        campania.estado,
        'SINCRONIZADO',
        '',
        campania.id,
        ahora
      ];
    });
    hoja.getRange(2, 1, valores.length, 9).setValues(valores);
    hoja.getRange(2, SCC_CONFIG.columnasCampanias.fechaInicio, valores.length, 2)
      .setNumberFormat('dd/MM/yyyy');
  }
  return campanias.length;
}

function marcarEdicionCampanias_(evento) {
  if (!evento || !evento.range) return;
  var rango = evento.range;
  var hoja = rango.getSheet();
  if (!debeMarcarPendienteCampaniasOnEditScc_(
    hoja.getName(),
    rango.getRow(),
    rango.getColumn(),
    rango.getNumColumns()
  )) return;

  var filaInicial = Math.max(2, rango.getRow());
  var filaFinal = rango.getLastRow();
  if (filaFinal < filaInicial) return;
  var cantidad = filaFinal - filaInicial + 1;
  hoja.getRange(filaInicial, SCC_CONFIG.columnasCampanias.estadoSync, cantidad, 1)
    .setValues(Array.from({ length: cantidad }, function () { return ['PENDIENTE']; }));
  hoja.getRange(filaInicial, SCC_CONFIG.columnasCampanias.observacion, cantidad, 1)
    .clearContent();
}
