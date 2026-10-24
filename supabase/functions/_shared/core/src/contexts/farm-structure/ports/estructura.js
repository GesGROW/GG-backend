export function validarEstructuraAgricola(p) {
  for (const m of ['listar', 'guardar', 'estado'])
    if (typeof p?.[m] !== 'function')
      throw new Error('Puerto Farm Structure incompleto: ' + m)
  return p
}
// Contrato público mínimo para consumidores como Campaign. No expone un
// repositorio ni permite mutaciones de estructura física desde otros contextos.
export function crearConsultaParcelas({ referenciasParcelas }) {
  if (typeof referenciasParcelas?.listar !== 'function')
    throw new Error('Consulta de parcelas requerida.')
  return Object.freeze({
    listar: (tenant, busqueda = '') => referenciasParcelas.listar(tenant, busqueda)
  })
}
