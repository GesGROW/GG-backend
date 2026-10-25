begin;

-- Existing campaign rows identify the participation, not the worker. Never
-- infer surnames from the combined display name or accept an arbitrary worker.
create function public.harvest_admin_trabajador_campania(
  p_tenant_id uuid,p_campania_id uuid,p_rol text,p_participacion_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare d jsonb;
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id);
  perform public.harvest_cultivos_exigir_campania(p_tenant_id,p_campania_id);
  if p_campania_id is null or p_rol is null or p_rol not in ('COSECHADOR','JABERO') or p_participacion_id is null then
    raise exception 'Campaña, función y participación requeridas';
  end if;
  select jsonb_build_object('id',t.id,'tenantId',t.tenant_id,'participacionId',r.id,'campaniaId',r.campania_id,
    'rol',r.rol,'dni',t.dni,'nombres',t.nombres,'apellidos',t.apellidos,'activo',r.activo,
    'trabajadorActivo',t.activo,'iniciadoEn',r.iniciado_en,'fechaJabero',r.fecha_asignacion_jabero) into d
    from public.trabajador_campania_rol r join public.trabajadores t on t.id=r.trabajador_id and t.tenant_id=r.tenant_id
    where r.id=p_participacion_id and r.tenant_id=p_tenant_id and r.campania_id=p_campania_id and r.rol::text=p_rol;
  if d is null then raise exception using errcode='42501',message='Participación de otra campaña, empresa o función'; end if;
  return d;
end $$;

create function public.harvest_admin_editar_trabajador_campania(
  p_tenant_id uuid,p_campania_id uuid,p_rol text,p_participacion_id uuid,
  p_dni text,p_nombres text,p_apellidos text,p_activo boolean
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare d jsonb; v_trabajador uuid; v_antes boolean; v_global boolean;
begin
  perform public.harvest_admin_exigir(p_tenant_id,p_campania_id,true);
  d:=public.harvest_admin_trabajador_campania(p_tenant_id,p_campania_id,p_rol,p_participacion_id);
  v_trabajador:=(d->>'id')::uuid;
  -- Serialize against changes to both the worker and this participation.
  select r.activo,t.activo into strict v_antes,v_global
    from public.trabajador_campania_rol r join public.trabajadores t on t.id=r.trabajador_id and t.tenant_id=r.tenant_id
    where r.id=p_participacion_id and r.tenant_id=p_tenant_id and r.campania_id=p_campania_id
      and r.rol::text=p_rol and t.id=v_trabajador for update of t,r;
  if p_dni is null or btrim(p_dni)!~'^[0-9]{8}$' or p_activo is null
    or nullif(btrim(p_nombres),'') is null or nullif(btrim(p_apellidos),'') is null
    or length(btrim(p_nombres))>200 or length(btrim(p_apellidos))>200 then
    raise exception 'DNI de ocho dígitos, nombres, apellidos y estado requeridos';
  end if;
  if p_activo and not v_antes then
    if not v_global then raise exception 'El trabajador está inactivo a nivel general'; end if;
    if not exists(select 1 from public.campanias where id=p_campania_id and tenant_id=p_tenant_id and estado='ACTIVA') then
      raise exception 'La campaña debe estar activa para habilitar una participación';
    end if;
  end if;
  update public.trabajadores set dni=btrim(p_dni),nombres=btrim(p_nombres),apellidos=btrim(p_apellidos)
    where id=v_trabajador and tenant_id=p_tenant_id;
  -- Only this role in this campaign changes. No global worker/Identity state.
  -- A daily JABERO grant is never refreshed by editing names or toggling state.
  if p_activo is distinct from v_antes then
    update public.trabajador_campania_rol set activo=p_activo
      where id=p_participacion_id and tenant_id=p_tenant_id and campania_id=p_campania_id and rol::text=p_rol;
    if p_rol='JABERO' and p_activo then
      -- The existing activation trigger sets today's date. Restore the prior
      -- daily authorization: this editor does not grant a new workday.
      update public.trabajador_campania_rol set fecha_asignacion_jabero=(d->>'fechaJabero')::date
        where id=p_participacion_id and tenant_id=p_tenant_id;
    end if;
    perform public.recalcular_acceso_app_trabajador(v_trabajador);
  end if;
  return public.harvest_admin_trabajador_campania(p_tenant_id,p_campania_id,p_rol,p_participacion_id);
exception when unique_violation then
  raise exception 'El DNI ya está registrado para otro trabajador de esta empresa';
end $$;

revoke all on function public.harvest_admin_trabajador_campania(uuid,uuid,text,uuid),
  public.harvest_admin_editar_trabajador_campania(uuid,uuid,text,uuid,text,text,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.harvest_admin_trabajador_campania(uuid,uuid,text,uuid),
  public.harvest_admin_editar_trabajador_campania(uuid,uuid,text,uuid,text,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
