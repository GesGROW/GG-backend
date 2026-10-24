import { CatalogoDeTickets } from './catalogoDeTickets.js'
import { LoteDeTickets } from './loteDeTickets.js'
import { Ticket } from './ticket.js'
import { DatoDeTicketsInvalido } from './erroresTickets.js'
import { modeloOperativoHarvest } from './cutoverHarvest.js'

// Contrato de dominio, sin filas del proveedor. Solo la ingestión completa
// recorre el conjunto; resolver un código no exige cargar toda la campaña.
export function validarSnapshotHarvest(snapshot) {
  const fallo = () => {
    throw new DatoDeTicketsInvalido('snapshotHarvest')
  }
  if (
    snapshot?.versionContrato !== 1 ||
    snapshot.tipo !== 'SNAPSHOT' ||
    snapshot.completo !== true ||
    !snapshot.campaniaId ||
    !snapshot.operadorDni ||
    !snapshot.snapshotId ||
    !['tickets', 'lotesDeTickets', 'asignacionesDeLote', 'registrosCosecha'].every(
      (campo) => Array.isArray(snapshot[campo])
    )
  )
    fallo()
  const campania = snapshot.campaniaId
  const tenantId = snapshot.tenantId ?? snapshot.tenant_id
  if (tenantId !== undefined && (typeof tenantId !== 'string' || !tenantId.trim()))
    fallo()
  for (const fila of [
    ...snapshot.lotesDeTickets,
    ...snapshot.tickets,
    ...snapshot.asignacionesDeLote,
    ...snapshot.registrosCosecha,
    ...(Array.isArray(snapshot.identidadesTrabajadores)
      ? snapshot.identidadesTrabajadores
      : [])
  ]) {
    const owner = fila.tenantId ?? fila.tenant_id
    if (owner !== undefined && owner !== tenantId) fallo()
  }
  if (Object.hasOwn(snapshot, 'cutover'))
    modeloOperativoHarvest(snapshot.cutover, campania)
  if (
    snapshot.codigosLegacy != null &&
    (!Array.isArray(snapshot.codigosLegacy) ||
      !snapshot.codigosLegacy.every((codigo) => typeof codigo === 'string'))
  )
    fallo()
  if (
    snapshot.identidadesTrabajadores != null &&
    (!Array.isArray(snapshot.identidadesTrabajadores) ||
      !snapshot.identidadesTrabajadores.every(
        (w) =>
          typeof w.id === 'string' &&
          w.id.trim() &&
          typeof w.dni === 'string' &&
          w.dni.trim()
      ))
  )
    fallo()
  const lotes = snapshot.lotesDeTickets.map((l) => {
    if (l.campaniaId !== campania) fallo()
    return new LoteDeTickets(l)
  })
  const porLote = new Map(lotes.map((l) => [l.id, l]))
  const asignados = new Set()
  for (const a of snapshot.asignacionesDeLote) {
    if (a.campaniaId !== campania || !porLote.has(a.loteId) || asignados.has(a.loteId))
      fallo()
    porLote.get(a.loteId).asignar(a)
    asignados.add(a.loteId)
  }
  const tickets = snapshot.tickets.map((t) => {
    if (t.campaniaId !== campania) fallo()
    return new Ticket(t)
  })
  const catalogo = new CatalogoDeTickets({ lotes, tickets })
  const consumidos = new Set()
  for (const r of snapshot.registrosCosecha) {
    if (r.campaniaId !== campania || consumidos.has(r.codigoTicket)) fallo()
    const lote = catalogo.identificarLote(r.codigoTicket)
    if (
      lote.id !== r.loteId ||
      lote.obtenerAsignacion().trabajadorId !== r.trabajadorId ||
      lote.asignacion.operacionId !== r.asignacionOperacionId
    )
      fallo()
    catalogo.obtenerTicket(r.codigoTicket).registrarCosecha({ ...r, lote })
    consumidos.add(r.codigoTicket)
  }
  for (const l of snapshot.lotesDeTickets) {
    const agregado = porLote.get(l.id)
    if (
      l.estado !== agregado.estado ||
      (l.asignacionOperacionId ?? null) !== (agregado.asignacion?.operacionId ?? null)
    )
      fallo()
  }
  for (const t of snapshot.tickets) {
    const agregado = catalogo.obtenerTicket(t.codigo)
    if (
      t.estado !== agregado.estado ||
      (t.registroId ?? null) !== (agregado.registroCosecha?.id ?? null) ||
      (t.consumoOperacionId ?? null) !== (agregado.registroCosecha?.operacionId ?? null)
    )
      fallo()
  }
  return catalogo
}
