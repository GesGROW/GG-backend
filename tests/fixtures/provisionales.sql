-- Esquema mínimo local; no conecta con Supabase ni contiene credenciales.
create role anon;
create role authenticated;
create type public.rol_trabajador as enum ('COSECHADOR', 'JABERO', 'SUPERVISORA');
create type public.estado_campania as enum ('ACTIVA', 'CERRADA');
create table public.trabajadores (
  id uuid primary key default gen_random_uuid(), dni varchar unique not null,
  nombres varchar not null, apellidos varchar not null, activo boolean not null,
  updated_at timestamptz default now()
);
create table public.campanias (
  id uuid primary key default gen_random_uuid(), codigo varchar unique not null,
  nombre varchar not null, estado public.estado_campania not null,
  fecha_inicio date, fecha_fin date, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.usuarios_app (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid unique references public.trabajadores(id), activo boolean not null
);
create table public.trabajador_campania_rol (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid references public.trabajadores(id),
  campania_id uuid references public.campanias(id), rol public.rol_trabajador,
  activo boolean not null,
  registrado_por_usuario_id uuid references public.usuarios_app(id),
  unique (trabajador_id, campania_id, rol)
);
create table public.operaciones_pda_procesadas (
  id uuid primary key, tipo text not null, argumentos_md5 text not null,
  resultado jsonb, creado_en timestamptz default now()
);
create function public.autorizar_integracion_gestion_maestros() returns void
language plpgsql as $$ begin
  if current_setting('scc.test.integracion', true) is distinct from 'true' then
    raise exception 'Integración no autorizada para gestionar datos maestros';
  end if;
end $$;
-- El RPC original validar_operador no está versionado en este repositorio.
-- Esta fixture implementa el contrato que consume la PWA y la regla de acceso.
create function public.validar_operador(p_dni varchar) returns jsonb
language plpgsql as $$ declare v_resultado jsonb; begin
  select jsonb_build_object('dni', t.dni) into v_resultado
  from public.trabajadores t join public.usuarios_app ua on ua.trabajador_id = t.id
  where t.dni = btrim(p_dni) and t.activo = true and ua.activo = true
    and exists (
      select 1 from public.trabajador_campania_rol r
      join public.campanias c on c.id = r.campania_id
      where r.trabajador_id = t.id and r.activo = true
        and r.rol in ('JABERO', 'SUPERVISORA') and c.estado = 'ACTIVA'
    );
  if v_resultado is null then raise exception 'Usuario no autorizado'; end if;
  return v_resultado;
end $$;
insert into public.campanias (id, codigo, nombre, estado) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'CAMP-ARA-2026', 'Arándanos 2026', 'ACTIVA');
insert into public.trabajadores (id, dni, nombres, apellidos, activo) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '47480378', 'Deysi', 'Regalado', true);
insert into public.usuarios_app (trabajador_id, activo)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
insert into public.trabajador_campania_rol (trabajador_id, campania_id, rol, activo)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SUPERVISORA', true);
set scc.test.integracion = 'true';
