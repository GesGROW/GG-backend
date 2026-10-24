-- Each RPC call and its receipt commit in the same transaction. A lost HTTP
-- response can therefore be retried with the original queue operation UUID.
create table if not exists public.operaciones_pda_procesadas (
  id uuid primary key,
  tipo text not null,
  argumentos_md5 text not null,
  resultado jsonb,
  creado_en timestamptz not null default now()
);

revoke all on public.operaciones_pda_procesadas from public, anon, authenticated;

create or replace function public.asignar_ticket(
  p_dni_operador varchar,
  p_dni_cosechador varchar,
  p_codigo_ticket varchar,
  p_operacion_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_huella text := md5(jsonb_build_array(p_dni_operador, p_dni_cosechador, p_codigo_ticket)::text);
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_resultado jsonb;
begin
  if p_operacion_id is null then raise exception 'Falta el ID de operación'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operacion_id::text, 0));
  select * into v_anterior from public.operaciones_pda_procesadas where id = p_operacion_id;
  if found then
    if v_anterior.tipo <> 'ASIGNAR_TICKET' or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
    return v_anterior.resultado;
  end if;
  select to_jsonb(public.asignar_ticket(p_dni_operador, p_dni_cosechador, p_codigo_ticket)) into v_resultado;
  insert into public.operaciones_pda_procesadas(id, tipo, argumentos_md5, resultado)
  values (p_operacion_id, 'ASIGNAR_TICKET', v_huella, v_resultado);
  return v_resultado;
end;
$$;

create or replace function public.registrar_jabero(
  p_dni_operador varchar,
  p_dni_trabajador varchar,
  p_operacion_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_huella text := md5(jsonb_build_array(p_dni_operador, p_dni_trabajador)::text);
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_resultado jsonb;
begin
  if p_operacion_id is null then raise exception 'Falta el ID de operación'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operacion_id::text, 0));
  select * into v_anterior from public.operaciones_pda_procesadas where id = p_operacion_id;
  if found then
    if v_anterior.tipo <> 'REGISTRAR_JABERO' or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
    return v_anterior.resultado;
  end if;
  select to_jsonb(public.registrar_jabero(p_dni_operador, p_dni_trabajador)) into v_resultado;
  insert into public.operaciones_pda_procesadas(id, tipo, argumentos_md5, resultado)
  values (p_operacion_id, 'REGISTRAR_JABERO', v_huella, v_resultado);
  return v_resultado;
end;
$$;

create or replace function public.cerrar_sesion_lectura(
  p_dni_operador varchar,
  p_sesion_id uuid,
  p_operacion_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_huella text := md5(jsonb_build_array(p_dni_operador, p_sesion_id)::text);
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_resultado jsonb;
begin
  if p_operacion_id is null then raise exception 'Falta el ID de operación'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operacion_id::text, 0));
  select * into v_anterior from public.operaciones_pda_procesadas where id = p_operacion_id;
  if found then
    if v_anterior.tipo <> 'CERRAR_SESION' or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
    return v_anterior.resultado;
  end if;
  select to_jsonb(public.cerrar_sesion_lectura(p_dni_operador, p_sesion_id)) into v_resultado;
  insert into public.operaciones_pda_procesadas(id, tipo, argumentos_md5, resultado)
  values (p_operacion_id, 'CERRAR_SESION', v_huella, v_resultado);
  return v_resultado;
end;
$$;

create or replace function public.registrar_lectura_jaba(
  p_dni_operador varchar,
  p_sesion_id uuid,
  p_codigo_ticket varchar,
  p_lectura_id uuid,
  p_fecha_hora text,
  p_operacion_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_huella text := md5(jsonb_build_array(p_dni_operador, p_sesion_id,
    p_codigo_ticket, p_lectura_id, p_fecha_hora)::text);
  v_anterior public.operaciones_pda_procesadas%rowtype;
  v_resultado jsonb;
  v_fecha_tipo text;
begin
  if p_operacion_id is null then raise exception 'Falta el ID de operación'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operacion_id::text, 0));
  select * into v_anterior from public.operaciones_pda_procesadas where id = p_operacion_id;
  if found then
    if v_anterior.tipo <> 'REGISTRAR_JABA' or v_anterior.argumentos_md5 <> v_huella then
      raise exception 'ID de operación reutilizado con otros datos';
    end if;
    return v_anterior.resultado;
  end if;
  select format_type(p.proargtypes[4], null) into v_fecha_tipo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'registrar_lectura_jaba'
    and p.pronargs = 5
  limit 1;
  if v_fecha_tipo is null then raise exception 'Falta RPC original registrar_lectura_jaba'; end if;
  execute format('select to_jsonb(public.registrar_lectura_jaba($1,$2,$3,$4,$5::%s))',
    v_fecha_tipo)
  into v_resultado
  using p_dni_operador, p_sesion_id, p_codigo_ticket, p_lectura_id, p_fecha_hora;
  insert into public.operaciones_pda_procesadas(id, tipo, argumentos_md5, resultado)
  values (p_operacion_id, 'REGISTRAR_JABA', v_huella, v_resultado);
  return v_resultado;
end;
$$;

revoke execute on function public.asignar_ticket(varchar, varchar, varchar, uuid) from public, anon, authenticated;
revoke execute on function public.registrar_jabero(varchar, varchar, uuid) from public, anon, authenticated;
revoke execute on function public.cerrar_sesion_lectura(varchar, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.registrar_lectura_jaba(varchar, uuid, varchar, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.asignar_ticket(varchar, varchar, varchar, uuid) to anon;
grant execute on function public.registrar_jabero(varchar, varchar, uuid) to anon;
grant execute on function public.cerrar_sesion_lectura(varchar, uuid, uuid) to anon;
grant execute on function public.registrar_lectura_jaba(varchar, uuid, varchar, uuid, text, uuid) to anon;
