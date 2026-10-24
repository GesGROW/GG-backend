import { validarIdentificador } from '../domain/identificadoresTickets.js'

/** @param {{repositorioTickets: import('../ports/tickets.js').RepositorioTicketsHarvest}} dependencias */
export function crearResolverCatalogoDeTickets({ repositorioTickets }) {
  return async function resolverCatalogoDeTickets({ campaniaId, codigoTicket }) {
    return repositorioTickets.resolverCatalogoPorCodigo({
      campaniaId: validarIdentificador(campaniaId, 'campaniaId'),
      codigoTicket: validarIdentificador(codigoTicket, 'codigoTicket')
    })
  }
}
