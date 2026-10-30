import assert from 'node:assert/strict'
import test from 'node:test'
import { crearProvisionarUsuario } from '@gesgrow/core/contexts/identity-access/index.js'
import { crearHandlerInvitacion } from '../supabase/functions/invitar-usuario/handler.js'
import {
  resolverOrigenPortal,
  resolverOrigenesPortal
} from '../supabase/functions/invitar-usuario/configuracion.js'

function fixture({ existente = false } = {}) {
  const calls = [],
    recibo = { usuarioId: 'usuario', membresiaId: 'm', tenantId: 'A' }
  let sujeto = existente ? 'subject' : null,
    completada = false
  const puertos = {
    autorizacion: {
      async verificarSesion() {
        calls.push('sesion')
      }
    },
    registro: {
      async preparar() {
        calls.push('preparar')
        return {
          id: 'op',
          estado: completada ? 'COMPLETADA' : 'PENDIENTE',
          resultado: completada ? recibo : null
        }
      },
      async destinatario() {
        calls.push('destino')
        return { email: 'usuario@example.test', sujeto }
      },
      async completar(id, idProveedor) {
        calls.push(['completar', id, idProveedor])
        completada = true
        return recibo
      }
    },
    proveedor: {
      async invitar() {
        calls.push('invitar')
        sujeto = 'subject'
        return sujeto
      }
    }
  }
  return {
    puertos,
    calls,
    recibo,
    crearEnProveedor: () => {
      sujeto = 'subject'
    }
  }
}
test('backend valida sesión, registra intención, invita y confirma; reintento no reenvía correo', async () => {
  const f = fixture(),
    provisionar = crearProvisionarUsuario(f.puertos)
  assert.deepEqual(await provisionar({}), f.recibo)
  assert.deepEqual(f.calls, [
    'sesion',
    'preparar',
    'destino',
    'invitar',
    ['completar', 'op', 'subject']
  ])
  f.calls.length = 0
  assert.deepEqual(await provisionar({}), f.recibo)
  assert.deepEqual(f.calls, ['sesion', 'preparar'])
})
test('identidad existente se vincula por registro confiable sin invitar nuevamente', async () => {
  const f = fixture({ existente: true })
  await crearProvisionarUsuario(f.puertos)({ sujeto: 'arbitrario' })
  assert.equal(f.calls.includes('invitar'), false)
  assert.deepEqual(f.calls.at(-1), ['completar', 'op', 'subject'])
})

test('cuenta existente recibe acceso tras vincularse y reintenta un fallo de envío sin duplicar la cuenta', async () => {
  const f = fixture({ existente: true })
  let enviada = false,
    envios = 0
  f.puertos.registro.prepararEntrega = async () => ({ tipo: 'ACCESO', enviada })
  f.puertos.registro.confirmarEntrega = async () => {
    enviada = true
  }
  f.puertos.proveedor.enviarAcceso = async (email, id) => {
    assert.equal(email, 'usuario@example.test')
    assert.equal(id, 'op')
    assert.ok(f.calls.some((c) => Array.isArray(c) && c[0] === 'completar'))
    if (++envios === 1) throw new Error('SMTP temporal')
  }
  const provisionar = crearProvisionarUsuario(f.puertos)
  await assert.rejects(provisionar({}), /SMTP temporal/)
  assert.deepEqual(await provisionar({}), f.recibo)
  assert.equal(enviada, true)
  assert.equal(envios, 2)
  await provisionar({})
  assert.equal(envios, 2)
  assert.equal(f.calls.includes('invitar'), false)
})
test('sesión o permiso rechazados detienen el aprovisionamiento antes del proveedor', async () => {
  for (const metodo of ['sesion', 'permiso']) {
    const f = fixture()
    if (metodo === 'sesion')
      f.puertos.autorizacion.verificarSesion = async () => {
        throw new Error('Sesión revocada')
      }
    else
      f.puertos.registro.preparar = async () => {
        throw new Error('Permiso insuficiente')
      }
    await assert.rejects(
      crearProvisionarUsuario(f.puertos)({}),
      /revocada|insuficiente/
    )
    assert.equal(f.calls.includes('invitar'), false)
    assert.equal(f.calls.includes('destino'), false)
  }
})
test('respuesta perdida del proveedor y fallo al confirmar se recuperan sin identidades duplicadas', async () => {
  const f = fixture()
  f.puertos.proveedor.invitar = async () => {
    f.crearEnProveedor()
    throw new Error('Respuesta perdida')
  }
  const completar = f.puertos.registro.completar
  f.puertos.registro.completar = async () => {
    throw new Error('Backend caído')
  }
  const provisionar = crearProvisionarUsuario(f.puertos)
  await assert.rejects(provisionar({}), /Backend caído/)
  f.puertos.registro.completar = completar
  assert.deepEqual(await provisionar({}), f.recibo)
})
test('fallo real de proveedor se conserva y no crea membresía', async () => {
  const f = fixture()
  f.puertos.proveedor.invitar = async () => {
    throw new Error('SMTP')
  }
  await assert.rejects(crearProvisionarUsuario(f.puertos)({}), /SMTP/)
  assert.equal(
    f.calls.some((c) => Array.isArray(c) && c[0] === 'completar'),
    false
  )
})
const origin = 'https://portal.example.test'
test('el origen configurado queda restringido al proyecto y nunca procede de la petición', () => {
  const deployment = {
    supabaseUrl: 'https://proyecto.supabase.co',
    portalOrigin: 'http://localhost:5174'
  }
  assert.equal(
    resolverOrigenPortal({ supabaseUrl: deployment.supabaseUrl, deployment }),
    deployment.portalOrigin
  )
  assert.throws(
    () => resolverOrigenPortal({ supabaseUrl: 'https://otro.supabase.co', deployment }),
    /no configurado/
  )
  assert.equal(
    resolverOrigenPortal({
      supabaseUrl: deployment.supabaseUrl,
      deployment,
      portalOrigin: origin
    }),
    origin
  )
  for (const portalOrigin of [
    '',
    'https://portal.test/ruta',
    'https://portal.test/',
    'https://u:p@portal.test',
    'http://ajeno.test',
    'javascript:alert(1)'
  ])
    assert.throws(
      () =>
        resolverOrigenPortal({
          supabaseUrl: deployment.supabaseUrl,
          deployment,
          portalOrigin
        }),
      /origen|configurado/
    )
})
const datos = {
  operacionId: 'op',
  tenantId: 'A',
  email: 'u@example.test',
  nombre: 'U',
  roles: []
}
test('producción y desarrollo tienen preflight autorizado sin abrir otros dominios ni ejecutar el alta', async () => {
  const deployment = {
    supabaseUrl: 'https://proyecto.supabase.co',
    portalOrigin: 'https://gg-portal-beige.vercel.app',
    allowedOrigins: ['http://localhost:5174']
  }
  const allowedOrigins = resolverOrigenesPortal({
    supabaseUrl: deployment.supabaseUrl,
    deployment
  })
  assert.deepEqual(allowedOrigins, [
    'https://gg-portal-beige.vercel.app',
    'http://localhost:5174'
  ])
  const handler = crearHandlerInvitacion({
    portalOrigin: deployment.portalOrigin,
    allowedOrigins,
    crearCaso: () => {
      throw new Error('No debe crear solicitudes en preflight')
    }
  })
  for (const origin of allowedOrigins) {
    const r = await handler(
      new Request('https://backend.example.test/invitar', {
        method: 'OPTIONS',
        headers: { origin }
      })
    )
    assert.equal(r.status, 204)
    assert.equal(r.headers.get('access-control-allow-origin'), origin)
    assert.equal(r.headers.get('vary'), 'Origin')
  }
  for (const origin of [
    'https://gg-portal-beige.vercel.app.ajeno.test',
    'https://otra-vista.vercel.app',
    'http://localhost:5175'
  ]) {
    assert.equal(
      (
        await handler(
          new Request('https://backend.example.test/invitar', {
            method: 'OPTIONS',
            headers: { origin }
          })
        )
      ).status,
      403
    )
  }
  assert.throws(
    () =>
      resolverOrigenesPortal({
        supabaseUrl: deployment.supabaseUrl,
        deployment: { ...deployment, allowedOrigins: ['https://ajeno.test/ruta'] }
      }),
    /origen/
  )
  assert.deepEqual(
    resolverOrigenesPortal({
      supabaseUrl: 'https://otro.supabase.co',
      portalOrigin: 'https://otro-portal.example.test',
      deployment
    }),
    ['https://otro-portal.example.test']
  )
})
const request = (body = datos, headers = {}, method = 'POST') =>
  new Request('https://backend.example.test/invitar', {
    method,
    headers: { origin, authorization: 'Bearer sesión', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
  })
test('transporte exige sesión, origen y payload limitado; no ejecuta credenciales del cliente', async () => {
  let invocaciones = 0
  const handler = crearHandlerInvitacion({
    portalOrigin: origin,
    crearCaso: (token) => {
      assert.equal(token, 'Bearer sesión')
      return async () => {
        invocaciones++
        return { usuarioId: 'u' }
      }
    }
  })
  assert.equal((await handler(request(datos, { authorization: '' }))).status, 401)
  assert.equal(
    (await handler(request(datos, { origin: 'https://ajeno.test' }))).status,
    403
  )
  assert.equal((await handler(request({ ...datos, actor: 'otro' }))).status, 400)
  assert.equal((await handler(request(datos, {}, 'GET'))).status, 405)
  assert.equal(invocaciones, 0)
  const ok = await handler(request())
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await ok.json(), { usuarioId: 'u' })
  assert.equal((await handler(request(datos, {}, 'OPTIONS'))).status, 204)
})
test('errores del proveedor y del servidor se sanitizan sin exponer secretos', async () => {
  for (const [error, status] of [
    [new Error('credencial-privilegiada'), 400],
    [{ code: '42501', message: 'SQL interno' }, 403],
    [{ status: 401 }, 401]
  ]) {
    const handler = crearHandlerInvitacion({
      portalOrigin: origin,
      crearCaso: () => async () => {
        throw error
      }
    })
    const response = await handler(request())
    assert.equal(response.status, status)
    assert.doesNotMatch(await response.text(), /credencial-privilegiada|SQL interno/)
  }
})

test('la cuota de correo devuelve 429 seguro y permite reintentar la misma solicitud sin reintentos automáticos', async () => {
  const solicitudes = []
  const handler = crearHandlerInvitacion({
    portalOrigin: origin,
    crearCaso: () => async (solicitud) => {
      solicitudes.push(solicitud)
      if (solicitudes.length === 1)
        throw {
          status: 429,
          code: 'over_email_send_rate_limit',
          message: 'Detalle privado del proveedor'
        }
      return { usuarioId: 'u' }
    }
  })
  const fallo = await handler(request())
  assert.equal(fallo.status, 429)
  const body = await fallo.json()
  assert.equal(body.code, 'EMAIL_RATE_LIMIT')
  assert.match(body.error, /límite temporal de envío de correos/)
  assert.doesNotMatch(body.error, /Detalle privado/)
  assert.equal(solicitudes.length, 1)
  const reintento = await handler(request())
  assert.equal(reintento.status, 200)
  assert.deepEqual(solicitudes[0], solicitudes[1])
})
