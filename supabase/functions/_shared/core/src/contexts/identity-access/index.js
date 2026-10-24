/** @typedef {import('./ports/operadores.js').PuertoOperadores} PuertoOperadores */
// API pública del contexto. Los demás contextos no importan sus internos.
export { crearValidarOperador } from './application/validarOperador.js'
export { validarOperadorConFuentes } from './application/authLogic.js'
export { fechaOperativa, autorizacionOperadorVigente } from './domain/fechaOperativa.js'
export { operacionesOperadores } from './ports/operadores.js'
export { operacionesBackendIdentityAccess } from './ports/backend.js'
export { Usuario } from './domain/usuario.js'
export { MembresiaEmpresa } from './domain/membresiaEmpresa.js'
export { RolAplicacion, ROLES_APLICACION } from './domain/rolAplicacion.js'
export { Permiso, PERMISOS } from './domain/permiso.js'
export { TenantContext } from './domain/tenantContext.js'
export { AccesoDenegado } from './domain/identidad.js'
export { crearAccesoAutenticado } from './application/accesoAutenticado.js'
export { crearProvisionarUsuario } from './application/provisionarUsuario.js'
export { validarPuertoIdentity } from './ports/identity.js'
export { validarPuertoAcceso } from './ports/acceso.js'
// Solo para compatibilidad PDA; las cuentas nuevas usan el puerto Identity.
export { crearValidarOperador as crearValidarOperadorLegacy } from './application/validarOperador.js'
