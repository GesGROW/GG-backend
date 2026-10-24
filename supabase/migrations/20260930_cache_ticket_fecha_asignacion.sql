do $migration$
declare
  function_oid oid;
  definition text;
  updated_definition text;
  match_count integer;
  target_pattern constant text :=
    E'jsonb_build_object\\(\\s*''codigo_ticket''\\s*,\\s*at\\.codigo_ticket\\s*,\\s*''cosechador_dni''\\s*,\\s*t\\.dni\\s*,\\s*''cosechador''\\s*,\\s*concat_ws\\(\\s*'' ''\\s*,\\s*t\\.nombres\\s*,\\s*t\\.apellidos\\s*\\)\\s*\\)';
  replacement constant text := $replacement$
jsonb_build_object(
  'codigo_ticket', at.codigo_ticket,
  'cosechador_dni', t.dni,
  'cosechador',
  concat_ws(
    ' ',
    t.nombres,
    t.apellidos
  ),
  'fecha_asignacion', at.fecha_asignacion
)
$replacement$;
begin
  function_oid := to_regprocedure(
    'public.obtener_cache_operativa(character varying)'
  );

  if function_oid is null then
    raise exception
      'No existe public.obtener_cache_operativa(character varying)';
  end if;

  definition := pg_get_functiondef(function_oid);

  select count(*)
  into match_count
  from regexp_matches(definition, target_pattern, 'gi');

  if match_count <> 1 then
    raise exception
      'Se esperaba exactamente un objeto ticket para actualizar; encontrados: %',
      match_count;
  end if;

  updated_definition := regexp_replace(
    definition,
    target_pattern,
    replacement,
    'i'
  );

  execute updated_definition;
end
$migration$;

notify pgrst, 'reload schema';
