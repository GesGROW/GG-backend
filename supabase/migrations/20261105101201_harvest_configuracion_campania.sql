begin;

-- Editing a campaign never changes its crop, status, ticket identities or templates.
alter table public.harvest_cultivo_operaciones
 drop constraint harvest_cultivo_operaciones_tipo_check;
alter table public.harvest_cultivo_operaciones add constraint harvest_cultivo_operaciones_tipo_check
 check(tipo in ('CREAR','CAMPANIA','CONFIGURACION'));

create function public.harvest_configuracion_campania_dto(p_tenant uuid,p_campania uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d jsonb;
begin
 select jsonb_build_object(
  'tenantId',c.tenant_id,'campaniaId',c.id,'cultivoId',c.cultivo_id,'cultivo',cu.nombre,
  'nombre',c.nombre,'fechaInicio',c.fecha_inicio,'fechaFin',c.fecha_fin,'estado',c.estado,
  'variedades',coalesce((select jsonb_agg(jsonb_build_object(
   'id',v.id,'nombre',v.nombre,'activo',v.activo,
   'protegida',exists(select 1 from public.sesiones_lectura s where s.tenant_id=p_tenant and s.variedad_id=v.id)
    or exists(select 1 from public.lote_variedades lv join public.lotes l on l.id=lv.lote_id
     where lv.tenant_id=p_tenant and lv.variedad_id=v.id and l.campania_id<>c.id)
  ) order by v.nombre,v.id) from public.variedades v where v.tenant_id=p_tenant and v.cultivo_id=c.cultivo_id),'[]'::jsonb),
  'lotes',coalesce((select jsonb_agg(jsonb_build_object(
   'id',l.id,'nombre',l.nombre,'activo',l.activo,
   'protegido',exists(select 1 from public.sesiones_lectura s where s.tenant_id=p_tenant and s.lote_id=l.id),
   'sesionActiva',exists(select 1 from public.sesiones_lectura s where s.tenant_id=p_tenant and s.lote_id=l.id and s.estado::text='ACTIVA'),
   'variedades',coalesce((select jsonb_agg(lv.variedad_id order by lv.variedad_id)
    from public.lote_variedades lv where lv.tenant_id=p_tenant and lv.lote_id=l.id and lv.activo),'[]'::jsonb)
  ) order by l.codigo,l.id) from public.lotes l where l.tenant_id=p_tenant and l.campania_id=c.id),'[]'::jsonb)
 ) into d from public.campanias c join public.cultivos cu on cu.id=c.cultivo_id
 where c.tenant_id=p_tenant and c.id=p_campania;
 return d||jsonb_build_object('revision',md5(d::text));
end $$;

create function public.harvest_admin_configuracion_campania(p_tenant_id uuid,p_campania_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_cultivo uuid;
begin
 select cultivo_id into v_cultivo from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
 if not found then raise exception using errcode='42501',message='Campaña no disponible en esta empresa'; end if;
 perform public.harvest_cultivos_exigir(p_tenant_id,v_cultivo,true);
 return public.harvest_configuracion_campania_dto(p_tenant_id,p_campania_id);
end $$;

create function public.harvest_admin_guardar_configuracion_campania(
 p_tenant_id uuid,p_operacion_id uuid,p_campania_id uuid,p_datos jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_cultivo uuid; v_actor uuid; actual jsonb; v jsonb; l jsonb; anterior jsonb;
 v_id uuid; v_ids uuid[]; v_inicio date; v_fin date; v_min date; v_max date;
 v_recibo public.harvest_cultivo_operaciones%rowtype; resultado jsonb;
 v_intencion jsonb:=jsonb_build_object('campaniaId',p_campania_id,'datos',p_datos);
begin
 if p_operacion_id is null then raise exception 'ID de operación requerido'; end if;
 select cultivo_id into v_cultivo from public.campanias where tenant_id=p_tenant_id and id=p_campania_id;
 if not found then raise exception using errcode='42501',message='Campaña no disponible en esta empresa'; end if;
 v_actor:=public.harvest_cultivos_exigir(p_tenant_id,v_cultivo,true);
 perform pg_advisory_xact_lock(hashtextextended('harvest.cultivos:'||p_operacion_id::text,0));
 select * into v_recibo from public.harvest_cultivo_operaciones where id=p_operacion_id;
 if found then
  if v_recibo.tenant_id<>p_tenant_id or v_recibo.usuario_id<>v_actor or v_recibo.tipo<>'CONFIGURACION'
   or v_recibo.datos is distinct from v_intencion then raise exception 'ID de operación reutilizado con otra intención'; end if;
  return v_recibo.resultado;
 end if;
 -- Same crop -> campaign lock order as creation. Row locks serialize sessions and catalog edits.
 perform 1 from public.harvest_cultivos where tenant_id=p_tenant_id and id=v_cultivo for update;
 perform 1 from public.campanias where tenant_id=p_tenant_id and id=p_campania_id for update;
 perform 1 from public.lotes where tenant_id=p_tenant_id and campania_id=p_campania_id order by id for update;
 perform 1 from public.variedades where tenant_id=p_tenant_id and cultivo_id=v_cultivo order by id for update;
 actual:=public.harvest_configuracion_campania_dto(p_tenant_id,p_campania_id);
 if jsonb_typeof(p_datos) is distinct from 'object' or p_datos->>'revision' is distinct from actual->>'revision' then
  raise exception using errcode='40001',message='La configuración cambió. Recarga y revisa los cambios antes de guardar'; end if;
 if exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('revision','nombre','fechaInicio','fechaFin','variedades','lotes'))
  or jsonb_typeof(p_datos->'nombre') is distinct from 'string' or length(btrim(p_datos->>'nombre')) not between 1 and 100
  or jsonb_typeof(p_datos->'fechaInicio') is distinct from 'string' or (p_datos->>'fechaInicio') !~ '^\d{4}-\d{2}-\d{2}$'
  or jsonb_typeof(p_datos->'fechaFin') is distinct from 'string' or (p_datos->>'fechaFin') !~ '^\d{4}-\d{2}-\d{2}$'
  or jsonb_typeof(p_datos->'variedades') is distinct from 'array' or jsonb_typeof(p_datos->'lotes') is distinct from 'array' then
  raise exception 'Nombre, fechas, lotes y variedades válidos son obligatorios'; end if;
 v_inicio:=(p_datos->>'fechaInicio')::date; v_fin:=(p_datos->>'fechaFin')::date;
 if not isfinite(v_inicio) or not isfinite(v_fin) or v_fin<v_inicio then raise exception 'La fecha fin debe ser igual o posterior al inicio'; end if;
 -- Historical starts are legal when editing; never exclude recorded work.
 select min(d),max(d) into v_min,v_max from (
  select (s.fecha_inicio at time zone 'America/Lima')::date d from public.sesiones_lectura s
   join public.lotes l on l.id=s.lote_id where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  union all select (s.fecha_fin at time zone 'America/Lima')::date from public.sesiones_lectura s
   join public.lotes l on l.id=s.lote_id where l.tenant_id=p_tenant_id and l.campania_id=p_campania_id
  union all select (r.fecha_hora at time zone 'America/Lima')::date from public.harvest_produccion_reportable r
   where r.campania_id=p_campania_id
 ) fechas;
 if v_inicio>v_min or v_fin<v_max then raise exception 'Las fechas no pueden excluir sesiones ni cosecha registrada'; end if;
 if jsonb_array_length(p_datos->'variedades') not between 1 and 100 or jsonb_array_length(p_datos->'lotes') not between 1 and 100 then
  raise exception 'Agrega entre 1 y 100 variedades y lotes'; end if;
 if exists(select 1 from jsonb_array_elements(p_datos->'variedades') x group by x->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_datos->'variedades') x group by lower(btrim(x->>'nombre')) having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_datos->'lotes') x group by x->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_datos->'lotes') x group by lower(btrim(x->>'nombre')) having count(*)>1) then
  raise exception 'No se permiten nombres ni identificadores repetidos'; end if;
 -- Retain every existing row; deactivation replaces destructive deletion.
 if exists(select 1 from jsonb_array_elements(actual->'lotes') x where not exists(
   select 1 from jsonb_array_elements(p_datos->'lotes') y where y->>'id'=x->>'id'))
  or exists(select 1 from jsonb_array_elements(actual->'variedades') x where not exists(
   select 1 from jsonb_array_elements(p_datos->'variedades') y where y->>'id'=x->>'id')) then
  raise exception 'Conserva los registros existentes; los lotes se desactivan para mantener el historial'; end if;
 if not exists(select 1 from jsonb_array_elements(p_datos->'lotes') x where x->'activo'='true'::jsonb) then
  raise exception 'Conserva al menos un lote activo'; end if;
 for v in select value from jsonb_array_elements(p_datos->'variedades') loop
  if jsonb_typeof(v->'id') is distinct from 'string' or jsonb_typeof(v->'nombre') is distinct from 'string'
   or length(btrim(v->>'nombre')) not between 1 and 100 then raise exception 'Variedad inválida'; end if;
  v_id:=(v->>'id')::uuid;
  select x into anterior from jsonb_array_elements(actual->'variedades') x where x->>'id'=v_id::text;
  if found then
   if (anterior->>'protegida')::boolean and btrim(v->>'nombre')<>anterior->>'nombre' then
    raise exception 'No se puede renombrar una variedad con historial o compartida con otra campaña'; end if;
   if btrim(v->>'nombre')<>anterior->>'nombre' then
    update public.variedades set nombre=btrim(v->>'nombre') where tenant_id=p_tenant_id and id=v_id;
   end if;
  else
   if exists(select 1 from public.variedades where id=v_id) then raise exception using errcode='42501',message='Variedad ajena al cultivo'; end if;
   insert into public.variedades(id,tenant_id,cultivo_id,nombre,activo) values(v_id,p_tenant_id,v_cultivo,btrim(v->>'nombre'),true);
  end if;
 end loop;
 for l in select value from jsonb_array_elements(p_datos->'lotes') loop
  if jsonb_typeof(l->'id') is distinct from 'string' or jsonb_typeof(l->'nombre') is distinct from 'string'
   or length(btrim(l->>'nombre')) not between 1 and 100 or jsonb_typeof(l->'activo') is distinct from 'boolean'
   or jsonb_typeof(l->'variedades') is distinct from 'array' then raise exception 'Lote inválido'; end if;
  v_id:=(l->>'id')::uuid;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(l->'variedades') x;
  select x into anterior from jsonb_array_elements(actual->'lotes') x where x->>'id'=v_id::text;
  -- Keep existing inactive varieties without allowing new assignments to them.
  if coalesce(cardinality(v_ids),0)=0 or cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x)
   or exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.variedades v
    where v.id=x and v.tenant_id=p_tenant_id and v.cultivo_id=v_cultivo
     and (v.activo or coalesce(anterior->'variedades','[]'::jsonb) ? x::text))) then
   raise exception 'Cada lote requiere variedades del mismo cultivo; las nuevas asociaciones deben estar activas, sin repetir'; end if;
  if found then
   if (anterior->>'protegido')::boolean and btrim(l->>'nombre')<>anterior->>'nombre' then
    raise exception 'No se puede renombrar un lote con sesiones registradas'; end if;
   if exists(select 1 from public.sesiones_lectura s where s.tenant_id=p_tenant_id and s.lote_id=v_id and s.estado::text='ACTIVA'
    and (not (l->>'activo')::boolean or not s.variedad_id=any(v_ids))) then
    raise exception 'Cierra las sesiones activas antes de desactivar el lote o retirar su variedad'; end if;
   -- Preserve the legacy primary variety for older queues, as the existing lot API does.
   update public.lotes set nombre=btrim(l->>'nombre'),activo=(l->>'activo')::boolean where tenant_id=p_tenant_id and id=v_id;
  else
   if exists(select 1 from public.lotes where id=v_id) then raise exception using errcode='42501',message='Lote ajeno a la campaña'; end if;
   insert into public.lotes(id,tenant_id,campania_id,codigo,nombre,variedad_id,activo)
    values(v_id,p_tenant_id,p_campania_id,'L-'||left(replace(v_id::text,'-',''),20),btrim(l->>'nombre'),v_ids[1],(l->>'activo')::boolean);
  end if;
  update public.lote_variedades set activo=false where tenant_id=p_tenant_id and lote_id=v_id and not variedad_id=any(v_ids);
  insert into public.lote_variedades(tenant_id,lote_id,variedad_id,activo) select p_tenant_id,v_id,x,true from unnest(v_ids) x
   on conflict(lote_id,variedad_id) do update set activo=true;
 end loop;
 update public.campanias set nombre=btrim(p_datos->>'nombre'),fecha_inicio=v_inicio,fecha_fin=v_fin
  where tenant_id=p_tenant_id and id=p_campania_id;
 resultado:=public.harvest_configuracion_campania_dto(p_tenant_id,p_campania_id);
 insert into public.harvest_cultivo_operaciones(id,tenant_id,usuario_id,tipo,datos,resultado)
  values(p_operacion_id,p_tenant_id,v_actor,'CONFIGURACION',v_intencion,resultado);
 return resultado;
end $$;

revoke all on function public.harvest_configuracion_campania_dto(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.harvest_admin_configuracion_campania(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.harvest_admin_guardar_configuracion_campania(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.harvest_admin_configuracion_campania(uuid,uuid) to authenticated;
grant execute on function public.harvest_admin_guardar_configuracion_campania(uuid,uuid,uuid,jsonb) to authenticated;
commit;
