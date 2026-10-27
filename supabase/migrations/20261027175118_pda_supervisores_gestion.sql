begin;

-- El supervisor administra los QR y PDA de su empresa mediante harvest.manage.
-- No recibe company.manage ni permisos de otras empresas.
create or replace function pda_privado.exigir_gestion(p_tenant_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_contexto jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sesión autenticada requerida';
  end if;
  v_contexto := public.iam_resolver_tenant_context(p_tenant_id);
  if not (v_contexto->'permisos' ?| array['company.manage', 'harvest.manage']) then
    raise exception using errcode = '42501', message = 'Permiso de gestión de PDA denegado';
  end if;
  return (v_contexto->>'usuarioId')::uuid;
end;
$$;
revoke all on function pda_privado.exigir_gestion(uuid) from public, anon, authenticated;

-- Mantener firmas, ACL, vencimientos, hash, bloqueos y auditoría existentes.
-- Esta migración también actualiza instalaciones que ya aplicaron la anterior.
do $permisos$
declare v_firma text; v_original text; v_nuevo text;
begin
  foreach v_firma in array array[
    'pda_privado.generar_vinculacion(uuid,integer)',
    'pda_privado.administrar(uuid,uuid)'
  ] loop
    v_original := pg_get_functiondef(v_firma::regprocedure);
    v_nuevo := replace(v_original,
      'public.iam_exigir_permiso(p_tenant_id, ''company.manage'')',
      'pda_privado.exigir_gestion(p_tenant_id)');
    if v_nuevo = v_original and strpos(v_original, 'pda_privado.exigir_gestion(p_tenant_id)') = 0 then
      raise exception 'No se encontró la guarda de gestión de PDA en %', v_firma;
    end if;
    execute v_nuevo;
  end loop;
end;
$permisos$;

-- La configuración del corte obligatorio continúa bajo administración de empresa.
notify pgrst, 'reload schema';
commit;
