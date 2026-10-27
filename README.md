# GesGROW · Backend

Migraciones, RPC, Edge Functions y pruebas de servidor para Portal y PWA de Cosecha.
Incluye la integración de compatibilidad con Google Sheets en apps-script/.

## Instalar y validar

Requiere Node.js 24 y npm. Las pruebas usan PostgreSQL embebido PGlite; no necesitan
credenciales ni conectarse al proyecto remoto.

```sh
npm ci
npm test
npm run verify:core
npm run verify:demo
```

Las migraciones y sus nombres se conservan. Un historial Git nuevo no significa
reiniciar la base de datos. No ejecutar scripts de limpieza sobre un proyecto ya
poblado ni reaplicar todas las migraciones sin contrastar el historial remoto.
Los procedimientos manuales de soporte están separados de las migraciones.

## Vinculación de PDA

El [contrato de vinculación](docs/pda-vinculacion-api.md) documenta los RPC para
generar QR, vincular y revocar dispositivos, y registrar operaciones autenticadas.
El acceso obligatorio se activa por empresa después de integrar los clientes;
la migración mantiene inicialmente la compatibilidad con los PDA existentes.

## Edge Functions

Ejecutar Supabase CLI desde la raíz de este repositorio. invitar-usuario y sus
importaciones locales se encuentran íntegramente bajo supabase/functions/.
La función valida la sesión en el servidor antes de aprovisionar; sus secretos
se configuran en Supabase, nunca se guardan en Git. PORTAL_ORIGIN debe corresponder
al origen del Portal y coincidir con los destinos admitidos de Auth.
La separación de código no cambia el proyecto remoto ni despliega funciones.

## Fuente canónica de @gesgrow/core

Se mantiene en supabase/functions/_shared/core/. Los frontends y las pruebas de Node
consumen un .tgz versionado incluido en vendor/. Las Edge Functions usan directamente
la misma fuente, sin importar archivos externos al repositorio.

Para distribuir una nueva entrega:

1. Modificar la fuente y subir su versión en package.json.
2. Ejecutar npm run pack:core (o pasar directorios destino explícitos).
3. Copiar el mismo artefacto a vendor/ de cada consumidor.
4. Actualizar la dependencia file: y package-lock.json con npm install.
5. Ejecutar las pruebas y compilaciones de los consumidores antes de publicar.

pack:core rechaza sobrescribir una versión con contenido distinto. verify:core
comprueba que el paquete instalado coincide archivo por archivo con la fuente
canónica que usarán las Edge Functions. No se necesita un cuarto repositorio ni
credenciales de un registro de paquetes para instalar.

## Pruebas de compatibilidad

El único artefacto de cliente es @gesgrow/harvest-client-contracts en devDependencies,
una instantánea versionada de GG-app-m-harvest. Permite probar adapters e IndexedDB
contra SQL sin importar carpetas de otro checkout. No forma parte del despliegue.
Los informes de docs/ conservan el contexto histórico; algunas rutas corresponden
a la antigua estructura SCC.

## Proyectos

- Portal: https://github.com/GesGROW/GG-portal
- Backend: https://github.com/GesGROW/GG-backend
- PWA Cosecha: https://github.com/GesGROW/GG-app-m-harvest

La migración a esta organización conserva el código y las migraciones; este
repositorio comienza con un historial Git inicial nuevo.
