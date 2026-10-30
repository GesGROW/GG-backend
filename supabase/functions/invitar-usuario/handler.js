// Transporte HTTP reemplazable; sin credenciales ni SDK. La composición del
// proveedor y del repositorio privilegiado sólo existe en index.ts del servidor.
export function crearHandlerInvitacion({
  crearCaso,
  portalOrigin,
  allowedOrigins = []
}) {
  const permitidos = new Set([portalOrigin, ...allowedOrigins])
  return async (request) => {
    const origin = request.headers.get('origin')
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin':
        origin && permitidos.has(origin) ? origin : portalOrigin,
      Vary: 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
    const response = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers })
    if (!portalOrigin || (origin && !permitidos.has(origin)))
      return response({ error: 'Origen no autorizado.' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers })
    if (request.method !== 'POST')
      return response({ error: 'Método no permitido.' }, 405)
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer '))
      return response({ error: 'Sesión requerida.' }, 401)
    try {
      const body = await request.json()
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).some(
          (k) =>
            ![
              'operacionId',
              'tenantId',
              'email',
              'nombre',
              'roles',
              'trabajadorId'
            ].includes(k)
        ) ||
        !body.operacionId ||
        !body.tenantId ||
        !Array.isArray(body.roles)
      )
        return response({ error: 'Solicitud inválida.' }, 400)
      const provisionar = crearCaso(authorization)
      return response(await provisionar(body))
    } catch (error) {
      if (error?.status === 401) return response({ error: 'Sesión expirada.' }, 401)
      if (error?.status === 429 && error?.code === 'over_email_send_rate_limit')
        return response(
          {
            code: 'EMAIL_RATE_LIMIT',
            error:
              'Se alcanzó el límite temporal de envío de correos. Espera antes de reintentar esta misma invitación.'
          },
          429
        )
      if (error?.code === '42501')
        return response(
          { error: 'No tiene autorización para este usuario o empresa.' },
          403
        )
      // No devolver detalles del proveedor, tokens o enumeración de cuentas.
      return response(
        { error: 'No se pudo completar el alta. Reintente con la misma solicitud.' },
        400
      )
    }
  }
}
