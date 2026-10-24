function configurarHojaLotes_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaLotes) ||
    libro.insertSheet(SCC_CONFIG.hojaLotes);
  var filasDatos = Math.max(1, hoja.getMaxRows() - 1);

  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_LOTES.length)
    .setValues([SCC_ENCABEZADOS_LOTES])
    .setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.getRange(2, SCC_CONFIG.columnasLotes.activo, filasDatos, 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Sí', 'No'], true)
        .setAllowInvalid(false)
        .build()
    );

  hoja.setColumnWidth(1, 140);
  hoja.setColumnWidth(2, 220);
  hoja.setColumnWidth(3, 170);
  hoja.setColumnWidth(4, 180);
  hoja.setColumnWidth(5, 90);
  hoja.setColumnWidth(6, 120);
  hoja.setColumnWidth(7, 300);
  hoja.setColumnWidth(8, 260);
  hoja.setColumnWidth(9, 170);
  protegerColumnasTecnicasLotes_(hoja);
  refrescarValidacionesLotes_();
  return hoja;
}

function protegerColumnasTecnicasLotes_(hoja) {
  var descripcion = 'SCC - LOTES - columnas técnicas F:I';
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

function leerFilasLotes_(hoja) {
  var ultimaFila = obtenerUltimaFilaAdministrativaScc_(hoja, [1, 2, 3, 4, 5]);
  if (ultimaFila <= SCC_CONFIG.filaEncabezado) return [];
  return hoja.getRange(2, 1, ultimaFila - 1, 9).getValues().map(function (valores, indice) {
    return {
      fila: indice + 2,
      codigo: valores[0],
      nombre: valores[1],
      campania: valores[2],
      variedad: valores[3],
      activo: valores[4],
      estadoSync: valores[5],
      observacion: valores[6],
      idSistema: valores[7],
      ultimaSincronizacion: valores[8]
    };
  });
}

function refrescarValidacionesLotes_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaLotes);
  if (!hoja) return;

  var hojaCampanias = libro.getSheetByName(SCC_CONFIG.hojaCampanias);
  var hojaVariedades = libro.getSheetByName(SCC_CONFIG.hojaVariedades);
  var campanias = hojaCampanias ? leerFilasCampanias_(hojaCampanias) : [];
  var variedades = hojaVariedades ? leerFilasVariedades_(hojaVariedades) : [];
  var opcionesCampanias = obtenerOpcionesCampaniasLotesScc_(campanias);
  var opcionesVariedades = obtenerOpcionesVariedadesLotesScc_(variedades);
  var filasDatos = Math.max(1, hoja.getMaxRows() - 1);
  var rangoCampania = hoja.getRange(2, SCC_CONFIG.columnasLotes.campania, filasDatos, 1);
  var rangoVariedad = hoja.getRange(2, SCC_CONFIG.columnasLotes.variedad, filasDatos, 1);

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

  if (opcionesVariedades.length) {
    rangoVariedad.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(opcionesVariedades, true)
        .setAllowInvalid(true)
        .build()
    );
  } else {
    rangoVariedad.clearDataValidations();
  }
}

function sincronizarLotes_() {
  var hoja = configurarHojaLotes_();
  var filas = leerFilasLotes_(hoja);
  var pendientes = filtrarFilasPendientesConDatosScc_(filas);
  if (!pendientes.length) return { procesadas: 0, sincronizados: 0, errores: 0 };

  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hojaCampanias = libro.getSheetByName(SCC_CONFIG.hojaCampanias) || configurarHojaCampanias_();
  var hojaVariedades = libro.getSheetByName(SCC_CONFIG.hojaVariedades) || configurarHojaVariedades_();

  // Se releen después de sincronizar los maestros anteriores para que una sola
  // ejecución del menú pueda usar referencias recién creadas.
  var campanias = leerFilasCampanias_(hojaCampanias);
  var variedades = leerFilasVariedades_(hojaVariedades);
  var lotesOriginales = normalizarListadoLotesScc_(
    llamarRpcSupabase_('admin_listar_lotes', {})
  );

  var resultados = procesarFilasPendientesLotesScc_(
    pendientes,
    campanias,
    variedades,
    lotesOriginales,
    function (payload) { return llamarRpcSupabase_('admin_guardar_lote_variedades', payload); },
    function () { return new Date(); }
  );

  resultados.forEach(function (fila) {
    hoja.getRange(fila.fila, SCC_CONFIG.columnasLotes.estadoSync, 1, 4).setValues([[
      fila.estadoSync,
      fila.observacion,
      fila.idSistema || '',
      fila.ultimaSincronizacion || ''
    ]]);
  });

  refrescarValidacionesLotes_();
  var errores = resultados.filter(function (fila) { return fila.estadoSync === 'ERROR'; }).length;
  return {
    procesadas: resultados.length,
    sincronizados: resultados.length - errores,
    errores: errores
  };
}

function actualizarLotesDesdeSistema_() {
  var hoja = configurarHojaLotes_();
  var actuales = leerFilasLotes_(hoja);
  if (tieneCambiosLocalesNoResueltosScc_(actuales)) {
    throw new Error(
      'Hay cambios locales pendientes o con error. Sincronízalos o resuélvelos antes de actualizar desde el sistema.'
    );
  }

  var lotes = normalizarListadoLotesScc_(
    llamarRpcSupabase_('admin_listar_lotes', {})
  );
  var ahora = new Date();
  var ultimaFila = Math.max(hoja.getLastRow(), 2);
  hoja.getRange(2, 1, ultimaFila - 1, 9).clearContent();

  if (lotes.length) {
    var valores = lotes.map(function (lote) {
      return [
        lote.codigo,
        lote.nombre || '',
        lote.campaniaCodigo,
        lote.variedad,
        lote.activo ? 'Sí' : 'No',
        'SINCRONIZADO',
        '',
        lote.id,
        ahora
      ];
    });
    hoja.getRange(2, 1, valores.length, 9).setValues(valores);
  }

  refrescarValidacionesLotes_();
  return lotes.length;
}

function marcarEdicionLotes_(evento) {
  if (!evento || !evento.range) return;
  var rango = evento.range;
  var hoja = rango.getSheet();
  if (!debeMarcarPendienteLotesOnEditScc_(
    hoja.getName(),
    rango.getRow(),
    rango.getColumn(),
    rango.getNumColumns()
  )) return;

  var filaInicial = Math.max(2, rango.getRow());
  var filaFinal = rango.getLastRow();
  if (filaFinal < filaInicial) return;
  var cantidad = filaFinal - filaInicial + 1;
  hoja.getRange(filaInicial, SCC_CONFIG.columnasLotes.estadoSync, cantidad, 1)
    .setValues(Array.from({ length: cantidad }, function () { return ['PENDIENTE']; }));
  hoja.getRange(filaInicial, SCC_CONFIG.columnasLotes.observacion, cantidad, 1)
    .clearContent();
}
