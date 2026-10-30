begin;

-- Conservar todas las reglas de cuenta actuales, resolviendo el DNI dentro
-- de la empresa del dispositivo/campaña, nunca en la primera empresa global.
do $cuenta$
declare d text;
begin
  d := pg_get_functiondef('public.iam_operador_pwa_campanias(varchar)'::regprocedure);
  if strpos(d, 'where t.dni=btrim(p_dni) order by m.tenant_id limit 1;') = 0
    or strpos(d, 'where c.estado=''ACTIVA'' and public.platform_modulo_habilitado') = 0 then
    raise exception 'Contrato de operador de cuenta no reconocido';
  end if;
  d := replace(d, 'FUNCTION public.iam_operador_pwa_campanias(p_dni character varying)',
    'FUNCTION pda_privado.operador_cuenta(p_tenant_id uuid, p_dni character varying)');
  d := replace(d, 'where t.dni=btrim(p_dni) order by m.tenant_id limit 1;',
    'where m.tenant_id=p_tenant_id and t.dni=btrim(p_dni) limit 1;');
  d := replace(d, 'where c.estado=''ACTIVA'' and public.platform_modulo_habilitado',
    'where c.tenant_id=p_tenant_id and c.estado=''ACTIVA'' and public.platform_modulo_habilitado');
  execute d;
end $cuenta$;

create function pda_privado.operador_empresa(p_tenant_id uuid, p_dni varchar)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_operador jsonb; v_campanias jsonb;
begin
  if p_dni is null or p_dni !~ '^[0-9]{8}$' then
    raise exception using errcode='42501',message='DNI operativo inválido';
  end if;
  perform public.platform_exigir_modulo(p_tenant_id,'HARVEST');
  v_operador := pda_privado.operador_cuenta(p_tenant_id,p_dni);
  if v_operador is null then
    select jsonb_build_object('tenant_id',t.tenant_id,'dni',t.dni,
      'nombre',concat_ws(' ',t.nombres,t.apellidos)) into v_operador
      from public.trabajadores t join public.usuarios_app a
        on a.trabajador_id=t.id and a.tenant_id=t.tenant_id and a.activo
      where t.tenant_id=p_tenant_id and t.dni=p_dni and t.activo;
    if v_operador is null then
      raise exception using errcode='42501',message='DNI no autorizado en la empresa vinculada';
    end if;
    select coalesce(jsonb_agg(fila order by fila->>'cultivo_nombre',fila->>'codigo'),'[]'::jsonb)
      into v_campanias from (
        select jsonb_build_object('tenant_id',c.tenant_id,'id',c.id,'codigo',c.codigo,'nombre',c.nombre,
          'cultivo_id',cu.id,'cultivo_nombre',cu.nombre,'roles',jsonb_agg(r.rol order by r.rol)) fila
        from public.trabajador_campania_rol r
        join public.trabajadores t on t.id=r.trabajador_id and t.tenant_id=r.tenant_id and t.activo
        join public.campanias c on c.id=r.campania_id and c.tenant_id=r.tenant_id and c.estado='ACTIVA'
        join public.cultivos cu on cu.id=c.cultivo_id and cu.activo
        where r.tenant_id=p_tenant_id and t.dni=p_dni and r.activo
          and (r.rol='SUPERVISORA' or (r.rol='JABERO'
            and r.fecha_asignacion_jabero=(clock_timestamp() at time zone 'America/Lima')::date))
        group by c.id,cu.id
      ) opciones;
    v_operador := v_operador || jsonb_build_object('campanias',v_campanias,
      'autorizado_para_fecha',(clock_timestamp() at time zone 'America/Lima')::date);
  end if;
  if jsonb_array_length(v_operador->'campanias')=0 then
    raise exception using errcode='42501',message='No tiene campañas activas asignadas en la empresa vinculada';
  end if;
  return v_operador;
end;
$$;

create function pda_privado.equipo_solicitud()
returns pda_privado.dispositivos language plpgsql security definer set search_path = '' as $$
declare h jsonb := nullif(current_setting('request.headers',true),'')::jsonb;
begin
  if auth.uid() is not null then
    raise exception using errcode='42501',message='Use el transporte operativo del PDA, separado de la cuenta';
  end if;
  if coalesce(h->>'x-gesgrow-device-id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or coalesce(h->>'x-gesgrow-operator-dni','') !~ '^[0-9]{8}$' then
    raise exception using errcode='42501',message='PDA vinculado y operador requeridos';
  end if;
  -- El UUID y las cabeceras no son autoridad: validar el secreto y revocación.
  return pda_privado.equipo_pin((h->>'x-gesgrow-device-id')::uuid,h->>'x-gesgrow-device-key');
end;
$$;

create or replace function pda_privado.exigir_solicitud(p_campania_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := public.platform_tenant_campania(p_campania_id);
  v_datos jsonb; v_equipo pda_privado.dispositivos;
begin
  if auth.uid() is null then
    -- Las rutas operativas por DNI exigen credencial incluso si el antiguo
    -- interruptor está apagado. Apagarlo ya no reabre escrituras anónimas.
    v_equipo := pda_privado.equipo_solicitud();
    perform public.platform_exigir_modulo(v_equipo.tenant_id,'HARVEST');
  else
    -- Conservar el contrato IAM autenticado y sus recibos de dispositivo.
    if not coalesce((select c.obligatorio from pda_privado.configuracion c where c.tenant_id=v_tenant),false) then return; end if;
    v_datos := nullif(current_setting('gesgrow.pda_solicitud',true),'')::jsonb;
    if coalesce(v_datos->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using errcode='42501',message='PDA vinculado requerido: utilice pda_operar';
    end if;
    v_equipo := pda_privado.exigir_dispositivo((v_datos->>'id')::uuid,v_datos->>'credencial');
  end if;
  if v_equipo.tenant_id is distinct from v_tenant then
    raise exception using errcode='42501',message='Dispositivo de otra empresa';
  end if;
end;
$$;

create or replace function public.autorizar_operador_campania(p_dni varchar,p_campania_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_operador jsonb;
begin
  perform public.iam_exigir_legacy_pda();
  perform pda_privado.exigir_solicitud(p_campania_id);
  if p_dni is distinct from (nullif(current_setting('request.headers',true),'')::jsonb->>'x-gesgrow-operator-dni') then
    raise exception using errcode='42501',message='El operador no corresponde a la solicitud del PDA';
  end if;
  v_operador := pda_privado.operador_empresa(public.platform_tenant_campania(p_campania_id),p_dni);
  if not exists(select 1 from jsonb_array_elements(v_operador->'campanias') c where (c->>'id')::uuid=p_campania_id) then
    raise exception using errcode='42501',message='El operador no está autorizado para esta campaña';
  end if;
end;
$$;

create or replace function public.validar_operador_campanias(p_dni varchar)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_equipo pda_privado.dispositivos;
begin
  v_equipo := pda_privado.equipo_solicitud();
  if p_dni is distinct from (nullif(current_setting('request.headers',true),'')::jsonb->>'x-gesgrow-operator-dni') then
    raise exception using errcode='42501',message='El operador no corresponde a la solicitud del PDA';
  end if;
  return pda_privado.operador_empresa(v_equipo.tenant_id,p_dni);
end;
$$;

-- El ingreso diario ya valida una credencial como parámetro: no necesita
-- cabeceras de una sesión todavía inexistente ni consulta global de DNI.
do $ingreso$
declare d text;
begin
  d := pg_get_functiondef('pda_privado.ingresar_dni(uuid,text,text)'::regprocedure);
  if strpos(d,'v_operador := public.validar_operador_campanias(p_dni::varchar);')=0 then
    raise exception 'Contrato de ingreso DNI no reconocido';
  end if;
  execute replace(d,'v_operador := public.validar_operador_campanias(p_dni::varchar);',
    'v_operador := pda_privado.operador_empresa(v_equipo.tenant_id,p_dni::varchar);');
  d := pg_get_functiondef('pda_privado.ingresar(uuid,text)'::regprocedure);
  execute replace(d,'public.iam_operador_pwa_campanias(v_dni)',
    'pda_privado.operador_cuenta((v_resultado->''dispositivo''->>''tenantId'')::uuid,v_dni::varchar)');
  d := pg_get_functiondef('public.validar_operador(varchar)'::regprocedure);
  execute replace(d,'public.iam_operador_pwa_campanias(p_dni)',
    'pda_privado.operador_empresa(public.platform_tenant_operativo(),p_dni)');
end $ingreso$;

revoke all on function pda_privado.operador_cuenta(uuid,varchar),pda_privado.operador_empresa(uuid,varchar),
  pda_privado.equipo_solicitud(),pda_privado.exigir_solicitud(uuid),
  public.autorizar_operador_campania(varchar,uuid),public.validar_operador_campanias(varchar)
  from public,anon,authenticated,service_role;
grant execute on function public.validar_operador_campanias(varchar) to anon;
notify pgrst,'reload schema';
commit;
