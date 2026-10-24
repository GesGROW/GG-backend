export function validarPuertoAcceso(acceso) {
  for (const nombre of ['obtenerIdentidad', 'resolverContexto'])
    if (typeof acceso?.[nombre] !== 'function')
      throw new Error(`Acceso requiere ${nombre}.`)
  return acceso
}
