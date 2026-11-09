begin;
-- User-confirmed correction. Preserve production facts, timestamps and receipts.
lock table public.harvest_registros_cosecha in share mode;
do $$ begin
 if (select count(*) from public.harvest_registros_cosecha where tenant_id='cca1e9b6-f569-4dd9-887f-d464999db74a' and campania_id='de02705f-751c-4426-8104-ec683c5ef682')<>358
 or (select count(*) from public.harvest_registros_cosecha where tenant_id='7185fc00-b1b4-4826-a138-efd4c5c75dc8' and campania_id='bee32512-2646-498f-aab8-62d0cb0a7c60')<>382 then
  raise exception 'Los conteos cambiaron: revisar antes de reclasificar';
 end if;
end $$;
with candidatos as (
 select c.*,row_number() over(partition by tenant_id,campania_id,trabajador_id order by fecha_hora,id) orden
 from public.harvest_registros_cosecha c
 where (tenant_id='cca1e9b6-f569-4dd9-887f-d464999db74a' and campania_id='de02705f-751c-4426-8104-ec683c5ef682')
 or (tenant_id='7185fc00-b1b4-4826-a138-efd4c5c75dc8' and campania_id='bee32512-2646-498f-aab8-62d0cb0a7c60')
)
insert into harvest_bonos_privado.correcciones_recipientes(registro_id,tenant_id,campania_id,tipo_recipiente,original,motivo)
select id,tenant_id,campania_id,
 case when tenant_id='cca1e9b6-f569-4dd9-887f-d464999db74a' or orden%2=1 then 'JARRA' else 'JABA' end,
 '{}'::jsonb,
 case when tenant_id='cca1e9b6-f569-4dd9-887f-d464999db74a'
 then 'Confirmación del usuario 2026-11-07: toda la cosecha registrada de Fundo Quijas fue en jarras de 1.3 kg.'
 else 'Solicitud del usuario 2026-11-07: alternar jarras de 1.3 kg y jabas de 2.4 kg por cosechador en el fundo ficticio Santa Lucía.' end
from candidatos
on conflict(registro_id) do nothing;
commit;
