begin;

-- Contrato SQL de Workforce para la aptitud laboral ya usada al iniciar sesión:
-- rol JABERO activo del trabajador activo en esa campaña. Harvest solo delega.
-- No concede roles ni modifica la autorización diaria de Identity.
create function public.workforce_validar_jabero_campania(p_rol_id uuid, p_campania_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists(select 1 from public.trabajador_campania_rol r
    join public.trabajadores t on t.id = r.trabajador_id
    where r.id = p_rol_id and r.campania_id = p_campania_id
      and r.rol = 'JABERO' and r.activo and t.activo) then
    raise exception 'El trabajador no está registrado como jabero activo en esta campaña';
  end if;
end $$;
revoke all on function public.workforce_validar_jabero_campania(uuid,uuid) from public, anon, authenticated;
commit;
