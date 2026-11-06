begin;

-- Privileged implementations stay outside the Data API. Public functions only
-- delegate; private implementations still enforce identity, module and campaign.
alter function public.harvest_admin_bono_configuracion(uuid,uuid) set schema harvest_bonos_privado;
alter function public.harvest_admin_bono_guardar(uuid,uuid,jsonb) set schema harvest_bonos_privado;
alter function public.harvest_reportes_bonos(uuid,uuid,date,date,uuid) set schema harvest_bonos_privado;

create function public.harvest_admin_bono_configuracion(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.harvest_admin_bono_configuracion(p_tenant_id,p_campania_id)
$$;
create function public.harvest_admin_bono_guardar(p_tenant_id uuid,p_campania_id uuid,p_datos jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.harvest_admin_bono_guardar(p_tenant_id,p_campania_id,p_datos)
$$;
create function public.harvest_reportes_bonos(p_tenant_id uuid,p_campania_id uuid,
 p_desde date default null,p_hasta date default null,p_trabajador_id uuid default null)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select harvest_bonos_privado.harvest_reportes_bonos(p_tenant_id,p_campania_id,p_desde,p_hasta,p_trabajador_id)
$$;

grant usage on schema harvest_bonos_privado to authenticated;
revoke all on function public.harvest_admin_bono_configuracion(uuid,uuid),public.harvest_admin_bono_guardar(uuid,uuid,jsonb),
 public.harvest_reportes_bonos(uuid,uuid,date,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.harvest_admin_bono_configuracion(uuid,uuid),public.harvest_admin_bono_guardar(uuid,uuid,jsonb),
 public.harvest_reportes_bonos(uuid,uuid,date,date,uuid) to authenticated;

-- Index the standalone references too, without granting table access.
create index reglas_campania_idx on harvest_bonos_privado.reglas(campania_id);
create index reglas_usuario_idx on harvest_bonos_privado.reglas(usuario_id);
comment on schema harvest_bonos_privado is 'Historial de bonos y lógica privilegiada. No exponer en la Data API.';
notify pgrst,'reload schema';
commit;
