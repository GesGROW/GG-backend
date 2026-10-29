# Clima del Home con ubicación opcional

El Portal solicita la ubicación del dispositivo mediante el permiso del navegador.
Si se rechaza, no existe geolocalización o hay un error de red/proveedor, conserva
el icono del clima sin presentar una alerta ni afectar la sesión del Portal.
La ubicación es la del dispositivo que abre el Home, no una ubicación fija del fundo.
Si el permiso está concedido y la geolocalización falla o no responde, el Portal
solicita ubicación aproximada. El servidor usa la primera IP de `x-forwarded-for`
del proxy de Supabase para consultar WeatherAPI y marca el resultado como
`ubicacionAproximada`. No acepta una IP en el cuerpo ni la devuelve al navegador.
Esta alternativa no se usa cuando el permiso está rechazado o sigue pendiente.

## Datos

La Edge Function `clima` consulta `forecast.json`, dos días, `lang=es`, sin alertas
ni calidad del aire. Devuelve únicamente localidad, temperatura en °C, condición e
icono, humedad, viento en km/h, probabilidad de lluvia y última actualización.
Para la lluvia toma el máximo horario disponible de las próximas tres horas,
incluida la hora en curso y el cruce de medianoche. Un campo ausente se conserva
como no disponible; nunca se transforma en un cero inventado.

Documentación: https://www.weatherapi.com/docs/forecast-api/

## Clave y autorización

La clave no se incluye en React, archivos versionados ni respuestas HTTP. La
función utiliza `WEATHERAPI_KEY` del entorno cuando existe y, en Quijas-SCC,
el secreto cifrado con ese nombre en Supabase Vault. Su rotación se realiza
desde Vault sin modificar ni publicar el Portal.

Migración: `20261029024711_clima_weatherapi_secreto.sql`. La lectura privilegiada
vive en `clima_privado`, fuera del esquema expuesto. El RPC público es invocador
y sólo tiene `EXECUTE` para `service_role`; `anon` y `authenticated` no pueden
obtener la clave ni llamar al lector privado.

La Edge Function tiene `verify_jwt=false` porque comprueba expresamente el token
de usuario con `auth.getUser()` antes de procesar coordenadas o consultar al
proveedor. Sin sesión válida devuelve 401. Acepta coordenadas numéricas válidas
o exclusivamente `{ "ubicacionAproximada": true }` y el método POST;
CORS permite el Portal publicado y los orígenes locales
indicados en `index.ts`, además de `PORTAL_ORIGIN` si está configurado.

## Privacidad, caché y fallos

- Las coordenadas se redondean a dos decimales antes de enviarse al servidor.
- No se guardan coordenadas ni clima en tablas o almacenamiento persistente del navegador.
- Caché en memoria de 15 minutos en cliente y proveedor; consultas simultáneas
  de una misma celda comparten petición. La caché del servidor está limitada a 512 celdas.
- El límite de solicitudes por usuario es 20 cada 15 minutos por instancia de
  la función. Es un límite local al proceso, no una cuota global persistente.
- La pantalla no espera al clima para cargar; la ubicación tiene un timeout
  de 8 segundos y un límite independiente de 12 segundos cuando el navegador
  no responde a sus callbacks. No solicita GPS de alta precisión.
- La IP aproximada sólo se usa para la consulta meteorológica y su caché temporal;
  nunca determina la autorización ni el límite de solicitudes por usuario.
- Revocar el permiso borra inmediatamente el clima y descarta respuestas en curso.
- Los fallos no exponen mensajes internos, claves ni direcciones del proveedor.

Vault: https://supabase.com/docs/guides/database/vault
Geolocalización: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition

## Validación

Probados el proveedor real con la clave configurada, los filtros del resumen,
la caché, la autorización HTTP y los permisos SQL de los tres roles. La función
publicada rechaza solicitudes sin sesión/inválidas y responde al preflight del
Portal. En navegador se probaron permiso concedido, revocado y denegado al abrir,
con datos reales consultados desde un servidor local de pruebas; la sesión de
ese fixture es simulada. Se revisaron los tres degradados y el diseño móvil.
Los asesores de seguridad mantienen los mismos hallazgos anteriores al cambio.

También se comprobó la sesión local real en `localhost:5174`: permiso concedido,
Geolocation sin callbacks, salida por el límite independiente, consulta aproximada
a la función desplegada y datos mostrados por el widget. Se retiró después la
instrumentación temporal de diagnóstico. Hay pruebas de regresión para este
caso, el rechazo del permiso y la identificación visual de ubicación aproximada.
