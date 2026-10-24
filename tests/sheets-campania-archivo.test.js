import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const read = (name) =>
  readFileSync(new URL('../apps-script/' + name, import.meta.url), 'utf8')
function archivo(props = {}, libro = 'archivo-A') {
  const propiedades = { SCC_CAMPANIA_ID: A, SCC_SPREADSHEET_ID: 'archivo-A', ...props }
  const ctx = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (key) => propiedades[key] })
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => libro }) }
  })
  vm.runInContext(read('Config.gs') + read('CampaniaArchivo.gs'), ctx)
  return ctx
}
test('todas las consultas y guardados usan el adaptador de la campaña fija sin mutar la fila', () => {
  const ctx = archivo(),
    payload = { p_dni: '01234567' }
  const rpc = ctx.prepararRpcArchivoScc_('admin_guardar_trabajador', payload)
  assert.equal(rpc.nombre, 'admin_guardar_trabajador_hoja')
  assert.equal(rpc.payload.p_contexto_campania_id, A)
  assert.equal(rpc.payload.p_dni, payload.p_dni)
  assert.equal(payload.p_contexto_campania_id, undefined)
  for (const name of [
    'admin_listar_lotes',
    'admin_listar_roles_campania',
    'admin_obtener_resumen_campania',
    'admin_obtener_ranking_cosechadores_periodo'
  ])
    assert.equal(ctx.prepararRpcArchivoScc_(name, {}).payload.p_contexto_campania_id, A)
})
test('un archivo copiado o sin configurar falla antes de conectar a Supabase', () => {
  assert.throws(
    () => archivo({}, 'archivo-B').prepararRpcArchivoScc_('admin_listar_lotes', {}),
    /SCC_SPREADSHEET_ID/
  )
  assert.throws(
    () => archivo({ SCC_CAMPANIA_ID: '' }).obtenerContextoArchivoScc_(),
    /SCC_CAMPANIA_ID/
  )
})
test('rechaza campañas manipuladas y RPC que no pertenecen al archivo', () => {
  const ctx = archivo()
  assert.throws(
    () =>
      ctx.prepararRpcArchivoScc_('admin_guardar_rol_campania', { p_campania_id: B }),
    /otra campaña/
  )
  assert.throws(
    () =>
      ctx.prepararRpcArchivoScc_('admin_listar_lotes', { p_contexto_campania_id: B }),
    /no pertenece/
  )
  assert.throws(
    () => ctx.prepararRpcArchivoScc_('validar_operador', {}),
    /no disponible/
  )
})
test('el transporte envía el UUID de campaña y los reintentos conservan el mismo alcance', () => {
  const ctx = archivo({
    SUPABASE_URL: 'https://test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'test',
    SUPABASE_INTEGRATION_EMAIL: 'test@example.invalid',
    SUPABASE_INTEGRATION_PASSWORD: 'test'
  })
  const cache = new Map([['SCC_SUPABASE_ACCESS_TOKEN', 'expired']]),
    calls = []
  ctx.CacheService = {
    getScriptCache: () => ({
      get: (key) => cache.get(key),
      put: (key, value) => cache.set(key, value),
      remove: (key) => cache.delete(key)
    })
  }
  ctx.UrlFetchApp = {
    fetch(url, opts) {
      calls.push([url, JSON.parse(opts.payload)])
      const auth = url.includes('/auth/'),
        code = calls.length === 1 ? 401 : 200
      return {
        getResponseCode: () => code,
        getContentText: () =>
          JSON.stringify(
            auth ? { access_token: 'new', expires_in: 3600 } : { ok: true }
          )
      }
    }
  }
  vm.runInContext(read('Supabase.gs'), ctx)
  assert.equal(ctx.llamarRpcSupabase_('admin_listar_lotes', {}).ok, true)
  const rpc = calls.filter(([url]) => url.includes('/rpc/'))
  assert.equal(rpc.length, 2)
  for (const [url, payload] of rpc) {
    assert.match(url, /admin_listar_lotes_hoja$/)
    assert.equal(payload.p_contexto_campania_id, A)
  }
})
