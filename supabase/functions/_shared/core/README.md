# @gesgrow/core

Reglas y contratos compartidos de GesGROW, mantenidos en GG-backend.
Incluye las APIs de contextos, puertos de backend y el selector visual compartido.
No contiene credenciales, SDK del proveedor ni persistencia de las aplicaciones.

Las Edge Functions importan el código local de este directorio. Node y Vite consumen
el artefacto npm versionado incluido en vendor/ de cada repositorio.
Las aplicaciones sólo importan las APIs públicas contexts/<contexto>/index.js;
los archivos internos también están disponibles para las pruebas arquitectónicas.

Para publicar una nueva entrega interna: subir la versión de package.json, ejecutar
npm run pack:core desde GG-backend y distribuir el mismo .tgz a cada consumidor.
Cada consumidor actualiza su dependencia y package-lock.json deliberadamente.
No requiere un registro npm ni clonar otro repositorio para npm ci.
