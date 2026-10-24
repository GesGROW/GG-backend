do $$
declare
  v_activas bigint;
begin
  select count(*)
  into v_activas
  from public.campanias c
  where c.estado = 'ACTIVA'::public.estado_campania;

  if v_activas > 1 then
    raise exception
      'No se puede aplicar la regla de una sola campaña activa: existen % campañas activas. Cierre manualmente las campañas sobrantes antes de aplicar esta migración.',
      v_activas;
  end if;
end;
$$;

create unique index if not exists ux_campanias_una_activa
on public.campanias ((true))
where estado = 'ACTIVA'::public.estado_campania;

create or replace function public.admin_guardar_campania(
  p_campania_id uuid,
  p_codigo varchar,
  p_nombre varchar,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_estado public.estado_campania
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_codigo varchar;
  v_nombre varchar;
  v_campania public.campanias%rowtype;
  v_accion text;
begin
  perform public.autorizar_integracion_gestion_maestros();

  v_codigo := btrim(coalesce(p_codigo, ''));
  v_nombre := btrim(coalesce(p_nombre, ''));

  if v_codigo = '' then
    raise exception 'El código de campaña es obligatorio';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre de campaña es obligatorio';
  end if;

  if p_fecha_inicio is null then
    raise exception 'La fecha de inicio es obligatoria';
  end if;

  if p_fecha_fin is not null and p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la fecha de inicio';
  end if;

  if p_estado is null then
    raise exception 'El estado de campaña es obligatorio';
  end if;

  if p_campania_id is not null then
    select c.*
    into v_campania
    from public.campanias c
    where c.id = p_campania_id;

    if not found then
      raise exception 'La campaña indicada no existe';
    end if;

    if exists (
      select 1
      from public.campanias c
      where c.codigo = v_codigo
        and c.id <> p_campania_id
    ) then
      raise exception 'El código de campaña ya pertenece a otra campaña';
    end if;

    if p_estado = 'ACTIVA'::public.estado_campania
       and exists (
         select 1
         from public.campanias c
         where c.estado = 'ACTIVA'::public.estado_campania
           and c.id <> p_campania_id
       ) then
      raise exception 'Ya existe otra campaña activa';
    end if;

    begin
      update public.campanias
      set codigo = v_codigo,
          nombre = v_nombre,
          fecha_inicio = p_fecha_inicio,
          fecha_fin = p_fecha_fin,
          estado = p_estado
      where id = p_campania_id
      returning * into v_campania;
    exception
      when unique_violation then
        if p_estado = 'ACTIVA'::public.estado_campania then
          raise exception 'Ya existe otra campaña activa';
        end if;
        raise exception 'El código de campaña ya pertenece a otra campaña';
    end;

    v_accion := 'ACTUALIZADO';
  else
    select c.*
    into v_campania
    from public.campanias c
    where c.codigo = v_codigo;

    if found then
      if p_estado = 'ACTIVA'::public.estado_campania
         and exists (
           select 1
           from public.campanias c
           where c.estado = 'ACTIVA'::public.estado_campania
             and c.id <> v_campania.id
         ) then
        raise exception 'Ya existe otra campaña activa';
      end if;

      begin
        update public.campanias
        set nombre = v_nombre,
            fecha_inicio = p_fecha_inicio,
            fecha_fin = p_fecha_fin,
            estado = p_estado
        where id = v_campania.id
        returning * into v_campania;
      exception
        when unique_violation then
          if p_estado = 'ACTIVA'::public.estado_campania then
            raise exception 'Ya existe otra campaña activa';
          end if;
          raise exception 'El código de campaña ya pertenece a otra campaña';
      end;

      v_accion := 'ACTUALIZADO';
    else
      if p_estado = 'ACTIVA'::public.estado_campania
         and exists (
           select 1
           from public.campanias c
           where c.estado = 'ACTIVA'::public.estado_campania
         ) then
        raise exception 'Ya existe otra campaña activa';
      end if;

      begin
        insert into public.campanias (
          codigo,
          nombre,
          fecha_inicio,
          fecha_fin,
          estado
        ) values (
          v_codigo,
          v_nombre,
          p_fecha_inicio,
          p_fecha_fin,
          p_estado
        )
        returning * into v_campania;
      exception
        when unique_violation then
          if p_estado = 'ACTIVA'::public.estado_campania
             and exists (
               select 1
               from public.campanias c
               where c.estado = 'ACTIVA'::public.estado_campania
             ) then
            raise exception 'Ya existe otra campaña activa';
          end if;
          raise exception 'El código de campaña ya pertenece a otra campaña';
      end;

      v_accion := 'CREADO';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'campania', jsonb_build_object(
      'id', v_campania.id,
      'codigo', v_campania.codigo,
      'nombre', v_campania.nombre,
      'fecha_inicio', v_campania.fecha_inicio,
      'fecha_fin', v_campania.fecha_fin,
      'estado', v_campania.estado
    )
  );
end;
$$;

create or replace function public.admin_listar_campanias()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campanias jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'codigo', c.codigo,
        'nombre', c.nombre,
        'fecha_inicio', c.fecha_inicio,
        'fecha_fin', c.fecha_fin,
        'estado', c.estado
      )
      order by c.fecha_inicio desc, c.codigo asc
    ),
    '[]'::jsonb
  )
  into v_campanias
  from public.campanias c;

  return jsonb_build_object(
    'ok', true,
    'campanias', v_campanias
  );
end;
$$;

revoke all
on function public.admin_guardar_campania(
  uuid,
  varchar,
  varchar,
  date,
  date,
  public.estado_campania
)
from public, anon, authenticated;

revoke all
on function public.admin_listar_campanias()
from public, anon, authenticated;

grant execute
on function public.admin_guardar_campania(
  uuid,
  varchar,
  varchar,
  date,
  date,
  public.estado_campania
)
to authenticated;

grant execute
on function public.admin_listar_campanias()
to authenticated;

notify pgrst, 'reload schema';
