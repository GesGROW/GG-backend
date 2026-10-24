export function datosTrabajador(d) {
  const dni = d.dni?.trim(),
    nombres = d.nombres?.trim(),
    apellidos = d.apellidos?.trim()
  if (!/^\d{8}$/.test(dni ?? '') || !nombres || !apellidos)
    throw new Error('DNI de ocho dígitos, nombres y apellidos requeridos.')
  return { dni, nombres, apellidos }
}
export function rolAdministrable(rol) {
  if (!['SUPERVISORA', 'COSECHADOR'].includes(rol))
    throw new Error('La asignación diaria de JABERO se conserva en el PDA.')
  return rol
}
