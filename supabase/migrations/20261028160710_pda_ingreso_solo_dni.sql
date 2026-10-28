begin;

-- Recuperar el ingreso operativo por DNI conservando la credencial del PDA.
-- El DNI identifica al operador; no representa una sesión Auth del portal.
create function pda_privado.ingresar_dni(p_dispositivo_id uuid, p_credencial text, p_dni text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_equipo pda_privado.dispositivos; v_operador jsonb; v_campanias jsonb;
  v_trabajador uuid; v_usuario uuid; v_empresa text;
begin
  v_equipo := pda_privado.equipo_pin(p_dispositivo_id, p_credencial);
  if p_dni is null or p_dni !~ '^[0-9]{8}$' then
    raise exception using errcode = '42501', message = 'Ingresa un DNI válido de 8 dígitos';
  end if;
  perform public.platform_exigir_modulo(v_equipo.tenant_id, 'HARVEST');
  select nombre into v_empresa from public.tenants where id = v_equipo.tenant_id and estado = 'ACTIVA';
  if v_empresa is null then raise exception using errcode = '42501', message = 'Empresa no disponible'; end if;
  select t.id, m.usuario_id into v_trabajador, v_usuario
    from public.trabajadores t
    join public.usuarios_app a on a.trabajador_id = t.id and a.tenant_id = t.tenant_id and a.activo
    left join public.identity_membresias m on m.trabajador_id = t.id and m.tenant_id = t.tenant_id
    where t.tenant_id = v_equipo.tenant_id and t.dni = p_dni and t.activo;
  if v_trabajador is null then
    raise exception using errcode = '42501', message = 'DNI no autorizado en la empresa vinculada';
  end if;
  -- Reutilizar las reglas anteriores (supervisor de portal y operador legacy).
  -- La llamada se realiza desde el cliente operativo anónimo, sin JWT de cuenta.
  v_operador := public.validar_operador_campanias(p_dni::varchar);
  select coalesce(jsonb_agg(c || jsonb_build_object('tenant_id', v_equipo.tenant_id)), '[]'::jsonb)
    into v_campanias from jsonb_array_elements(v_operador->'campanias') c
    join public.campanias camp on camp.id = (c->>'id')::uuid and camp.tenant_id = v_equipo.tenant_id;
  if jsonb_array_length(v_campanias) = 0 then
    raise exception using errcode = '42501', message = 'No tiene campañas activas asignadas en la empresa vinculada';
  end if;
  v_operador := v_operador || jsonb_build_object('tenant_id', v_equipo.tenant_id, 'campanias', v_campanias);
  update pda_privado.dispositivos set ultimo_acceso_en = clock_timestamp()
    where id = v_equipo.id returning * into v_equipo;
  return jsonb_build_object('dispositivo', pda_privado.dispositivo_json(v_equipo),
    'contexto', jsonb_build_object('tenantId', v_equipo.tenant_id,
      'usuarioId', coalesce(v_usuario, v_trabajador), 'empresa', v_empresa),
    'operador', v_operador, 'validadoEn', clock_timestamp(),
    'autorizadoHasta', ((clock_timestamp() at time zone 'America/Lima')::date + 1)::timestamp at time zone 'America/Lima');
exception when raise_exception then
  -- Un rechazo conocido no puede reutilizar la autorización offline anterior.
  raise exception using errcode = '42501', message = SQLERRM;
end;
$$;
revoke all on function pda_privado.ingresar_dni(uuid,text,text) from public, anon, authenticated;

create function public.pda_preparar_ingreso_dni(p_dispositivo_id uuid, p_credencial text, p_dni text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pda_privado.ingresar_dni(p_dispositivo_id, p_credencial, p_dni);
$$;
revoke all on function public.pda_preparar_ingreso_dni(uuid,text,text) from public, anon, authenticated;
grant execute on function pda_privado.ingresar_dni(uuid,text,text), public.pda_preparar_ingreso_dni(uuid,text,text) to anon;
notify pgrst, 'reload schema';
commit;
