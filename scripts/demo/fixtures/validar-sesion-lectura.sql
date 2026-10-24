-- Definición del esquema remoto aportada por el usuario el 15/10/2026.
-- Solo se instala en PGlite mediante verify-quijas.mjs. No es una migración.
CREATE OR REPLACE FUNCTION public.validar_sesion_lectura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_rol rol_trabajador;
  v_campania_jabero uuid;
  v_jabero_activo boolean;

  v_campania_lote uuid;
  v_lote_activo boolean;

  v_estado_campania estado_campania;

  v_usuario_activo boolean;
begin

  -- ----------------------------------------------------------
  -- Obtener campaña del lote
  -- ----------------------------------------------------------

  select campania_id, activo
  into v_campania_lote, v_lote_activo
  from lotes
  where id = new.lote_id;

  if v_campania_lote is null then
    raise exception 'El lote indicado no existe';
  end if;

  if not v_lote_activo then
    raise exception 'El lote no está activo';
  end if;


  -- ----------------------------------------------------------
  -- Validar campaña
  -- ----------------------------------------------------------

  select estado
  into v_estado_campania
  from campanias
  where id = v_campania_lote;

  if v_estado_campania <> 'ACTIVA' then
    raise exception 'La campaña del lote no está activa';
  end if;


  -- ----------------------------------------------------------
  -- Validar jabero
  -- ----------------------------------------------------------

  select rol, campania_id, activo
  into v_rol, v_campania_jabero, v_jabero_activo
  from trabajador_campania_rol
  where id = new.jabero_rol_id;

  if v_rol is null then
    raise exception 'El jabero indicado no existe';
  end if;

  if v_rol <> 'JABERO' then
    raise exception 'El trabajador indicado no posee rol JABERO';
  end if;

  if v_campania_jabero <> v_campania_lote then
    raise exception 'El jabero no pertenece a la campaña del lote';
  end if;

  if not v_jabero_activo then
    raise exception 'El jabero no está activo en la campaña';
  end if;


  -- ----------------------------------------------------------
  -- Validar usuario de la aplicación
  -- ----------------------------------------------------------

  select activo
  into v_usuario_activo
  from usuarios_app
  where id = new.iniciada_por_usuario_id;

  if v_usuario_activo is null or not v_usuario_activo then
    raise exception 'El usuario no está autorizado para utilizar la aplicación';
  end if;

  return new;
end;
$function$;
