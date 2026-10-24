function configurarHojaVariedades_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SCC_CONFIG.hojaVariedades) ||
    libro.insertSheet(SCC_CONFIG.hojaVariedades);
  var filasDatos = Math.max(1, hoja.getMaxRows() - 1);

  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_VARIEDADES.length)
    .setValues([SCC_ENCABEZADOS_VARIEDADES])
    .setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.getRange(2, SCC_CONFIG.columnasVariedades.activo, filasDatos, 1)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Sí', 'No'], true)
        .setAllowInvalid(false)
        .build()
    );

  hoja.setColumnWidth(1, 240);
  hoja.setColumnWidth(2, 100);
  hoja.setColumnWidth(3, 120);
  hoja.setColumnWidth(4, 300);
  hoja.setColumnWidth(5, 260);
  hoja.setColumnWidth(6, 170);
  protegerColumnasTecnicasVariedades_(hoja);
  return hoja;
}

function protegerColumnasTecnicasVariedades_(hoja) {
  var descripcion = 'SCC - VARIEDADES - columnas técnicas C:F';
  var proteccion = hoja.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter(function (item) { return item.getDescription() === descripcion; })[0];
  if (!proteccion) {
    proteccion = hoja.getRange(1, 3, hoja.getMaxRows(), 4)
      .protect()
      .setDescription(descripcion);
  } else {
    proteccion.setRange(hoja.getRange(1, 3, hoja.getMaxRows(), 4));
  }
  if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
}

function leerFilasVariedades_(hoja) {
  var ultimaFila = obtenerUltimaFilaAdministrativaScc_(hoja, [1, 2]);
  if (ultimaFila <= SCC_CONFIG.filaEncabezado) return [];
  return hoja.getRange(2, 1, ultimaFila - 1, 6).getValues().map(function (valores, indice) {
    return {
      fila: indice + 2,
      nombre: valores[0],
      activo: valores[1],
      estadoSync: valores[2],
      observacion: valores[3],
      idSistema: valores[4],
      ultimaSincronizacion: valores[5]
    };
  });
}

function sincronizarVariedades_() {
  var hoja = configurarHojaVariedades_();
  var filas = leerFilasVariedades_(hoja);
  var pendientes = filtrarFilasPendientesConDatosScc_(filas);
  if (!pendientes.length) return { procesadas: 0, sincronizados: 0, errores: 0 };

  var resultados = procesarFilasPendientesVariedadesScc_(
    pendientes,
    function (payload) { return llamarRpcSupabase_('admin_guardar_variedad', payload); },
    function () { return new Date(); }
  );

  resultados.forEach(function (fila) {
    hoja.getRange(fila.fila, SCC_CONFIG.columnasVariedades.estadoSync, 1, 4).setValues([[
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

function actualizarVariedadesDesdeSistema_() {
  var hoja = configurarHojaVariedades_();
  var actuales = leerFilasVariedades_(hoja);
  if (tieneCambiosLocalesNoResueltosScc_(actuales)) {
    throw new Error(
      'Hay cambios locales pendientes o con error. Sincronízalos o resuélvelos antes de actualizar desde el sistema.'
    );
  }

  var respuesta = llamarRpcSupabase_('admin_listar_variedades', {});
  var variedades = normalizarListadoVariedadesScc_(respuesta);
  var ahora = new Date();
  var ultimaFila = Math.max(hoja.getLastRow(), 2);
  hoja.getRange(2, 1, ultimaFila - 1, 6).clearContent();

  if (variedades.length) {
    var valores = variedades.map(function (variedad) {
      return [
        variedad.nombre,
        variedad.activo ? 'Sí' : 'No',
        'SINCRONIZADO',
        '',
        variedad.id,
        ahora
      ];
    });
    hoja.getRange(2, 1, valores.length, 6).setValues(valores);
  }
  return variedades.length;
}

function marcarEdicionVariedades_(evento) {
  if (!evento || !evento.range) return;
  var rango = evento.range;
  var hoja = rango.getSheet();
  if (!debeMarcarPendienteVariedadesOnEditScc_(
    hoja.getName(),
    rango.getRow(),
    rango.getColumn(),
    rango.getNumColumns()
  )) return;

  var filaInicial = Math.max(2, rango.getRow());
  var filaFinal = rango.getLastRow();
  if (filaFinal < filaInicial) return;
  var cantidad = filaFinal - filaInicial + 1;
  hoja.getRange(filaInicial, SCC_CONFIG.columnasVariedades.estadoSync, cantidad, 1)
    .setValues(Array.from({ length: cantidad }, function () { return ['PENDIENTE']; }));
  hoja.getRange(filaInicial, SCC_CONFIG.columnasVariedades.observacion, cantidad, 1)
    .clearContent();
}
