// Optional fields preserve compatibility with earlier crate-only responses.
export function normalizarRecipientes(fila) {
  if (fila.total_paquetes == null) return {}
  const numero = valor => Math.max(0, Number(valor) || 0)
  return {
    total_paquetes: numero(fila.total_paquetes),
    total_jarras: numero(fila.total_jarras),
    kg_estimados: fila.kg_estimados == null ? null : numero(fila.kg_estimados),
    ...(fila.dias_con_registros == null ? {} : {
      dias_con_registros: numero(fila.dias_con_registros),
      promedio_diario: numero(fila.promedio_diario)
    })
  }
}
