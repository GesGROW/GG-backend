import {
  crearGenerarLotesDeTickets,
  crearResolverCatalogoDeTickets,
  crearAsignarLoteDeTickets,
  crearRegistrarCosecha
} from '@gesgrow/core/contexts/harvest/index.js'
import { crearRepositorioTicketsHarvestSupabase } from '@gesgrow/harvest-client-contracts/src/infrastructure/supabase/harvestTicketsAdapter.js'

// Test composition: generation belongs to the portal, not the field client.
export function crearTicketsHarvest({ supabase, generarIdLote = () => crypto.randomUUID(), generadorCodigoTicket }) {
  const repositorioTickets = crearRepositorioTicketsHarvestSupabase(supabase)
  return {
    generarLotesDeTickets: crearGenerarLotesDeTickets({ repositorioTickets, generarIdLote, generadorCodigoTicket }),
    resolverCatalogoDeTickets: crearResolverCatalogoDeTickets({ repositorioTickets }),
    asignarLoteDeTickets: crearAsignarLoteDeTickets({ repositorioTickets }),
    registrarCosecha: crearRegistrarCosecha({ repositorioTickets })
  }
}
