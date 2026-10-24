create or replace function public.admin_guardar_lote(
  p_lote_id uuid,
  p_codigo varchar,
  p_nombre varchar,
  p_campania_id uuid,
  p_variedad_id uuid,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo varchar;
  v_nombre varchar;
  v_lote public.lotes%rowtype;
  v_campania public.campanias%rowtype;
  v_variedad public.variedades%rowtype;
  v_accion text;
  v_es_nuevo boolean := false;
  v_cambio_campania boolean := false;
  v_cambio_variedad boolean := false;
begin
  perform public.autorizar_integracion_gestion_maestros();

  v_codigo := btrim(coalesce(p_codigo, ''));
  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');

  if v_codigo = '' then
    raise exception 'El código del lote es obligatorio';
  end if;
  if char_length(v_codigo) > 30 then
    raise exception 'El código del lote no puede exceder 30 caracteres';
  end if;
  if v_nombre is not null and char_length(v_nombre) > 100 then
    raise exception 'El nombre del lote no puede exceder 100 caracteres';
  end if;
  if p_campania_id is null then
    raise exception 'La campaña es obligatoria';
  end if;
  if p_variedad_id is null then
    raise exception 'La variedad es obligatoria';
  end if;
  if p_activo is null then
    raise exception 'Activo es obligatorio';
  end if;

  select c.* into v_campania
  from public.campanias c
  where c.id = p_campania_id;
  if not found then
    raise exception 'La campaña seleccionada no existe';
  end if;

  select v.* into v_variedad
  from public.variedades v
  where v.id = p_variedad_id;
  if not found then
    raise exception 'La variedad seleccionada no existe';
  end if;

  if p_lote_id is not null then
    select l.* into v_lote
    from public.lotes l
    where l.id = p_lote_id;

    if not found then
      raise exception 'El lote indicado no existe';
    end if;

    v_cambio_campania := v_lote.campania_id is distinct from p_campania_id;
    v_cambio_variedad := v_lote.variedad_id is distinct from p_variedad_id;
  else
    select l.* into v_lote
    from public.lotes l
    where l.campania_id = p_campania_id
      and l.codigo = v_codigo;

    if found then
      v_cambio_variedad := v_lote.variedad_id is distinct from p_variedad_id;
    else
      v_es_nuevo := true;
      v_cambio_campania := true;
      v_cambio_variedad := true;
    end if;
  end if;

  if (v_es_nuevo or v_cambio_campania) and v_campania.estado::text <> 'ACTIVA' then
    raise exception 'La campaña seleccionada no está activa';
  end if;

  if (v_es_nuevo or v_cambio_variedad) and v_variedad.activo is not true then
    raise exception 'La variedad seleccionada no está activa';
  end if;

  if v_es_nuevo then
    begin
      insert into public.lotes (
        codigo, nombre, campania_id, variedad_id, activo
      ) values (
        v_codigo, v_nombre, p_campania_id, p_variedad_id, p_activo
      )
      returning * into v_lote;
    exception
      when unique_violation then
        raise exception 'Ya existe otro lote con ese código en la campaña seleccionada';
    end;
    v_accion := 'CREADO';
  else
    begin
      update public.lotes
      set codigo = v_codigo,
          nombre = v_nombre,
          campania_id = p_campania_id,
          variedad_id = p_variedad_id,
          activo = p_activo
      where id = v_lote.id
      returning * into v_lote;
    exception
      when unique_violation then
        raise exception 'Ya existe otro lote con ese código en la campaña seleccionada';
    end;
    v_accion := 'ACTUALIZADO';
  end if;

  select c.* into v_campania
  from public.campanias c
  where c.id = v_lote.campania_id;

  select v.* into v_variedad
  from public.variedades v
  where v.id = v_lote.variedad_id;

  return jsonb_build_object(
    'ok', true,
    'accion', v_accion,
    'lote', jsonb_build_object(
      'id', v_lote.id,
      'codigo', v_lote.codigo,
      'nombre', v_lote.nombre,
      'campania_id', v_lote.campania_id,
      'campania_codigo', v_campania.codigo,
      'variedad_id', v_lote.variedad_id,
      'variedad', v_variedad.nombre,
      'activo', v_lote.activo
    )
  );
end;
$$;

create or replace function public.admin_listar_lotes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lotes jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'codigo', l.codigo,
        'nombre', l.nombre,
        'campania_id', l.campania_id,
        'campania_codigo', c.codigo,
        'campania_estado', c.estado,
        'variedad_id', l.variedad_id,
        'variedad', v.nombre,
        'variedad_activa', v.activo,
        'activo', l.activo
      )
      order by c.codigo asc, l.codigo asc
    ),
    '[]'::jsonb
  )
  into v_lotes
  from public.lotes l
  join public.campanias c on c.id = l.campania_id
  join public.variedades v on v.id = l.variedad_id;

  return jsonb_build_object(
    'ok', true,
    'lotes', v_lotes
  );
end;
$$;

revoke all
on function public.admin_guardar_lote(uuid, varchar, varchar, uuid, uuid, boolean)
from public, anon, authenticated;

revoke all
on function public.admin_listar_lotes()
from public, anon, authenticated;

grant execute
on function public.admin_guardar_lote(uuid, varchar, varchar, uuid, uuid, boolean)
to authenticated;

grant execute
on function public.admin_listar_lotes()
to authenticated;

notify pgrst, 'reload schema';
