export function datosRecipiente(tipo) {
  if (tipo === undefined) return {}
  if (!['JABA', 'JARRA'].includes(tipo)) throw new Error('Selecciona Jarra o Jaba.')
  return { tipoRecipiente: tipo, pesoKg: tipo === 'JARRA' ? 1.3 : 2.4 }
}
