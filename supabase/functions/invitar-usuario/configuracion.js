// Configuración de servidor, nunca obtenida del Origin o payload de la petición.
export function resolverOrigenPortal({ supabaseUrl, portalOrigin, deployment }) {
  const origen =
    portalOrigin ??
    (supabaseUrl === deployment.supabaseUrl ? deployment.portalOrigin : '')
  if (!origen) throw new Error('PORTAL_ORIGIN no configurado para este proyecto.')
  const url = new URL(origen)
  if (
    url.origin !== origen ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    throw new Error(
      'PORTAL_ORIGIN debe ser un origen HTTPS o de desarrollo local, sin ruta.'
    )
  return origen
}
