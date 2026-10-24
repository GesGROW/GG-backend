-- La fecha diaria es independiente del rol persistente de campaña.
-- Los jaberos existentes deben asignarse nuevamente: no se inventa vigencia histórica.
begin;

alter table public.trabajador_campania_rol
  add column if not exists fecha_asignacion_jabero date;

create or replace function public.marcar_asignacion_diaria_jabero()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if new.rol = 'JABERO'::public.rol_trabajador and new.activo is true then
    new.fecha_asignacion_jabero := (clock_timestamp() at time zone 'America/Lima')::date;
  else
    new.fecha_asignacion_jabero := null;
  end if;
  return new;
end;
$$;

create trigger asignacion_diaria_jabero
before insert or update of trabajador_id, campania_id, rol, activo
on public.trabajador_campania_rol
for each row execute function public.marcar_asignacion_diaria_jabero();

create or replace function public.autorizar_operador_del_dia(p_dni varchar)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  if not exists (
    select 1
    from public.trabajadores t
    join public.usuarios_app ua on ua.trabajador_id = t.id
    join public.trabajador_campania_rol r on r.trabajador_id = t.id
    join public.campanias c on c.id = r.campania_id
    where t.dni = btrim(p_dni) and t.activo is true and ua.activo is true
      and r.activo is true and c.estado = 'ACTIVA'::public.estado_campania
      and (
        r.rol = 'SUPERVISORA'::public.rol_trabajador
        or (r.rol = 'JABERO'::public.rol_trabajador
          and r.fecha_asignacion_jabero = (clock_timestamp() at time zone 'America/Lima')::date)
      )
  ) then
    raise exception 'Usuario no autorizado: el jabero debe estar asignado para el día de hoy';
  end if;
end;
$$;

-- El RPC original no está versionado. Conservar su tipo de retorno real
-- (JSON o registro, incluso TABLE) y aplicar la regla antes de ejecutarlo.
do $migration$
declare
  v_retorno text;
  v_conjunto boolean;
  v_cuerpo text;
begin
  select pg_get_function_result(p.oid), p.proretset
  into strict v_retorno, v_conjunto
  from pg_proc p where p.oid = 'public.validar_operador(varchar)'::regprocedure;
  alter function public.validar_operador(varchar) rename to validar_operador_base;
  revoke all on function public.validar_operador_base(varchar) from public, anon, authenticated;
  if v_conjunto then
    v_cuerpo := 'return query select * from public.validar_operador_base(p_dni);';
  else
    v_cuerpo := 'return public.validar_operador_base(p_dni);';
  end if;
  execute format(
    'create function public.validar_operador(p_dni varchar) returns %s
     language plpgsql security definer set search_path = pg_catalog, public
     as %L',
    v_retorno,
    'begin perform public.autorizar_operador_del_dia(p_dni); ' || v_cuerpo || ' end;'
  );
end;
$migration$;

create or replace function public.validar_operador_diario(p_dni varchar)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public as $$
declare v_operador jsonb;
begin
  perform public.autorizar_operador_del_dia(p_dni);
  select to_jsonb(o) into v_operador from public.validar_operador(p_dni) o;
  if v_operador->>'dni' is distinct from btrim(p_dni) then
    raise exception 'El servidor no autorizó al operador';
  end if;
  return v_operador || jsonb_build_object(
    'autorizado_para_fecha', (clock_timestamp() at time zone 'America/Lima')::date
  );
end;
$$;

revoke all on function public.marcar_asignacion_diaria_jabero() from public, anon, authenticated;
revoke all on function public.autorizar_operador_del_dia(varchar) from public, anon, authenticated;
revoke all on function public.validar_operador(varchar) from public, anon, authenticated;
revoke all on function public.validar_operador_diario(varchar) from public, anon, authenticated;
grant execute on function public.validar_operador(varchar) to anon;
grant execute on function public.validar_operador_diario(varchar) to anon;

notify pgrst, 'reload schema';
commit;
