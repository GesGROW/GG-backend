begin;

-- Undo only the integration introduced on 2026-11-09. The pre-existing daily
-- bonus rules, container corrections and harvest records are not altered.
drop function if exists public.harvest_admin_tareo_consumidores(uuid,uuid,jsonb);
drop function if exists public.harvest_reportes_tareo_rango(uuid,uuid,date,date,uuid);
drop function if exists public.harvest_admin_editar_trabajador_con_codigo(uuid,uuid,text,uuid,text,text,text,boolean,text);
drop function if exists public.harvest_admin_tareo_guardar(uuid,uuid,jsonb);
drop function if exists public.harvest_reportes_tareo(uuid,uuid,date,uuid);
drop function if exists public.workforce_admin_codigo_externo(uuid,uuid,text);

drop function if exists harvest_bonos_privado.admin_consumidores(uuid,uuid,jsonb);
drop function if exists harvest_bonos_privado.configuracion_consumidores(uuid,uuid);
drop function if exists harvest_bonos_privado.reportes_tareo_rango(uuid,uuid,date,date,uuid);
drop function if exists harvest_bonos_privado.editar_trabajador_con_codigo(uuid,uuid,text,uuid,text,text,text,boolean,text);
drop function if exists harvest_bonos_privado.tareo_guardar(uuid,uuid,jsonb);
drop function if exists harvest_bonos_privado.reportes_tareo(uuid,uuid,date,uuid);
drop function if exists harvest_bonos_privado.codigo_trabajador(uuid,uuid,text);

drop trigger if exists codigo_desde_padron on public.trabajadores;
drop function if exists harvest_bonos_privado.codigo_desde_padron();

-- Restore the exact earlier bodies by removing only the inserted DTO fields.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.workforce_admin_dto(uuid,uuid)'::regprocedure);
 execute replace(d,',''codigoExterno'',codigo_externo','');
 d:=pg_get_functiondef('public.workforce_cosecha_listar(uuid,jsonb)'::regprocedure);
 execute replace(d,'t.codigo_externo as "codigoExterno",','');
 d:=pg_get_functiondef('public.harvest_admin_trabajador_campania(uuid,uuid,text,uuid)'::regprocedure);
 execute replace(d,'''codigoExterno'',t.codigo_externo,','');
end $$;

drop table if exists harvest_bonos_privado.consumidores_lote;
drop table if exists harvest_bonos_privado.consumidores;
drop table if exists harvest_bonos_privado.labores_rol;
drop table if exists harvest_bonos_privado.padron_trabajadores;
drop table if exists harvest_bonos_privado.tareo_imputaciones;
alter table public.trabajadores drop column if exists codigo_externo;

-- Names were a separate data update. No previous-value snapshot exists in this
-- table, so restoring those values requires an earlier authoritative backup.
-- Do not guess names or erase production participants during schema rollback.
notify pgrst,'reload schema';
commit;
