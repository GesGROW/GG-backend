begin;

-- Preparar el ingreso del actor autenticado, sin aceptar un DNI como autoridad.
create function pda_privado.ingresar(p_dispositivo_id uuid, p_credencial text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_resultado jsonb; v_dni text; v_operador jsonb; v_campanias jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión autenticada requerida';
  end if;
  v_resultado := pda_privado.obtener_contexto(p_dispositivo_id, p_credencial);
  select t.dni into v_dni
    from public.identity_membresias m
    join public.trabajadores t on t.id = m.trabajador_id and t.tenant_id = m.tenant_id and t.activo
    where m.usuario_id = (v_resultado->'contexto'->>'usuarioId')::uuid
      and m.tenant_id = (v_resultado->'dispositivo'->>'tenantId')::uuid and m.activo;
  if v_dni is not null then
    v_operador := public.iam_operador_pwa_campanias(v_dni);
    select coalesce(jsonb_agg(c), '[]'::jsonb) into v_campanias
      from jsonb_array_elements(v_operador->'campanias') c
      where c->>'tenant_id' = v_resultado->'dispositivo'->>'tenantId';
    if jsonb_array_length(v_campanias) > 0 then
      v_operador := v_operador || jsonb_build_object(
        'tenant_id', v_resultado->'dispositivo'->>'tenantId', 'campanias', v_campanias);
    else v_operador := null;
    end if;
  end if;
  return v_resultado || jsonb_build_object('operador', v_operador);
end;
$$;
revoke all on function pda_privado.ingresar(uuid,text) from public, anon, authenticated;
grant execute on function pda_privado.ingresar(uuid,text) to authenticated;

create function public.pda_preparar_ingreso(p_dispositivo_id uuid, p_credencial text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.ingresar(p_dispositivo_id, p_credencial);
$$;
revoke all on function public.pda_preparar_ingreso(uuid,text) from public, anon, authenticated;
grant execute on function public.pda_preparar_ingreso(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
