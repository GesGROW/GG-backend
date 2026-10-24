export function validarJaberoParaInicio(trabajador) {
  if (!trabajador) throw new Error('El trabajador no está disponible localmente.')
  if (!trabajador.roles?.includes('JABERO'))
    throw new Error('El trabajador no está registrado como jabero.')
  validarJaberoParaLectura(trabajador)
}

export function validarJaberoParaLectura(trabajador) {
  if (trabajador?.estado_sync_jabero === 'ERROR')
    throw new Error('El registro de este jabero fue rechazado. Revise sincronización.')
}
