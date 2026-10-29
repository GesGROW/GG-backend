const numero = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

export function resumirClima(datos, ahora = Date.now()) {
  const current = datos?.current
  const temperatura = numero(current?.temp_c)
  if (temperatura === null || !datos?.location?.name)
    throw new Error('Respuesta meteorológica incompleta')
  const horas = (datos.forecast?.forecastday ?? [])
    .flatMap((d) => d.hour ?? [])
    .filter(
      (h) =>
        numero(h.time_epoch) !== null &&
        h.time_epoch * 1000 + 3_600_000 > ahora &&
        h.time_epoch * 1000 < ahora + 3 * 3_600_000
    )
  const probabilidades = horas
    .map((h) => numero(h.chance_of_rain))
    .filter((n) => n !== null && n >= 0 && n <= 100)
  const icono = String(current.condition?.icon ?? '')
  const iconoSeguro =
    /^(?:https:)?\/\/cdn\.weatherapi\.com\/weather\/64x64\/(day|night)\/\d+\.png$/.test(
      icono
    )
      ? 'https:' + icono.replace(/^https:/, '')
      : null
  const actualizado = numero(current.last_updated_epoch)
  return {
    ubicacion: String(datos.location.name).slice(0, 100),
    temperatura,
    condicion: String(current.condition?.text ?? '').slice(0, 100),
    icono: iconoSeguro,
    humedad: numero(current.humidity),
    viento: numero(current.wind_kph),
    probabilidadLluvia: probabilidades.length ? Math.max(...probabilidades) : null,
    horasPronostico: probabilidades.length ? 3 : null,
    actualizadoEn:
      actualizado === null ? null : new Date(actualizado * 1000).toISOString(),
    zonaHoraria: String(datos.location.tz_id || 'America/Lima')
  }
}

export function crearProveedorClima({
  obtenerClave,
  fetcher = fetch,
  ahora = Date.now
}) {
  const cache = new Map(),
    pendientes = new Map()
  return async ({ latitud, longitud, ip }) => {
    const consulta = ip ?? `${latitud.toFixed(2)},${longitud.toFixed(2)}`
    const celda = ip ? 'ip:' + ip : consulta
    const guardado = cache.get(celda)
    if (guardado && guardado.hasta > ahora()) return guardado.datos
    if (pendientes.has(celda)) return pendientes.get(celda)
    const tarea = (async () => {
      const clave = await obtenerClave()
      if (!clave) throw new Error('Proveedor no configurado')
      const url = new URL('https://api.weatherapi.com/v1/forecast.json')
      url.search = new URLSearchParams({
        key: clave,
        q: consulta,
        days: '2',
        lang: 'es',
        aqi: 'no',
        alerts: 'no'
      }).toString()
      const respuesta = await fetcher(url, { signal: AbortSignal.timeout(8000) })
      if (!respuesta.ok) throw new Error('Proveedor no disponible')
      const datos = resumirClima(await respuesta.json(), ahora())
      if (cache.size >= 512) cache.delete(cache.keys().next().value)
      cache.set(celda, { datos, hasta: ahora() + 15 * 60_000 })
      return datos
    })()
    pendientes.set(celda, tarea)
    try {
      return await tarea
    } finally {
      pendientes.delete(celda)
    }
  }
}
