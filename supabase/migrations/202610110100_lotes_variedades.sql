begin;

-- lotes.variedad_id se conserva únicamente para clientes y colas anteriores.
-- Las asociaciones operativas y el historial usan las relaciones nuevas.
create table public.lote_variedades (
  lote_id uuid not null references public.lotes(id),
  variedad_id uuid not null references public.variedades(id),
  activo boolean not null default true,
  primary key (lote_id, variedad_id)
);
alter table public.lote_variedades enable row level security;
revoke all on public.lote_variedades from public, anon, authenticated;

insert into public.lote_variedades (lote_id, variedad_id)
select id, variedad_id from public.lotes;

alter table public.sesiones_lectura add column variedad_id uuid;
update public.sesiones_lectura sl
set variedad_id = l.variedad_id
from public.lotes l where l.id = sl.lote_id;
alter table public.sesiones_lectura alter column variedad_id set not null;
alter table public.sesiones_lectura add constraint sesiones_lectura_lote_variedad_fk
  foreign key (lote_id, variedad_id)
  references public.lote_variedades(lote_id, variedad_id);
create index sesiones_lectura_lote_variedad_idx
  on public.sesiones_lectura(lote_id, variedad_id);

create or replace function public.admin_listar_lotes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lotes jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'codigo', l.codigo, 'nombre', l.nombre,
    'campania_id', l.campania_id, 'campania_codigo', c.codigo,
    'campania_estado', c.estado, 'activo', l.activo,
    'variedades', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'nombre', v.nombre, 'activo', v.activo
      ) order by v.nombre, v.id), '[]'::jsonb)
      from public.lote_variedades lv
      join public.variedades v on v.id = lv.variedad_id
      where lv.lote_id = l.id and lv.activo
    )
  ) order by c.codigo, l.codigo), '[]'::jsonb) into v_lotes
  from public.lotes l join public.campanias c on c.id = l.campania_id;
  return jsonb_build_object('ok', true, 'lotes', v_lotes);
end $$;

-- Un nombre diferente evita ambigüedad de sobrecargas UUID/UUID[] en PostgREST.
create function public.admin_guardar_lote_variedades(
  p_lote_id uuid, p_codigo varchar, p_nombre varchar,
  p_campania_id uuid, p_variedad_ids uuid[], p_activo boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lote public.lotes%rowtype;
  v_campania public.campanias%rowtype;
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_ids uuid[];
  v_nuevo boolean := false;
  v_resultado jsonb;
begin
  perform public.autorizar_integracion_gestion_maestros();
  if v_codigo = '' then raise exception 'El código del lote es obligatorio'; end if;
  if length(v_codigo) > 30 then raise exception 'El código del lote no puede exceder 30 caracteres'; end if;
  if length(v_nombre) > 100 then raise exception 'El nombre del lote no puede exceder 100 caracteres'; end if;
  if p_campania_id is null then raise exception 'La campaña es obligatoria'; end if;
  if p_activo is null then raise exception 'Activo es obligatorio'; end if;
  if coalesce(cardinality(p_variedad_ids), 0) = 0 or array_position(p_variedad_ids, null) is not null then
    raise exception 'Seleccione al menos una variedad válida';
  end if;
  select array_agg(distinct id order by id) into v_ids from unnest(p_variedad_ids) id;
  select * into v_campania from public.campanias where id = p_campania_id;
  if not found then raise exception 'La campaña seleccionada no existe'; end if;

  if p_lote_id is not null then
    select * into v_lote from public.lotes where id = p_lote_id for update;
    if not found then raise exception 'El lote indicado no existe'; end if;
  else
    select * into v_lote from public.lotes
    where campania_id = p_campania_id and codigo = v_codigo for update;
    v_nuevo := not found;
  end if;
  if (v_nuevo or v_lote.campania_id is distinct from p_campania_id)
     and v_campania.estado::text <> 'ACTIVA' then
    raise exception 'La campaña seleccionada no está activa';
  end if;
  if exists (select 1 from unnest(v_ids) as seleccion(variedad_id)
             left join public.variedades v on v.id = seleccion.variedad_id where v.id is null) then
    raise exception 'La variedad seleccionada no existe';
  end if;
  if exists (
    select 1 from public.variedades v where v.id = any(v_ids) and v.activo is not true
    and not exists (select 1 from public.lote_variedades lv
      where lv.lote_id = v_lote.id and lv.variedad_id = v.id and lv.activo)
  ) then raise exception 'La variedad seleccionada no está activa'; end if;
  -- La campaña del histórico no debe cambiar después de tener sesiones.
  if not v_nuevo and v_lote.campania_id is distinct from p_campania_id
     and exists (select 1 from public.sesiones_lectura where lote_id = v_lote.id) then
    raise exception 'No se puede cambiar la campaña de un lote con sesiones de lectura';
  end if;
  begin
    if v_nuevo then
      insert into public.lotes (codigo, nombre, campania_id, variedad_id, activo)
      values (v_codigo, v_nombre, p_campania_id, v_ids[1], p_activo)
      returning * into v_lote;
    else
      -- El campo legado permanece estable para las colas aún no sincronizadas.
      update public.lotes set codigo = v_codigo, nombre = v_nombre,
        campania_id = p_campania_id, activo = p_activo
      where id = v_lote.id returning * into v_lote;
    end if;
  exception when unique_violation then
    raise exception 'Ya existe otro lote con ese código en la campaña seleccionada';
  end;
  -- Retirar una variedad desactiva la asociación; las sesiones la conservan.
  update public.lote_variedades set activo = false
  where lote_id = v_lote.id and not (variedad_id = any(v_ids));
  insert into public.lote_variedades (lote_id, variedad_id, activo)
  select v_lote.id, id, true from unnest(v_ids) id
  on conflict (lote_id, variedad_id) do update set activo = true;
  select item into v_resultado
  from jsonb_array_elements(public.admin_listar_lotes()->'lotes') item
  where item->>'id' = v_lote.id::text;
  return jsonb_build_object('ok', true,
    'accion', case when v_nuevo then 'CREADO' else 'ACTUALIZADO' end,
    'lote', v_resultado);
end $$;

-- El administrador anterior no puede reemplazar accidentalmente varias variedades.
create or replace function public.admin_guardar_lote(
  p_lote_id uuid, p_codigo varchar, p_nombre varchar,
  p_campania_id uuid, p_variedad_id uuid, p_activo boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.autorizar_integracion_gestion_maestros();
  select id into v_id from public.lotes
  where (p_lote_id is not null and id = p_lote_id)
     or (p_lote_id is null and campania_id = p_campania_id and codigo = btrim(p_codigo))
  for update;
  if (select count(*) from public.lote_variedades where lote_id = v_id and activo) > 1 then
    raise exception 'Actualice Apps Script para gestionar las variedades de este lote';
  end if;
  return public.admin_guardar_lote_variedades(
    p_lote_id, p_codigo, p_nombre, p_campania_id, array[p_variedad_id], p_activo);
end $$;

create function public.listar_lotes_activos_v2()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'lote_id', l.id, 'codigo', l.codigo, 'nombre', l.nombre,
    'campania_id', l.campania_id, 'variedades', opciones.variedades
  ) order by l.codigo), '[]'::jsonb)
  from public.lotes l join public.campanias c on c.id = l.campania_id
  cross join lateral (
    select jsonb_agg(jsonb_build_object('id', v.id, 'nombre', v.nombre)
      order by v.nombre, v.id) as variedades
    from public.lote_variedades lv join public.variedades v on v.id = lv.variedad_id
    where lv.lote_id = l.id and lv.activo and v.activo
  ) opciones
  where l.activo and c.estado::text = 'ACTIVA' and opciones.variedades is not null;
$$;

-- El RPC base no está versionado. Reutilizamos sus validaciones y los otros
-- campos (trabajadores, tickets y fecha) reemplazando únicamente los lotes.
alter function public.obtener_cache_operativa(varchar) rename to obtener_cache_operativa_legacy;
revoke all on function public.obtener_cache_operativa_legacy(varchar) from public, anon, authenticated;
create function public.obtener_cache_operativa(p_dni_operador varchar)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cache jsonb;
begin
  perform public.autorizar_operador_del_dia(p_dni_operador);
  v_cache := public.obtener_cache_operativa_legacy(p_dni_operador);
  if v_cache is null or jsonb_typeof(v_cache) <> 'object'
     or not (v_cache ? 'lotes') then
    raise exception 'El servidor devolvió una caché operativa inválida';
  end if;
  return jsonb_set(v_cache, '{lotes}', public.listar_lotes_activos_v2());
end $$;

create function public.iniciar_sesion_lectura(
  p_dni_operador varchar, p_dni_jabero varchar, p_lote_id uuid,
  p_sesion_id uuid, p_variedad_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_usuario_id uuid;
  v_campania_id uuid;
  v_jabero_rol_id uuid;
  v_sesion public.sesiones_lectura%rowtype;
  v_resultado jsonb;
begin
  perform public.autorizar_operador_del_dia(p_dni_operador);
  select ua.id into v_usuario_id from public.usuarios_app ua
  join public.trabajadores t on t.id = ua.trabajador_id
  where t.dni = btrim(p_dni_operador) and t.activo and ua.activo;
  if v_usuario_id is null then raise exception 'Usuario no autorizado para utilizar la aplicación'; end if;
  if p_sesion_id is null then raise exception 'La sesión es obligatoria'; end if;

  -- Serializar el mismo UUID permite reintentar sin duplicar la sesión.
  perform pg_advisory_xact_lock(hashtextextended(p_sesion_id::text, 0));
  select * into v_sesion from public.sesiones_lectura where id = p_sesion_id;
  if found then
    if v_sesion.lote_id is distinct from p_lote_id
       or v_sesion.variedad_id is distinct from p_variedad_id
       or v_sesion.iniciada_por_usuario_id is distinct from v_usuario_id
       or not exists (
         select 1 from public.trabajador_campania_rol r
         join public.trabajadores t on t.id = r.trabajador_id
         where r.id = v_sesion.jabero_rol_id and t.dni = btrim(p_dni_jabero)
       ) then raise exception 'El UUID de sesión ya fue usado con otros datos'; end if;
  else
    select l.campania_id into v_campania_id from public.lotes l
    join public.campanias c on c.id = l.campania_id
    where l.id = p_lote_id and l.activo and c.estado::text = 'ACTIVA'
    for share of l;
    if v_campania_id is null then
      raise exception 'El lote no existe o no pertenece a una campaña activa';
    end if;
    if not exists (
      select 1 from public.lote_variedades lv join public.variedades v on v.id = lv.variedad_id
      where lv.lote_id = p_lote_id and lv.variedad_id = p_variedad_id and lv.activo and v.activo
    ) then raise exception 'La variedad no está activa o no pertenece al lote'; end if;
    select r.id into v_jabero_rol_id from public.trabajador_campania_rol r
    join public.trabajadores t on t.id = r.trabajador_id
    where t.dni = btrim(p_dni_jabero) and t.activo and r.activo
      and r.rol = 'JABERO' and r.campania_id = v_campania_id
    for update of r;
    if v_jabero_rol_id is null then
      raise exception 'El trabajador no está registrado como jabero en la campaña del lote';
    end if;
    if exists (select 1 from public.sesiones_lectura
      where jabero_rol_id = v_jabero_rol_id and estado = 'ACTIVA') then
      raise exception 'El jabero ya tiene una sesión de lectura activa';
    end if;
    insert into public.sesiones_lectura (
      id, lote_id, variedad_id, jabero_rol_id, iniciada_por_usuario_id
    ) values (p_sesion_id, p_lote_id, p_variedad_id, v_jabero_rol_id, v_usuario_id);
  end if;
  select jsonb_build_object(
    'ok', true, 'sesion_id', sl.id, 'lote_id', l.id,
    'lote_codigo', l.codigo, 'lote_nombre', l.nombre,
    'variedad_id', v.id, 'variedad', v.nombre,
    'jabero', concat_ws(' ', t.nombres, t.apellidos), 'campania', c.nombre
  ) into v_resultado from public.sesiones_lectura sl
  join public.lotes l on l.id = sl.lote_id
  join public.variedades v on v.id = sl.variedad_id
  join public.campanias c on c.id = l.campania_id
  join public.trabajador_campania_rol r on r.id = sl.jabero_rol_id
  join public.trabajadores t on t.id = r.trabajador_id
  where sl.id = p_sesion_id;
  return v_resultado;
end $$;

-- Compatibilidad con operaciones pendientes anteriores: usan la variedad
-- original del lote, o la ya persistida si la sesión se está reintentando.
create or replace function public.iniciar_sesion_lectura(
  p_dni_operador varchar, p_dni_jabero varchar, p_lote_id uuid, p_sesion_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_variedad_id uuid;
begin
  select variedad_id into v_variedad_id from public.sesiones_lectura where id = p_sesion_id;
  if not found then select variedad_id into v_variedad_id from public.lotes where id = p_lote_id; end if;
  return public.iniciar_sesion_lectura(p_dni_operador, p_dni_jabero, p_lote_id, p_sesion_id, v_variedad_id);
end $$;

revoke all on function public.admin_listar_lotes() from public, anon, authenticated;
revoke all on function public.admin_guardar_lote(uuid,varchar,varchar,uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.admin_guardar_lote_variedades(uuid,varchar,varchar,uuid,uuid[],boolean) from public, anon, authenticated;
grant execute on function public.admin_listar_lotes() to authenticated;
grant execute on function public.admin_guardar_lote(uuid,varchar,varchar,uuid,uuid,boolean) to authenticated;
grant execute on function public.admin_guardar_lote_variedades(uuid,varchar,varchar,uuid,uuid[],boolean) to authenticated;
revoke all on function public.listar_lotes_activos_v2() from public, anon, authenticated;
revoke all on function public.obtener_cache_operativa(varchar) from public, anon, authenticated;
revoke all on function public.iniciar_sesion_lectura(varchar,varchar,uuid,uuid) from public, anon, authenticated;
revoke all on function public.iniciar_sesion_lectura(varchar,varchar,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.listar_lotes_activos_v2() to anon;
grant execute on function public.obtener_cache_operativa(varchar) to anon;
grant execute on function public.iniciar_sesion_lectura(varchar,varchar,uuid,uuid) to anon;
grant execute on function public.iniciar_sesion_lectura(varchar,varchar,uuid,uuid,uuid) to anon;

notify pgrst, 'reload schema';
commit;
