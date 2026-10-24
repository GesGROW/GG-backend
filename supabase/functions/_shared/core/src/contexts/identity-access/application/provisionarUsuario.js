// Caso de uso exclusivo de backend: todos los puertos se inyectan del lado
// confiable. La autorización y el ownership se revalidan al confirmar el alta.
export function crearProvisionarUsuario({ autorizacion, registro, proveedor }) {
  if (
    typeof autorizacion?.verificarSesion !== 'function' ||
    !['preparar', 'destinatario', 'completar'].every(
      (m) => typeof registro?.[m] === 'function'
    ) ||
    typeof proveedor?.invitar !== 'function'
  )
    throw new Error('Puertos de aprovisionamiento incompletos.')
  if (
    typeof registro.prepararEntrega === 'function' &&
    (typeof registro.confirmarEntrega !== 'function' ||
      typeof proveedor.enviarAcceso !== 'function')
  )
    throw new Error('Puertos de entrega de invitaciones incompletos.')
  return async function provisionar(solicitud) {
    await autorizacion.verificarSesion()
    const intento = await registro.preparar(solicitud)
    const entrega = await registro.prepararEntrega?.(intento.id)
    if (intento.estado === 'COMPLETADA' && (!entrega || entrega.enviada))
      return intento.resultado
    let destino = await registro.destinatario(intento.id)
    let sujeto = destino.sujeto
    if (!sujeto) {
      try {
        sujeto = await proveedor.invitar(destino.email, intento.id)
      } catch (error) {
        // Recuperar alta del proveedor con respuesta perdida, o carrera con
        // otro administrador, sin reenviar correo ni crear identidades dobles.
        destino = await registro.destinatario(intento.id)
        if (!destino.sujeto) throw error
        sujeto = destino.sujeto
      }
    }
    if (!sujeto) throw new Error('El proveedor no devolvió una identidad válida.')
    const resultado = await registro.completar(intento.id, sujeto)
    if (entrega && !entrega.enviada) {
      if (entrega.tipo === 'ACCESO')
        await proveedor.enviarAcceso(destino.email, intento.id)
      await registro.confirmarEntrega(intento.id)
    }
    return resultado
  }
}
