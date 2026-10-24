export function validarPuertoIdentity(identity) {
  for (const nombre of ['iniciarSesion', 'obtenerSesion', 'cerrarSesion'])
    if (typeof identity?.[nombre] !== 'function')
      throw new Error(`Identity requiere ${nombre}.`)
  return identity
}
