import { isIP } from 'node:net'

export function crearHandlerClima({
  verificarSesion,
  consultar,
  origenes,
  ahora = Date.now
}) {
  const usuarios = new Map()
  return async (request) => {
    const origen = request.headers.get('origin')
    const permitido = !origen || origenes.includes(origen)
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(permitido && origen ? { 'Access-Control-Allow-Origin': origen } : {})
    }
    const respuesta = (datos, status = 200) =>
      new Response(JSON.stringify(datos), { status, headers })
    if (!permitido) return respuesta({ error: 'Origen no autorizado' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers })
    if (request.method !== 'POST')
      return respuesta({ error: 'Método no permitido' }, 405)
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer '))
      return respuesta({ error: 'Sesión requerida' }, 401)
    let usuario
    try {
      usuario = await verificarSesion(auth.slice(7))
    } catch {
      return respuesta({ error: 'Sesión no disponible' }, 401)
    }
    if (!usuario) return respuesta({ error: 'Sesión requerida' }, 401)
    let body
    try {
      const texto = await request.text()
      if (texto.length > 512) return respuesta({ error: 'Solicitud inválida' }, 400)
      body = JSON.parse(texto)
    } catch {
      return respuesta({ error: 'Solicitud inválida' }, 400)
    }
    const aproximada = body?.ubicacionAproximada === true
    const coordenadasValidas = body && !Array.isArray(body) &&
      Object.keys(body).every((k) => ['latitud', 'longitud'].includes(k)) &&
      typeof body.latitud === 'number' && Number.isFinite(body.latitud) && Math.abs(body.latitud) <= 90 &&
      typeof body.longitud === 'number' && Number.isFinite(body.longitud) && Math.abs(body.longitud) <= 180
    if (!coordenadasValidas && !(aproximada && Object.keys(body).length === 1))
      return respuesta({ error: 'Coordenadas inválidas' }, 400)
    // La IP se obtiene del proxy de Supabase, no de un campo enviado por React.
    // Se usa sólo para el proveedor meteorológico, nunca para autorizar la sesión.
    const ip = aproximada ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : null
    if (aproximada && (!ip || !isIP(ip)))
      return respuesta({ error: 'Ubicación no disponible' }, 503)
    let limite = usuarios.get(usuario)
    if (!limite || limite.hasta <= ahora()) {
      if (usuarios.size >= 2048) usuarios.delete(usuarios.keys().next().value)
      limite = { hasta: ahora() + 15 * 60_000, cantidad: 0 }
      usuarios.set(usuario, limite)
    }
    if (++limite.cantidad > 20) return respuesta({ error: 'Reintenta más tarde' }, 429)
    try {
      const datos = await consultar(aproximada ? { ip } : body)
      return respuesta({ ...datos, ubicacionAproximada: aproximada })
    } catch {
      return respuesta({ error: 'Clima no disponible' }, 503)
    }
  }
}
