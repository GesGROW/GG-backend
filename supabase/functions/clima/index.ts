import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { crearHandlerClima } from './handler.js'
import { crearProveedorClima } from './weatherapi.js'

const url = Deno.env.get('SUPABASE_URL')!
const opciones = { auth: { persistSession: false, autoRefreshToken: false } }
const publico = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, opciones)
const privado = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, opciones)
const consultar = crearProveedorClima({
  async obtenerClave() {
    const env = Deno.env.get('WEATHERAPI_KEY')
    if (env) return env
    const { data, error } = await privado.rpc('clima_weatherapi_clave')
    if (error) throw new Error('Configuración no disponible')
    return data
  }
})
Deno.serve(
  crearHandlerClima({
    async verificarSesion(token: string) {
      const { data, error } = await publico.auth.getUser(token)
      if (error) return null
      return data.user?.id ?? null
    },
    consultar,
    origenes: [
      ...new Set(
        [
          Deno.env.get('PORTAL_ORIGIN'),
          'https://gg-portal.vercel.app',
          'http://localhost:5174',
          'http://localhost:5181',
          'http://127.0.0.1:5174',
          'http://127.0.0.1:5181'
        ].filter(Boolean)
      )
    ]
  })
)
