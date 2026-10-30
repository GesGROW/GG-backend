import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { crearProvisionarUsuario } from '../_shared/core/src/contexts/identity-access/index.js'
import { crearHandlerInvitacion } from './handler.js'
import { resolverOrigenPortal, resolverOrigenesPortal } from './configuracion.js'
import deployment from './deployment.json' with { type: 'json' }

const url = Deno.env.get('SUPABASE_URL')!
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const configuracionOrigen = {
  supabaseUrl: url,
  portalOrigin: Deno.env.get('PORTAL_ORIGIN'),
  deployment
}
const portalOrigin = resolverOrigenPortal(configuracionOrigen)
const allowedOrigins = resolverOrigenesPortal(configuracionOrigen)
// Destino fijo del servidor, nunca una URL suministrada por React.
const destinoInvitacion = (id: string) => {
  const destino = new URL('/aceptar-invitacion', portalOrigin)
  destino.searchParams.set('invitacion', id)
  return destino.href
}
const admin = createClient(url, serverKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})
async function consulta(
  cliente: typeof admin,
  nombre: string,
  args: Record<string, unknown>
) {
  const { data, error } = await cliente.rpc(nombre, args)
  if (error) throw error
  return data
}
Deno.serve(
  crearHandlerInvitacion({
    portalOrigin,
    allowedOrigins,
    crearCaso(authorization: string) {
      const user = createClient(url, publicKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false }
      })
      return crearProvisionarUsuario({
        autorizacion: {
          async verificarSesion() {
            const { data, error } = await user.auth.getUser(authorization.slice(7))
            if (error || !data.user)
              throw Object.assign(new Error('Sesión inválida'), { status: 401 })
          }
        },
        registro: {
          preparar: (d: {
            operacionId: string
            tenantId: string
            email: string
            nombre: string
            roles: string[]
            trabajadorId?: string
          }) =>
            consulta(user, 'iam_preparar_invitacion', {
              p_id: d.operacionId,
              p_tenant_id: d.tenantId,
              p_email: d.email,
              p_nombre: d.nombre,
              p_roles: d.roles,
              p_trabajador_id: d.trabajadorId ?? null
            }),
          destinatario: (id: string) =>
            consulta(admin, 'iam_destinatario_invitacion', { p_id: id }),
          completar: (id: string, sujeto: string) =>
            consulta(admin, 'iam_completar_invitacion', { p_id: id, p_sujeto: sujeto }),
          prepararEntrega: (id: string) =>
            consulta(admin, 'iam_preparar_entrega_invitacion', { p_id: id }),
          confirmarEntrega: (id: string) =>
            consulta(admin, 'iam_confirmar_entrega_invitacion', { p_id: id })
        },
        proveedor: {
          async invitar(email: string, id: string) {
            const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
              redirectTo: destinoInvitacion(id)
            })
            if (error) throw error
            return data.user?.id
          },
          async enviarAcceso(email: string, id: string) {
            // Cliente efímero: nunca reemplazar la sesión del administrador.
            const receptor = createClient(url, publicKey, {
              auth: { persistSession: false, autoRefreshToken: false }
            })
            const { error } = await receptor.auth.signInWithOtp({
              email,
              options: {
                shouldCreateUser: false,
                emailRedirectTo: destinoInvitacion(id)
              }
            })
            if (error) throw error
          }
        }
      })
    }
  })
)
