begin;
create index harvest_impresion_pendientes_actor
  on public.harvest_impresion_pendientes(actor_usuario_id,tenant_id);
commit;
