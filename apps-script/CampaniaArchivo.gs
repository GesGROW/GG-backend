// El acceso personal lo controla Google Drive al compartir cada archivo por
// correo. Supabase autoriza la identidad técnica solo en sus campañas asignadas.
function obtenerContextoArchivoScc_() {
  var propiedades = PropertiesService.getScriptProperties();
  var campaniaId = String(propiedades.getProperty(SCC_CONFIG.propiedades.campaniaId) || '').trim();
  var spreadsheetId = String(propiedades.getProperty(SCC_CONFIG.propiedades.spreadsheetId) || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaniaId)) {
    throw new Error('Configure SCC_CAMPANIA_ID con el UUID de la campaña de este archivo.');
  }
  if (!spreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId() !== spreadsheetId) {
    throw new Error('Configure SCC_SPREADSHEET_ID con el ID de este archivo. No reutilice la configuración de otro archivo.');
  }
  return { campaniaId: campaniaId, spreadsheetId: spreadsheetId };
}

function prepararRpcArchivoScc_(nombre, payload) {
  var permitidos = [
    'admin_listar_trabajadores', 'admin_guardar_trabajador',
    'admin_listar_campanias', 'admin_guardar_campania',
    'admin_listar_variedades', 'admin_guardar_variedad',
    'admin_listar_lotes', 'admin_guardar_lote_variedades',
    'admin_listar_roles_campania', 'admin_guardar_rol_campania',
    'admin_obtener_resumen_campania', 'admin_obtener_produccion_diaria',
    'admin_obtener_produccion_lotes', 'admin_obtener_ranking_cosechadores_periodo',
    'admin_contexto_archivo'
  ];
  if (permitidos.indexOf(nombre) === -1) throw new Error('RPC no disponible para este archivo de campaña.');
  var contexto = obtenerContextoArchivoScc_();
  var parametros = Object.assign({}, payload || {});
  if (parametros.p_contexto_campania_id && parametros.p_contexto_campania_id !== contexto.campaniaId) {
    throw new Error('La petición no pertenece a la campaña de este archivo.');
  }
  if (parametros.p_campania_id && parametros.p_campania_id !== contexto.campaniaId) {
    throw new Error('La fila pertenece a otra campaña.');
  }
  parametros.p_contexto_campania_id = contexto.campaniaId;
  return { nombre: nombre + '_hoja', payload: parametros };
}

function menuMostrarCampaniaArchivo() {
  var ui = SpreadsheetApp.getUi();
  try {
    var respuesta = llamarRpcSupabase_('admin_contexto_archivo', {});
    if (!respuesta || respuesta.ok !== true || !respuesta.campania) throw new Error('Respuesta de campaña inválida.');
    ui.alert(respuesta.campania.cultivo_nombre + '\n' + respuesta.campania.nombre + '\n' + respuesta.campania.codigo + ' · ' + respuesta.campania.estado);
  } catch (error) {
    ui.alert(error.message);
  }
}
