export function validarGestionWorkforce(puerto) {
  for (const m of [
    'listar',
    'obtener',
    'crear',
    'editar',
    'activar',
    'desactivar',
    'catalogo',
    'participaciones',
    'asignarRol',
    'retirarRol'
  ])
    if (typeof puerto?.[m] !== 'function') throw new Error(`Workforce requiere ${m}.`)
  return puerto
}
