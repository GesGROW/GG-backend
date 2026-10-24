function crearMenuScc_() {
  SpreadsheetApp.getUi()
    .createMenu('SCC')
    .addItem('Ver campaña de este archivo', 'menuMostrarCampaniaArchivo')
    .addItem('Sincronizar datos', 'menuSincronizarDatos')
    .addItem('Actualizar desde sistema', 'menuActualizarDesdeSistema')
    .addItem('Actualizar reportes', 'menuActualizarReportes')
    .addItem('Actualizar ranking', 'menuActualizarRanking')
    .addToUi();
}

function menuSincronizarDatos() {
  var ui = SpreadsheetApp.getUi();
  var trabajadores = ejecutarSincronizacionMaestroScc_(sincronizarTrabajadores_);
  var campanias = ejecutarSincronizacionMaestroScc_(sincronizarCampanias_);
  var variedades = ejecutarSincronizacionMaestroScc_(sincronizarVariedades_);
  var lotes = ejecutarSincronizacionMaestroScc_(sincronizarLotes_);
  var rolesCampania = ejecutarSincronizacionMaestroScc_(sincronizarRolesCampania_);

  ui.alert(
    'Sincronización terminada\n\n' +
    formatearResumenSincronizacionScc_('Trabajadores', trabajadores) +
    '\n\n' +
    formatearResumenSincronizacionScc_('Campañas', campanias) +
    '\n\n' +
    formatearResumenSincronizacionScc_('Variedades', variedades) +
    '\n\n' +
    formatearResumenSincronizacionScc_('Lotes', lotes) +
    '\n\n' +
    formatearResumenSincronizacionScc_('Roles campa\u00f1a', rolesCampania)
  );
}

function menuActualizarDesdeSistema() {
  var ui = SpreadsheetApp.getUi();
  try {
    var hoja = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var nombre = hoja ? hoja.getName() : '';
    var total;

    if (nombre === SCC_CONFIG.hojaTrabajadores) {
      total = actualizarTrabajadoresDesdeSistema_();
    } else if (nombre === SCC_CONFIG.hojaCampanias) {
      total = actualizarCampaniasDesdeSistema_();
    } else if (nombre === SCC_CONFIG.hojaVariedades) {
      total = actualizarVariedadesDesdeSistema_();
    } else if (nombre === SCC_CONFIG.hojaLotes) {
      total = actualizarLotesDesdeSistema_();
    } else if (nombre === SCC_CONFIG.hojaRolesCampania) {
      total = actualizarRolesCampaniaDesdeSistema_();
    } else if (esHojaReporteScc_(nombre)) {
      throw new Error('Esta hoja es un reporte. Usa SCC → Actualizar reportes.');
    } else {
      throw new Error(
        'Selecciona la hoja TRABAJADORES, CAMPANIAS, VARIEDADES, LOTES o ROLES_CAMPANIA antes de actualizar desde el sistema.'
      );
    }

    if (nombre === SCC_CONFIG.hojaCampanias || nombre === SCC_CONFIG.hojaVariedades) {
      refrescarValidacionesLotes_();
    }

    if (nombre === SCC_CONFIG.hojaTrabajadores || nombre === SCC_CONFIG.hojaCampanias) {
      refrescarValidacionesRolesCampania_();
    }

    ui.alert(nombre + ' actualizado desde el sistema. Registros: ' + total + '.');
  } catch (error) {
    ui.alert(error.message || 'No se pudo actualizar desde el sistema.');
  }
}

function menuActualizarReportes() {
  var ui = SpreadsheetApp.getUi();
  var resultados = actualizarReportes_();
  ui.alert(
    'Actualización de reportes terminada\n\n' +
    formatearResultadoActualizacionReportesScc_(resultados)
  );
}

function menuActualizarRanking() {
  SpreadsheetApp.getUi().alert(formatearResultadoActualizacionReportesScc_(actualizarRankingReporte_()));
}

function ejecutarSincronizacionMaestroScc_(sincronizar) {
  try {
    var resultado = sincronizar();
    return {
      procesadas: Number(resultado.procesadas || 0),
      errores: Number(resultado.errores || 0),
      errorGeneral: ''
    };
  } catch (error) {
    return {
      procesadas: 0,
      errores: 1,
      errorGeneral: error && error.message
        ? error.message
        : 'No se pudo sincronizar este maestro.'
    };
  }
}

function formatearResumenSincronizacionScc_(nombre, resultado) {
  var sincronizados = Math.max(0, resultado.procesadas - resultado.errores);
  var texto = nombre + ':\n' +
    sincronizados + ' sincronizados\n' +
    resultado.errores + (resultado.errores === 1 ? ' error' : ' errores');
  if (resultado.errorGeneral) texto += '\n' + resultado.errorGeneral;
  return texto;
}
