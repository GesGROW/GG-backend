import { crearConsultaParcelas } from '../../farm-structure/index.js'
export function crearVinculacionParcelas({ referenciasParcelas, lotesParcelas }) {
  const consulta = crearConsultaParcelas({ referenciasParcelas })
  for (const m of ['listar', 'vincular', 'desvincular'])
    if (typeof lotesParcelas?.[m] !== 'function')
      throw new Error('Puerto de vínculo operativo incompleto: ' + m)
  return Object.freeze({
    opciones: (t, busqueda = '') => consulta.listar(t, busqueda),
    listar: (t, c, l) => lotesParcelas.listar(t, c, l),
    vincular: (t, c, l, p) => lotesParcelas.vincular(t, c, l, p),
    desvincular: (t, c, l, p) => lotesParcelas.desvincular(t, c, l, p)
  })
}
