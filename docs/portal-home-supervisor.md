# Home del supervisor de Cosecha

Implementado a partir de los dos PNG aportados por el usuario: estado inicial y resumen con campaña. Reutiliza la bienvenida, fecha y saludo en Lima, cuenta, recursos gráficos y tarjetas del Home. El nombre y las métricas proceden de la cuenta y las consultas reales.

## Presentación y permisos

Los usuarios del módulo sin `company.manage` utilizan la variante de Home sin selector de módulos. Con HARVEST habilitado y `reports.view` consultan el resumen de Cosecha. El owner conserva su selector y la administración de la organización. Los permisos siguen verificándose en Application y servidor; el cambio de presentación no concede contratación ni gestión de cuentas.

Sin campañas autorizadas, el resumen muestra «Agrega un cultivo para comenzar con la cosecha», con los tres iconos proporcionados por el usuario. Una lista vacía de campañas es la señal disponible en el contrato actual: no se deduce un inventario privado de cultivos a partir del catálogo global. Una campaña con producción cero conserva sus tarjetas y ceros; los errores de consulta no se presentan como un inicio sin datos. El alta de cultivos/campañas pertenece a la sección del módulo, fuera de esta entrega de Home.

Con campañas se reutilizan producción, primer puesto, lista de campañas y las cinco métricas. La campaña seleccionada permanece en la URL; cambiarla actualiza las tres consultas y mantiene el foco. Una campaña ajena no dispara consultas de métricas. Los enlaces de producción diaria y ranking respetan la disponibilidad global de reportes existente.

Sin contratación o permiso de resumen se presenta el estado correspondiente, sin ofrecer compras al supervisor. La revocación del módulo retira sus datos. El cambio de empresa desmonta la vista anterior y descarta respuestas tardías.

La navegación compartida continúa mostrando sólo opciones autorizadas. El icono de Configuración del PNG no se habilita para el supervisor: Usuarios y accesos sigue requiriendo `company.manage` y no forma parte de este cambio.

## Recursos y geometría

Sin producción se elimina el aviso bajo los ceros y Top cosechador muestra
«Nadie ha cosechado aún» en una franja `#829896`, sin icono ni borde punteado.
Jaberos cuenta personas distintas de las sesiones asociadas a producción admitida
de la campaña; no sesiones ni lecturas. Devuelve 0 cuando no existen registros,
conserva el historial aunque luego cambie el estado de la persona y mantiene los
totales de producción existentes. La proyección privada se amplió con
`20261022232855_harvest_resumen_jaberos.sql`, aplicada y verificada en Quijas-SCC.

`portal/src/assets/supervisor/{module,arrow,harvest}.svg` conserva los trazados proporcionados. Los recursos tienen tamaño intrínseco 100 × 100, color `#829896` y trazo efectivo de 6 px. `vector-effect="non-scaling-stroke"` mantiene ese grosor al utilizar los trazados de viewBox 24 dentro del recurso de 100 px. La adaptación usa wrappers y transformaciones; no modifica las dimensiones de los SVG desde CSS.

En escritorio de 1920 px, el estado inicial ocupa x=288, y=619, 1403 × 376. Con datos, las tarjetas empiezan en y=619 y la franja de métricas en y=990. El espacio que ocupaba el selector del owner se elimina para el supervisor.

## Validación

Pruebas de Home sin campañas, datos reales, producción cero, actualización tras aparecer una campaña, cambio de campaña y foco, campaña ajena, fallo de red, ausencia de contratación o permiso, revocación y respuestas tardías al cambiar de empresa. También se ejecutaron las regresiones de Home del owner y reportes.

Ambos estados se revisaron en navegador en 1920, 1440, 1024, 768, 390 y 320 px, sin desbordamiento horizontal. Se verificaron recursos locales completos y geometría de los iconos. No se necesitan nuevas migraciones ni endpoints.

Fixtures: `/tests/visual.html?single&supervisor-home&no-campaigns` y `/tests/visual.html?single&supervisor-home`.
