function onOpen() {
  crearMenuScc_();
  try {
    configurarHojaTrabajadores_();
  } catch (error) {
    Logger.log('No se pudo configurar TRABAJADORES al abrir: %s', error.message);
  }
  try {
    configurarHojaCampanias_();
  } catch (error) {
    Logger.log('No se pudo configurar CAMPANIAS al abrir: %s', error.message);
  }
  try {
    configurarHojaVariedades_();
  } catch (error) {
    Logger.log('No se pudo configurar VARIEDADES al abrir: %s', error.message);
  }
  try {
    configurarHojaLotes_();
  } catch (error) {
    Logger.log('No se pudo configurar LOTES al abrir: %s', error.message);
  }
  try {
    configurarHojaRolesCampania_();
  } catch (error) {
    Logger.log('No se pudo configurar ROLES_CAMPANIA al abrir: %s', error.message);
  }
  try {
    configurarHojasReportes_();
  } catch (error) {
    Logger.log('No se pudieron configurar los reportes al abrir: %s', error.message);
  }
}

function onEdit(e) {
  if (e && e.range && esHojaReporteScc_(e.range.getSheet().getName())) return;
  marcarEdicionTrabajadores_(e);
  marcarEdicionCampanias_(e);
  marcarEdicionVariedades_(e);
  marcarEdicionLotes_(e);
  marcarEdicionRolesCampania_(e);
}
