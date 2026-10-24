var SCC_ENCABEZADOS_RANKING = ['Posición', 'DNI', 'Cosechador', 'Jabas', 'Última lectura', 'Cambio'];
var SCC_FILA_ENCABEZADO_RANKING = 11;
var SCC_ENCABEZADOS_PRODUCCION_DIARIA = ['Fecha', 'Jabas', 'Cosechadores', 'Sesiones'];
var SCC_ENCABEZADOS_PRODUCCION_LOTES = [
  'Lote',
  'Nombre',
  'Variedad',
  'Jabas',
  'Cosechadores',
  'Sesiones',
  'Última lectura'
];

function configurarHojasReportes_() {
  configurarHojaResumen_();
  configurarHojaRanking_();
  configurarHojaTablaReporte_(
    SCC_CONFIG.hojaProduccionDiaria,
    SCC_ENCABEZADOS_PRODUCCION_DIARIA,
    [110, 90, 120, 100]
  );
  configurarHojaTablaReporte_(
    SCC_CONFIG.hojaProduccionLotes,
    SCC_ENCABEZADOS_PRODUCCION_LOTES,
    [110, 180, 180, 90, 120, 100, 160]
  );
}

function obtenerOCrearHojaReporte_(nombre) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  return libro.getSheetByName(nombre) || libro.insertSheet(nombre);
}

function protegerHojaReporte_(hoja, rangosEditables) {
  var descripcion = 'SCC - reporte generado - ' + hoja.getName();
  var proteccion = hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .filter(function (item) { return item.getDescription() === descripcion; })[0];
  if (!proteccion) {
    proteccion = hoja.protect().setDescription(descripcion);
  }
  if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
  proteccion.setUnprotectedRanges(rangosEditables || []);
}

function configurarHojaRanking_() {
  var hoja = obtenerOCrearHojaReporte_(SCC_CONFIG.hojaRanking);
  // Traslada el reporte anterior sin perder sus filas al abrir el libro.
  if (hoja.getRange('A1').getValue() === 'Posición') {
    hoja.insertRowsBefore(1, SCC_FILA_ENCABEZADO_RANKING - 1);
  }
  hoja.getRange('A1').setValue('Ranking de cosechadores').setFontWeight('bold').setFontSize(16);
  hoja.getRange('A2').setValue('Período a consultar').setFontWeight('bold');
  var selector = hoja.getRange('B2');
  if (!selector.getValue()) selector.setValue('Campaña');
  selector.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Hoy', 'Semana', 'Mes', 'Campaña'], true)
    .setAllowInvalid(false).build()).setBackground('#e8f0fe');
  hoja.getRange('A9').setValue('Elige el período y usa SCC → Actualizar ranking. Incluye solo lecturas sincronizadas.');
  hoja.getRange(SCC_FILA_ENCABEZADO_RANKING, 1, 1, 6)
    .setValues([SCC_ENCABEZADOS_RANKING]).setFontWeight('bold')
    .setBackground('#17365d').setFontColor('#ffffff');
  hoja.setFrozenRows(SCC_FILA_ENCABEZADO_RANKING);
  [190, 280, 240, 260, 190, 140].forEach(function (ancho, indice) {
    hoja.setColumnWidth(indice + 1, ancho);
  });
  hoja.setRowHeights(2, 6, 32);
  hoja.getRange('A2:F7').setVerticalAlignment('middle');
  protegerHojaReporte_(hoja, [selector]);
  return hoja;
}

function configurarHojaResumen_() {
  var hoja = obtenerOCrearHojaReporte_(SCC_CONFIG.hojaResumen);
  hoja.getRange('A1').setValue('Resumen de campaña').setFontWeight('bold');
  hoja.setColumnWidth(1, 220);
  hoja.setColumnWidth(2, 220);
  protegerHojaReporte_(hoja);
  return hoja;
}

function configurarHojaTablaReporte_(nombre, encabezados, anchos) {
  var hoja = obtenerOCrearHojaReporte_(nombre);
  hoja.getRange(1, 1, 1, encabezados.length)
    .setValues([encabezados])
    .setFontWeight('bold');
  hoja.setFrozenRows(1);
  anchos.forEach(function (ancho, indice) {
    hoja.setColumnWidth(indice + 1, ancho);
  });
  protegerHojaReporte_(hoja);
  return hoja;
}

function parsearFechaCalendarioReporteDesdePostgres_(valor) {
  var zonaHoraria = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return convertirFechaCalendarioReporteParaHojaScc_(
    valor,
    function (texto, zona, formato) {
      return Utilities.parseDate(texto, zona, formato);
    },
    zonaHoraria
  );
}

function parsearTimestampReporteDesdePostgres_(valor) {
  return convertirTimestampReporteParaHojaScc_(valor, function (texto) {
    return new Date(texto);
  });
}

function limpiarContenidoReporte_(hoja) {
  var filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  hoja.getDataRange().clearContent();
}

function escribirResumenReporte_(reporte) {
  var hoja = configurarHojaResumen_();
  limpiarContenidoReporte_(hoja);

  hoja.getRange(1, 1, 13, 2).setValues([
    ['Resumen de campaña', ''],
    ['', ''],
    ['Campaña', reporte.campania.nombre],
    ['Fecha inicio', parsearFechaCalendarioReporteDesdePostgres_(reporte.campania.fechaInicio)],
    ['', ''],
    ['Total de jabas', reporte.resumen.totalJabas],
    ['Cosechadores con producción', reporte.resumen.totalCosechadores],
    ['Lotes con producción', reporte.resumen.totalLotes],
    ['Sesiones', reporte.resumen.totalSesiones],
    ['Días con producción', reporte.resumen.diasConProduccion],
    ['Última actividad', parsearTimestampReporteDesdePostgres_(reporte.resumen.ultimaLectura)],
    ['', ''],
    ['Última actualización', new Date()]
  ]);
  hoja.getRange('A1').setFontWeight('bold');
  hoja.getRange('A3:A13').setFontWeight('bold');
  hoja.getRange('B4').setNumberFormat('dd/MM/yyyy');
  hoja.getRange('B6:B10').setNumberFormat('0');
  hoja.getRange('B11').setNumberFormat('dd/MM/yyyy HH:mm');
  hoja.getRange('B13').setNumberFormat('dd/MM/yyyy HH:mm');
}

function escribirRankingReporte_(reporte) {
  var hoja = configurarHojaRanking_();
  var filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  var primeraFila = SCC_FILA_ENCABEZADO_RANKING + 1;
  var necesarias = SCC_FILA_ENCABEZADO_RANKING + Math.max(1, reporte.ranking.length);
  if (hoja.getMaxRows() < necesarias) hoja.insertRowsAfter(hoja.getMaxRows(), necesarias - hoja.getMaxRows());
  var anteriores = Math.max(1, hoja.getLastRow() - SCC_FILA_ENCABEZADO_RANKING);
  hoja.getRange(primeraFila, 1, anteriores, 6).clearContent().clearFormat();
  hoja.getRange(3, 1, 6, 6).clearContent();
  hoja.getRange(3, 1, 5, 2).setValues([
    ['Campaña', reporte.campania],
    ['Período mostrado', etiquetaPeriodoRankingScc_(reporte.periodo) + ': ' +
      formatearRangoRankingScc_(reporte.fechaDesde, reporte.fechaHasta)],
    [reporte.periodo === 'CAMPANIA' ? 'Acumulado anterior' : 'Comparado con',
      reporte.comparacionDisponible
        ? formatearRangoRankingScc_(reporte.fechaAnteriorDesde, reporte.fechaAnteriorHasta) : 'Sin comparación'],
    ['Total de jabas', reporte.totalJabas],
    ['Última actualización', new Date()]
  ]);
  hoja.getRange('D6:E6').setValues([
    ['Cosechadores con producción', reporte.totalCosechadores]
  ]);
  hoja.getRange('A3:A7').setFontWeight('bold');
  hoja.getRange('D6').setFontWeight('bold');
  hoja.getRange('B3:B5').setNumberFormat('@').setWrap(true);
  hoja.getRange('B6').setNumberFormat('0');
  hoja.getRange('E6').setNumberFormat('0');
  hoja.getRange('B7').setNumberFormat('dd/MM/yyyy HH:mm');
  hoja.getRange('A8').setValue('Cambio: ↑ sube | ↓ baja | = mantiene | Nuevo: sin producción anterior.');

  if (!reporte.ranking.length) {
    hoja.getRange(primeraFila, 1).setValue('Sin producción registrada en este período');
    hoja.setConditionalFormatRules([]);
    return;
  }

  var valores = reporte.ranking.map(function (fila) {
    var cambio = formatearCambioPosicionRankingScc_(fila, reporte.comparacionDisponible);
    return [
      fila.posicion,
      fila.cosechadorDni,
      fila.cosechador,
      fila.totalJabas,
      parsearTimestampReporteDesdePostgres_(fila.ultimaLectura),
      // Sheets interpreta un valor que empieza con '=' como fórmula.
      // El apóstrofo fuerza texto y no aparece en la celda.
      cambio === '=' ? "'=" : cambio
    ];
  });
  // El DNI se escribe como texto para conservar ceros iniciales.
  hoja.getRange(primeraFila, 2, valores.length, 1).setNumberFormat('@');
  hoja.getRange(primeraFila, 1, valores.length, 6).setValues(valores);
  hoja.getRange(primeraFila, 1, valores.length, 1).setNumberFormat('0');
  hoja.getRange(primeraFila, 4, valores.length, 1).setNumberFormat('0');
  hoja.getRange(primeraFila, 5, valores.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  hoja.getRange(SCC_FILA_ENCABEZADO_RANKING, 1, valores.length + 1, 6).createFilter();
  var tabla = hoja.getRange(primeraFila, 1, valores.length, 6);
  var cambios = hoja.getRange(primeraFila, 6, valores.length, 1);
  var reglas = ['#fff2cc', '#e7e6e6', '#fce4d6'].map(function (color, indice) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$A' + primeraFila + '=' + (indice + 1))
      .setBackground(color).setBold(true).setRanges([tabla]).build();
  });
  [['↑', '#137333'], ['↓', '#b3261e'], ['Nuevo', '#1a73e8']].forEach(function (estilo) {
    reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextContains(estilo[0])
      .setFontColor(estilo[1]).setRanges([cambios]).build());
  });
  // La hoja es generada: reemplazar las reglas evita duplicarlas al actualizar.
  hoja.setConditionalFormatRules(reglas);
}

function definicionRankingReporte_() {
  return {
    nombre: 'RANKING',
    consultar: function () {
      var hoja = obtenerOCrearHojaReporte_(SCC_CONFIG.hojaRanking);
      var periodo = hoja.getRange('A1').getValue() === 'Posición' ? 'Campaña' : hoja.getRange('B2').getValue() || 'Campaña';
      return llamarRpcSupabase_('admin_obtener_ranking_cosechadores_periodo',
        crearPayloadRankingReporteScc_(periodo, SpreadsheetApp.getActive().getSpreadsheetTimeZone()));
    },
    normalizar: normalizarRankingReporteScc_,
    escribir: escribirRankingReporte_
  };
}

function actualizarRankingReporte_() {
  return ejecutarActualizacionReportesScc_([definicionRankingReporte_()]);
}

function escribirProduccionDiariaReporte_(reporte) {
  var hoja = configurarHojaTablaReporte_(
    SCC_CONFIG.hojaProduccionDiaria,
    SCC_ENCABEZADOS_PRODUCCION_DIARIA,
    [110, 90, 120, 100]
  );
  limpiarContenidoReporte_(hoja);
  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_PRODUCCION_DIARIA.length)
    .setValues([SCC_ENCABEZADOS_PRODUCCION_DIARIA])
    .setFontWeight('bold');

  if (!reporte.produccion.length) return;

  var valores = reporte.produccion.map(function (fila) {
    return [
      parsearFechaCalendarioReporteDesdePostgres_(fila.fecha),
      fila.totalJabas,
      fila.totalCosechadores,
      fila.totalSesiones
    ];
  });
  hoja.getRange(2, 1, valores.length, 4).setValues(valores);
  hoja.getRange(2, 1, valores.length, 1).setNumberFormat('dd/MM/yyyy');
  hoja.getRange(2, 2, valores.length, 3).setNumberFormat('0');
  hoja.getRange(1, 1, valores.length + 1, 4).createFilter();
}

function escribirProduccionLotesReporte_(reporte) {
  var hoja = configurarHojaTablaReporte_(
    SCC_CONFIG.hojaProduccionLotes,
    SCC_ENCABEZADOS_PRODUCCION_LOTES,
    [110, 180, 180, 90, 120, 100, 160]
  );
  limpiarContenidoReporte_(hoja);
  hoja.getRange(1, 1, 1, SCC_ENCABEZADOS_PRODUCCION_LOTES.length)
    .setValues([SCC_ENCABEZADOS_PRODUCCION_LOTES])
    .setFontWeight('bold');

  if (!reporte.produccion.length) return;

  var valores = reporte.produccion.map(function (fila) {
    return [
      fila.loteCodigo,
      fila.loteNombre,
      fila.variedad,
      fila.totalJabas,
      fila.totalCosechadores,
      fila.totalSesiones,
      parsearTimestampReporteDesdePostgres_(fila.ultimaLectura)
    ];
  });
  hoja.getRange(2, 1, valores.length, 7).setValues(valores);
  hoja.getRange(2, 4, valores.length, 3).setNumberFormat('0');
  hoja.getRange(2, 7, valores.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  hoja.getRange(1, 1, valores.length + 1, 7).createFilter();
}

function actualizarReportes_() {
  var zonaHoraria = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return ejecutarActualizacionReportesScc_([
    {
      nombre: 'RESUMEN',
      consultar: function () {
        return llamarRpcSupabase_(
          'admin_obtener_resumen_campania',
          crearPayloadResumenReporteScc_(zonaHoraria)
        );
      },
      normalizar: normalizarResumenReporteScc_,
      escribir: escribirResumenReporte_
    },
    definicionRankingReporte_(),
    {
      nombre: 'PRODUCCION_DIARIA',
      consultar: function () {
        return llamarRpcSupabase_(
          'admin_obtener_produccion_diaria',
          crearPayloadProduccionDiariaReporteScc_(zonaHoraria)
        );
      },
      normalizar: normalizarProduccionDiariaReporteScc_,
      escribir: escribirProduccionDiariaReporte_
    },
    {
      nombre: 'PRODUCCION_LOTES',
      consultar: function () {
        return llamarRpcSupabase_('admin_obtener_produccion_lotes', {});
      },
      normalizar: normalizarProduccionLotesReporteScc_,
      escribir: escribirProduccionLotesReporte_
    }
  ]);
}
