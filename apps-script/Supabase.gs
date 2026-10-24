function obtenerPropiedadesSupabase_() {
  var propiedades = PropertiesService.getScriptProperties();
  var config = {
    url: propiedades.getProperty(SCC_CONFIG.propiedades.supabaseUrl),
    publishableKey: propiedades.getProperty(SCC_CONFIG.propiedades.publishableKey),
    email: propiedades.getProperty(SCC_CONFIG.propiedades.integrationEmail),
    password: propiedades.getProperty(SCC_CONFIG.propiedades.integrationPassword)
  };

  Object.keys(config).forEach(function (clave) {
    if (!config[clave]) throw new Error('Falta configurar una Script Property de Supabase');
  });
  config.url = config.url.replace(/\/$/, '');
  return config;
}

function limpiarTokenSupabase_() {
  CacheService.getScriptCache().remove('SCC_SUPABASE_ACCESS_TOKEN');
}

function autenticarSupabase_() {
  var config = obtenerPropiedadesSupabase_();
  var respuesta;
  try {
    respuesta = UrlFetchApp.fetch(config.url + '/auth/v1/token?grant_type=password', {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: config.publishableKey },
      payload: JSON.stringify({ email: config.email, password: config.password }),
      muteHttpExceptions: true
    });
  } catch (error) {
    throw new Error('No se pudo conectar con Supabase Auth');
  }

  var estado = respuesta.getResponseCode();
  var cuerpo = parsearJsonSeguro_(respuesta.getContentText());
  if (estado < 200 || estado >= 300 || !cuerpo || !cuerpo.access_token) {
    throw new Error(extraerMensajeSupabase_(cuerpo, 'No se pudo autenticar la integración'));
  }

  var ttl = Math.max(60, Math.min(Number(cuerpo.expires_in || 3600) - 60, 21000));
  CacheService.getScriptCache().put('SCC_SUPABASE_ACCESS_TOKEN', cuerpo.access_token, ttl);
  return cuerpo.access_token;
}

function obtenerTokenSupabase_() {
  return CacheService.getScriptCache().get('SCC_SUPABASE_ACCESS_TOKEN') || autenticarSupabase_();
}

function llamarRpcSupabase_(nombre, payload) {
  var peticion = prepararRpcArchivoScc_(nombre, payload);
  return llamarRpcSupabaseConReintento_(peticion.nombre, peticion.payload, false);
}

function llamarRpcSupabaseConReintento_(nombre, payload, reintentado) {
  var config = obtenerPropiedadesSupabase_();
  var token = obtenerTokenSupabase_();
  var respuesta;
  try {
    respuesta = UrlFetchApp.fetch(config.url + '/rest/v1/rpc/' + encodeURIComponent(nombre), {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: config.publishableKey,
        Authorization: 'Bearer ' + token
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (error) {
    throw new Error('No se pudo conectar con Supabase');
  }

  var estado = respuesta.getResponseCode();
  if (estado === 401 && !reintentado) {
    limpiarTokenSupabase_();
    autenticarSupabase_();
    return llamarRpcSupabaseConReintento_(nombre, payload, true);
  }

  var texto = respuesta.getContentText();
  var cuerpo = parsearJsonSeguro_(texto);
  if (estado < 200 || estado >= 300) {
    Logger.log('RPC %s respondió HTTP %s: %s', nombre, estado, texto.slice(0, 1000));
    throw new Error(extraerMensajeSupabase_(cuerpo, 'No se pudo completar la operación'));
  }
  if (cuerpo == null) throw new Error('Supabase devolvió una respuesta JSON inesperada');
  return cuerpo;
}

function parsearJsonSeguro_(texto) {
  try {
    return JSON.parse(texto);
  } catch (error) {
    return null;
  }
}

function extraerMensajeSupabase_(cuerpo, fallback) {
  if (!cuerpo || typeof cuerpo !== 'object') return fallback;
  return cuerpo.message || cuerpo.error_description || cuerpo.msg || cuerpo.error || fallback;
}
