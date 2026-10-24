export function validarAdministracionHarvest(p) {
  for (const m of ['campanias', 'filtros', 'generar', 'listar', 'obtener'])
    if (typeof p?.[m] !== 'function')
      throw new Error(`Administración Harvest requiere ${m}.`)
  return p
}
