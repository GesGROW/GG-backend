import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Verificación sin sesión ni correo: un token ficticio sólo devuelve un error
// hacia el destino permitido. No se siguen redirecciones ni se consumen enlaces.
const deployment = JSON.parse(
  readFileSync(
    new URL('../supabase/functions/invitar-usuario/deployment.json', import.meta.url),
    'utf8'
  )
)
const destino = new URL('/aceptar-invitacion', deployment.portalOrigin)
destino.searchParams.set('invitacion', '00000000-0000-4000-8000-000000000000')

for (const [nombre, tipo, redirectTo, esperado] of [
  ['URL base de Auth', 'invite', null, new URL(deployment.portalOrigin)],
  ['Activación', 'invite', destino.href, destino],
  ['Acceso a cuenta existente', 'magiclink', destino.href, destino],
  [
    'Dominio ajeno rechazado',
    'invite',
    'https://example.invalid/aceptar-invitacion',
    new URL(deployment.portalOrigin)
  ]
]) {
  const url = new URL('/auth/v1/verify', deployment.supabaseUrl)
  url.searchParams.set('token', 'invalid-diagnostic-token')
  url.searchParams.set('type', tipo)
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo)
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  })
  assert.equal(response.status, 303, `${nombre}: respuesta inesperada`)
  const actual = new URL(response.headers.get('location'))
  const coincide =
    actual.origin === esperado.origin &&
    actual.pathname === esperado.pathname &&
    actual.search === esperado.search
  console.log(
    `${coincide ? 'OK' : 'PENDIENTE'} ${nombre}: ${actual.origin}${actual.pathname}`
  )
  if (!coincide) process.exitCode = 1
}
