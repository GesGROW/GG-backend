create table if not exists public.integraciones_api (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombre text not null,
  puede_gestionar_maestros boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.integraciones_api enable row level security;

revoke all on table public.integraciones_api from public, anon, authenticated;

create or replace function public.autorizar_integracion_gestion_maestros()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid;
begin
  v_auth_user_id := auth.uid();a

  if v_auth_user_id is null
     or not exists (
       select 1
       from public.integraciones_api ia
       where ia.auth_user_id = v_auth_user_id
         and ia.activo = true
         and ia.puede_gestionar_maestros = true
     ) then
    raise exception 'Integración no autorizada para gestionar datos maestros';
  end if;
end;
$$;

revoke all
on function public.autorizar_integracion_gestion_maestros()
from public, anon, authenticated;

create or replace function public.admin_guardar_trabajador(
  p_trabajador_id uuid,
  p_dni varchar,
  p_nombres varchar,
  p_apellidos varchar,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dni varchar;
  v_nombres varchar;
  v_apellidos varchar;
  v_trabajador public.trabajadores%rowtype;
  v_accion text;
begin
  perform public.autorizar_integracion_gestion_maestros();

  v_dni := btrim(coalesce(p_dni, ''));
  v_nombres := btrim(coalesce(p_nombres, ''));
  v_apellidos := btrim(coalesce(p_apellidos, ''));

  if v_dni !~ '^[0-9]{8}$' then
    raise exception 'DNI debe contener exactamente 8 dígitos';
  end if;

  if v_nombres = '' then
    raise exception 'Los nombres son obligatorios';
  end if;

  if v_apellidos = '' then
    raise exception 'Los apellidos son obligatorios';
  end if;

  if p_activo is null then
    raise exception 'Activo es obligatorio';
  end if;

  if p_trabajador_id is not null then
    select t.*
    into v_trabajador
    from public.trabajadores t
    where t.id = p_trabajador_id;

    if not found then
      raise exception 'El trabajador indicado no existe';
    end if;

    if exists (
      select 1
      from public.trabajadores t
      where t.dni = v_dni
        and t.id <> p_trabajador_id
    ) then
      raise exception 'El DNI ya pertenece a otro trabajador';
    end if;

    update public.trabajadores
    set dni = v_dni,
        nombres = v_nombres,
        apellidos = v_apellidos,
        activo = p_activo,
        updated_at = now()
    where id = p_trabajador_id
    returning * into v_trabajador;

    v_accion := 'ACTUALIZADO';
  else
    select t.*
    into v_trabajador
    from public.trabajadores t
    where t.dni = v_dni;

    if found then
      update public.trabajadores
      set nombres = v_nombres,
          apellidos = v_apellidos,
          activo = p_activo,
          updated_at = now()
      where id = v_trabajador.id
      returning * into v_trabajador;

      v_accion := 'ACTUALIZADO';
    else
      begin
        insert into public.trabajadores (
          dni,
          nombres,
          apellidos,
          activo
        ) values (
          v_dni,
          v_nombres,
          v_apellidos,
          p_activo
        )
        returning * into v_trabajador;

        v_accion := 'CREADO';
      exception
        when unique_violation then
          raise exception 'El DNI ya pertenece a otro trabajador';
      end;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'trabajador', jsonb_build_object(
      'id', v_trabajador.id,
      'dni', v_trabajador.dni,
      'nombres', v_trabajador.nombres,
      'apellidos', v_trabajador.apellidos,
      'activo', v_trabajador.activo
    )
  );
end;
$$;

create or replace function public.admin_listar_trabajadores()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_trabajadores jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'dni', t.dni,
        'nombres', t.nombres,
        'apellidos', t.apellidos,
        'activo', t.activo
      )
      order by t.apellidos asc, t.nombres asc, t.dni asc
    ),
    '[]'::jsonb
  )
  into v_trabajadores
  from public.trabajadores t;

  return jsonb_build_object(
    'ok', true,
    'trabajadores', v_trabajadores
  );
end;
$$;

revoke all
on function public.admin_guardar_trabajador(uuid, varchar, varchar, varchar, boolean)
from public, anon, authenticated;

revoke all
on function public.admin_listar_trabajadores()
from public, anon, authenticated;

grant execute
on function public.admin_guardar_trabajador(uuid, varchar, varchar, varchar, boolean)
to authenticated;

grant execute
on function public.admin_listar_trabajadores()
to authenticated;

notify pgrst, 'reload schema';
