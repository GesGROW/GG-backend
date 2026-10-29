import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import {
  crearProveedorClima,
  resumirClima
} from '../supabase/functions/clima/weatherapi.js'
import { crearHandlerClima } from '../supabase/functions/clima/handler.js'

const ahora = Date.parse('2026-10-29T04:30:00Z')
function datos() {
  return {
    location: { name: 'Lima', tz_id: 'America/Lima' },
    current: {
      temp_c: 21.5,
      humidity: 70,
      wind_kph: 12.6,
      last_updated_epoch: ahora / 1000,
      condition: {
        text: 'Despejado',
        icon: '//cdn.weatherapi.com/weather/64x64/night/113.png'
      },
      secret: 'no-publicar'
    },
    forecast: {
      forecastday: [
        { hour: [{ time_epoch: ahora / 1000 - 1800, chance_of_rain: 10 }] },
        {
          hour: [
            { time_epoch: ahora / 1000 + 1800, chance_of_rain: 65 },
            { time_epoch: ahora / 1000 + 14400, chance_of_rain: 99 }
          ]
        }
      ]
    }
  }
}
test('clima: devuelve sólo el resumen y usa horas próximas cruzando medianoche', () => {
  const r = resumirClima(datos(), ahora)
  assert.equal(r.probabilidadLluvia, 65)
  assert.equal(r.temperatura, 21.5)
  assert.equal(r.icono, 'https://cdn.weatherapi.com/weather/64x64/night/113.png')
  assert.ok(!JSON.stringify(r).includes('no-publicar'))
  const d = datos()
  d.current.condition.icon = 'https://evil.test/x.png'
  d.forecast = {}
  delete d.current.humidity
  const incompleto = resumirClima(d, ahora)
  assert.equal(incompleto.icono, null)
  assert.equal(incompleto.probabilidadLluvia, null)
  assert.equal(incompleto.humedad, null)
  assert.throws(() => resumirClima({}), /incompleta/)
})
test('clima: solicitudes simultáneas y cercanas comparten caché sin enviar coordenadas exactas', async () => {
  let reloj = ahora,
    llamadas = 0
  const proveedor = crearProveedorClima({
    obtenerClave: async () => 'clave-de-prueba',
    ahora: () => reloj,
    fetcher: async (url) => {
      llamadas++
      assert.equal(url.hostname, 'api.weatherapi.com')
      assert.equal(url.searchParams.get('q'), '-12.05,-77.04')
      return Response.json(datos())
    }
  })
  await Promise.all([
    proveedor({ latitud: -12.051234, longitud: -77.041234 }),
    proveedor({ latitud: -12.05234, longitud: -77.04234 })
  ])
  assert.equal(llamadas, 1)
  await proveedor({ latitud: -12.05, longitud: -77.04 })
  assert.equal(llamadas, 1)
  reloj += 15 * 60_000
  await proveedor({ latitud: -12.05, longitud: -77.04 })
  assert.equal(llamadas, 2)
})
test('clima: HTTP protege sesión, origen, coordenadas y errores del proveedor', async () => {
  let llamadas = 0
  const handler = crearHandlerClima({
    origenes: ['https://portal.test'],
    verificarSesion: async (token) => (token === 'valido' ? 'usuario' : null),
    consultar: async () => {
      llamadas++
      throw new Error('secreto-interno')
    }
  })
  const req = (body, token = 'valido', origin = 'https://portal.test') =>
    new Request('https://edge.test/clima', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Origin: origin },
      body: JSON.stringify(body)
    })
  assert.equal((await handler(req({}, 'invalido'))).status, 401)
  assert.equal((await handler(req({}, 'valido', 'https://evil.test'))).status, 403)
  for (const body of [
    { latitud: 91, longitud: 0 },
    { latitud: '0', longitud: 0 },
    { latitud: 0, longitud: 0, url: 'https://evil.test' }
  ])
    assert.equal((await handler(req(body))).status, 400)
  assert.equal(llamadas, 0)
  const fallo = await handler(req({ latitud: 0, longitud: 0 }))
  assert.equal(fallo.status, 503)
  assert.deepEqual(await fallo.json(), { error: 'Clima no disponible' })
  assert.equal(fallo.headers.get('Access-Control-Allow-Origin'), 'https://portal.test')
})
test('clima: ubicación aproximada usa sólo la IP del proxy y no la devuelve', async () => {
  const consultas = []
  const proveedor = crearProveedorClima({
    obtenerClave: async () => 'clave-test',
    ahora: () => ahora,
    fetcher: async (url) => {
      consultas.push(url.searchParams.get('q'))
      return Response.json(datos())
    }
  })
  const handler = crearHandlerClima({
    verificarSesion: async () => 'usuario',
    consultar: proveedor,
    origenes: ['https://portal.test']
  })
  const req = (body, ip) => new Request('https://edge.test/clima', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valido',
      Origin: 'https://portal.test',
      ...(ip ? { 'x-forwarded-for': ip } : {})
    },
    body: JSON.stringify(body)
  })
  for (const ip of [undefined, 'auto:ip', 'https://evil.test'])
    assert.equal((await handler(req({ ubicacionAproximada: true }, ip))).status, 503)
  assert.equal((await handler(req({ ubicacionAproximada: true, ip: '1.1.1.1' }, '8.8.8.8'))).status, 400)
  assert.equal(consultas.length, 0)
  for (let i = 0; i < 2; i++) {
    const r = await handler(req({ ubicacionAproximada: true }, '8.8.8.8, 10.0.0.1'))
    assert.equal(r.status, 200)
    const resumen = await r.json()
    assert.equal(resumen.ubicacionAproximada, true)
    assert.equal(resumen.ubicacion, 'Lima')
    assert.ok(!JSON.stringify(resumen).includes('8.8.8.8'))
  }
  assert.deepEqual(consultas, ['8.8.8.8'])
})

test('clima: RPC de secretos inaccesible a usuarios y anónimos; sólo servidor', async () => {
  const db = new PGlite()
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text); insert into vault.decrypted_secrets values('WEATHERAPI_KEY','clave-test');"
    )
    const path = new URL('../supabase/migrations/', import.meta.url)
    const { readdirSync } = await import('node:fs')
    const archivo = readdirSync(path).find((n) =>
      n.endsWith('_clima_weatherapi_secreto.sql')
    )
    await db.exec(readFileSync(new URL(archivo, path), 'utf8'))
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role)
      await assert.rejects(
        db.query('select public.clima_weatherapi_clave()'),
        /permission denied/
      )
      await assert.rejects(
        db.query('select clima_privado.weatherapi_clave()'),
        /permission denied/
      )
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal(
      (await db.query('select public.clima_weatherapi_clave() as clave')).rows[0].clave,
      'clave-test'
    )
  } finally {
    await db.close()
  }
})
