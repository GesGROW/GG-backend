begin;

-- Conservar la revocación anterior antes de habilitar el mismo equipo.
create table pda_privado.renovaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  dispositivo_id uuid not null references pda_privado.dispositivos(id),
  renovado_por uuid not null,
  renovado_en timestamptz not null default clock_timestamp(),
  revocado_en timestamptz not null,
  revocado_por uuid not null,
  foreign key (renovado_por, tenant_id) references public.identity_membresias(usuario_id, tenant_id),
  foreign key (revocado_por, tenant_id) references public.identity_membresias(usuario_id, tenant_id)
);
create index pda_renovaciones_dispositivo on pda_privado.renovaciones(dispositivo_id, renovado_en);
alter table pda_privado.renovaciones enable row level security;
revoke all on pda_privado.renovaciones from public, anon, authenticated;

create function pda_privado.renovar(p_tenant_id uuid, p_dispositivo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid; v_dispositivo pda_privado.dispositivos;
begin
  v_usuario := pda_privado.exigir_gestion(p_tenant_id);
  perform public.platform_exigir_modulo(p_tenant_id, 'HARVEST');
  select * into v_dispositivo from pda_privado.dispositivos
    where tenant_id = p_tenant_id and id = p_dispositivo_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Dispositivo no disponible en esta empresa';
  end if;
  if v_dispositivo.revocado_en is not null then
    insert into pda_privado.renovaciones(tenant_id, dispositivo_id, renovado_por, revocado_en, revocado_por)
      values(p_tenant_id, v_dispositivo.id, v_usuario, v_dispositivo.revocado_en, v_dispositivo.revocado_por);
    update pda_privado.dispositivos set revocado_en = null, revocado_por = null
      where id = v_dispositivo.id returning * into v_dispositivo;
  end if;
  return pda_privado.dispositivo_json(v_dispositivo);
end;
$$;
revoke all on function pda_privado.renovar(uuid,uuid) from public, anon, authenticated;

create function public.pda_renovar_dispositivo(p_tenant_id uuid, p_dispositivo_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.renovar(p_tenant_id, p_dispositivo_id);
$$;
revoke all on function public.pda_renovar_dispositivo(uuid,uuid) from public, anon, authenticated;
grant execute on function pda_privado.renovar(uuid,uuid), public.pda_renovar_dispositivo(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
