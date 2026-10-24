export function nombreCosechadorVisible(nombre, dni) {
  const nombreNormalizado = String(nombre ?? '').trim()
  if (nombreNormalizado) return nombreNormalizado
  const dniNormalizado = String(dni ?? '').trim()
  return dniNormalizado ? `DNI ${dniNormalizado}` : 'DNI no disponible'
}

export function resolverCosechadorLocal(
  dniNormalizado,
  trabajador,
  campania,
  { permitirProvisional = false } = {}
) {
  if (!campania) {
    throw new Error('El cosechador no está disponible en la campaña activa local.')
  }
  const tenant = campania.tenantId ?? campania.tenant_id
  const propietario = trabajador?.tenantId ?? trabajador?.tenant_id
  if (tenant !== undefined && propietario !== undefined && tenant !== propietario)
    throw new Error('Relación cross-tenant rechazada.')

  if (trabajador?.activo === false) {
    throw new Error('El trabajador está inactivo.')
  }

  const campaniaNombre = campania.nombre ?? campania
  if (trabajador?.roles?.includes('COSECHADOR')) {
    return {
      ...trabajador,
      nombre: nombreCosechadorVisible(trabajador.nombre, dniNormalizado),
      campania: campaniaNombre
    }
  }

  if (!permitirProvisional) {
    throw new Error('El cosechador no está disponible en la campaña activa local.')
  }

  return {
    ...(trabajador ?? {}),
    ...(tenant !== undefined ? { tenant_id: tenant } : {}),
    dni: dniNormalizado,
    nombre: nombreCosechadorVisible(trabajador?.nombre, dniNormalizado),
    roles: [...new Set([...(trabajador?.roles ?? []), 'COSECHADOR'])],
    activo: trabajador?.activo ?? true,
    provisional_local: true,
    campania: campaniaNombre
  }
}
