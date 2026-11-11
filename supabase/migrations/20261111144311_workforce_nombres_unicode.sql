begin;
-- Validate at the shared write boundary, including admin edits and imports.
-- Never guess a replacement: reject damaged input so the original can be used.
create function public.workforce_validar_nombres_unicode()
returns trigger language plpgsql security invoker set search_path='' as $$
declare valor text;
begin
 foreach valor in array array[new.nombres,new.apellidos] loop
  if valor ~ U&'[\FFFD\0080-\009F]'
   or valor ~ U&'[\00C2\00C3\00E3][\0080-\00BF\0152\0153\0160\0161\0178\017D\017E\0192\02C6\02DC\2013-\2026\2030\2039\203A\20AC\2122]' then
   raise exception using errcode='22021',
    message='El nombre o apellido contiene caracteres mal codificados. Vuelve a escribirlo o importa el archivo con UTF-8.';
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.workforce_validar_nombres_unicode() from public,anon,authenticated,service_role;
create trigger workforce_nombres_unicode
before insert or update of nombres,apellidos on public.trabajadores
for each row execute function public.workforce_validar_nombres_unicode();
commit;
