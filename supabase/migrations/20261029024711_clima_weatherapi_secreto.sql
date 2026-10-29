begin;

-- El proveedor sólo puede obtenerse desde el servidor, nunca desde el Portal.
create schema if not exists clima_privado;
revoke all on schema clima_privado from public, anon, authenticated;
grant usage on schema clima_privado to service_role;

create or replace function clima_privado.weatherapi_clave()
returns text language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'WEATHERAPI_KEY'
$$;
revoke all on function clima_privado.weatherapi_clave() from public, anon, authenticated;
grant execute on function clima_privado.weatherapi_clave() to service_role;

create or replace function public.clima_weatherapi_clave()
returns text language sql stable security invoker set search_path = ''
as $$ select clima_privado.weatherapi_clave() $$;
revoke all on function public.clima_weatherapi_clave() from public, anon, authenticated;
grant execute on function public.clima_weatherapi_clave() to service_role;

notify pgrst, 'reload schema';
commit;
