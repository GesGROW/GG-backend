begin;

-- ADMIN_EMPRESA es el rol organizacional del owner. Los permisos operativos
-- provienen de roles de módulo asignados por separado. No se retiran esos roles
-- ni sus permisos a ninguna membresía.
delete from public.identity_rol_permisos rp
using public.identity_roles r
where r.tenant_id = rp.tenant_id and r.id = rp.rol_id
  and r.codigo = 'ADMIN_EMPRESA'
  and rp.permiso not in ('company.manage', 'reports.view');

create or replace function public.iam_sembrar_roles(p_tenant uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.identity_roles(tenant_id,codigo)
    select p_tenant,codigo from unnest(array['ADMIN_EMPRESA','GESTOR','OPERADOR_CAMPO','CONSULTA']) codigo
    on conflict(tenant_id,codigo) do nothing;
  insert into public.identity_rol_permisos(tenant_id,rol_id,permiso)
    select p_tenant,r.id,p.codigo from public.identity_roles r cross join public.identity_permisos p
    where r.tenant_id=p_tenant and (
      (r.codigo='ADMIN_EMPRESA' and p.codigo in ('company.manage','reports.view'))
      or (r.codigo='GESTOR' and p.codigo in ('campaign.manage','workforce.manage','harvest.view','reports.view'))
      or (r.codigo='OPERADOR_CAMPO' and p.codigo in ('harvest.operate','harvest.view'))
      or (r.codigo='CONSULTA' and p.codigo in ('harvest.view','reports.view'))
    ) on conflict do nothing;
end $$;

-- CREATE OR REPLACE conserva las ACL existentes del seeder.
do $$ begin perform public.iam_sembrar_roles(id) from public.tenants; end $$;
notify pgrst, 'reload schema';
commit;
