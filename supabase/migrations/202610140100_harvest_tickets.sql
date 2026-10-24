begin;

-- Modelo nuevo independiente: ningún cambio en tickets/lecturas/sesiones legacy.
create table public.harvest_lotes_tickets (
  id uuid primary key,
  campania_id uuid not null references public.campanias(id),
  creado_en timestamptz not null default now(),
  unique(id, campania_id)
);
create index harvest_lotes_tickets_campania on public.harvest_lotes_tickets(campania_id);

create table public.harvest_tickets (
  codigo text constraint harvest_tickets_codigo_unico primary key,
  lote_id uuid not null,
  campania_id uuid not null,
  constraint harvest_ticket_codigo_valido check (
    codigo <> '' and codigo = btrim(codigo) and codigo !~ '^[[:space:]]|[[:space:]]$'
  ),
  foreign key(lote_id, campania_id) references public.harvest_lotes_tickets(id, campania_id),
  unique(codigo, lote_id, campania_id)
);
create index harvest_tickets_lote on public.harvest_tickets(lote_id, campania_id);

-- Estructuras para reconstituir estados del dominio. F5.2 no publica escrituras
-- de asignación/uso: sus casos transaccionales pertenecen a F5.3.
create table public.harvest_asignaciones_lote (
  lote_id uuid primary key,
  campania_id uuid not null,
  trabajador_id uuid not null references public.trabajadores(id),
  operacion_id uuid not null,
  foreign key(lote_id, campania_id) references public.harvest_lotes_tickets(id, campania_id),
  unique(lote_id, campania_id, trabajador_id, operacion_id)
);
create table public.harvest_registros_cosecha (
  id uuid primary key,
  codigo_ticket text not null unique,
  lote_id uuid not null,
  campania_id uuid not null,
  trabajador_id uuid not null,
  asignacion_operacion_id uuid not null,
  fecha_hora timestamptz not null,
  foreign key(codigo_ticket, lote_id, campania_id)
    references public.harvest_tickets(codigo, lote_id, campania_id),
  foreign key(lote_id, campania_id, trabajador_id, asignacion_operacion_id)
    references public.harvest_asignaciones_lote(lote_id, campania_id, trabajador_id, operacion_id)
);

alter table public.harvest_lotes_tickets enable row level security;
alter table public.harvest_tickets enable row level security;
alter table public.harvest_asignaciones_lote enable row level security;
alter table public.harvest_registros_cosecha enable row level security;
revoke all on public.harvest_lotes_tickets, public.harvest_tickets,
  public.harvest_asignaciones_lote, public.harvest_registros_cosecha from public, anon, authenticated;

-- Se reutiliza la autorización administrativa por campaña ya existente.
-- No se añaden permisos a cuentas ni se modifican los RPC de Sheets o PDA.
create function public.harvest_crear_lotes_tickets(p_campania_id uuid, p_lotes jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_lote jsonb; v_ticket jsonb; v_lote_id uuid; v_codigo text;
begin
  perform public.autorizar_integracion_hoja(p_campania_id, false);
  if not exists(select 1 from public.campanias where id = p_campania_id and estado = 'ACTIVA') then
    raise exception 'La campaña debe estar activa para generar tickets';
  end if;
  if p_lotes is null or jsonb_typeof(p_lotes) <> 'array' then
    raise exception 'Se requiere una lista de lotes';
  end if;
  if jsonb_array_length(p_lotes) = 0 then raise exception 'Se requiere al menos un lote'; end if;
  for v_lote in select value from jsonb_array_elements(p_lotes) loop
    v_lote_id := (v_lote->>'id')::uuid;
    if v_lote_id is null or jsonb_typeof(v_lote->'tickets') is distinct from 'array' then
      raise exception 'El lote requiere identidad y una lista de tickets';
    end if;
    if jsonb_array_length(v_lote->'tickets') = 0 then raise exception 'Un lote requiere tickets'; end if;
    begin
      insert into public.harvest_lotes_tickets(id, campania_id) values(v_lote_id, p_campania_id);
    exception when unique_violation then
      raise exception using errcode = '23505', message = 'harvest_lote_duplicado', detail = v_lote_id::text;
    end;
    for v_ticket in select value from jsonb_array_elements(v_lote->'tickets') loop
      if jsonb_typeof(v_ticket) <> 'string' then raise exception 'El código debe ser texto'; end if;
      v_codigo := v_ticket #>> '{}';
      begin
        insert into public.harvest_tickets(codigo, lote_id, campania_id)
        values(v_codigo, v_lote_id, p_campania_id);
      exception when unique_violation then
        raise exception using errcode = '23505', message = 'harvest_ticket_duplicado', detail = v_codigo;
      end;
    end loop;
  end loop;
end $$;

-- PK por código + filtro de campaña: un único ticket y su agregado lote,
-- sin agregar/cargar todos los tickets de la campaña ni del lote.
create function public.harvest_resolver_ticket(p_campania_id uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_resultado jsonb;
begin
  perform public.autorizar_integracion_hoja(p_campania_id, false);
  select jsonb_build_object('lote', to_jsonb(l), 'ticket', to_jsonb(t),
    'asignacion', to_jsonb(a), 'registro', to_jsonb(r)) into v_resultado
  from public.harvest_tickets t
  join public.harvest_lotes_tickets l on l.id = t.lote_id and l.campania_id = t.campania_id
  left join public.harvest_asignaciones_lote a on a.lote_id = l.id and a.campania_id = l.campania_id
  left join public.harvest_registros_cosecha r on r.codigo_ticket = t.codigo
  where t.codigo = p_codigo and t.campania_id = p_campania_id;
  return v_resultado;
end $$;

revoke all on function public.harvest_crear_lotes_tickets(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.harvest_resolver_ticket(uuid,text) from public, anon, authenticated;
grant execute on function public.harvest_crear_lotes_tickets(uuid,jsonb) to authenticated;
grant execute on function public.harvest_resolver_ticket(uuid,text) to authenticated;
commit;
