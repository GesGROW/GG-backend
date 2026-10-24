# Colores del portal GesGROW

Inventario del código del portal al 19 de octubre de 2026. Incluye colores declarados en CSS, JavaScript/JSX y SVG; las fotografías y PNG no se descomponen en colores de píxel.

La paleta base vive en `tokens.css`. El marco actual también usa variables `--home-*`, y algunas pantallas y recursos SVG contienen colores directos. Una definición puede existir en la paleta sin usarse directamente en un componente.

## Referencia visual principal

| Uso | Oscuro | Claro | Fuente |
| --- | --- | --- | --- |
| Fondo general | `#090F0B` | `#F5F8F1` | `--home-canvas` |
| Campos, filtros y tarjetas de resumen de Trabajadores | `#0C1310` | `#FFFFFF` | `--home-shell` |
| Navegación lateral | `#0C1310` | `#EAF0DA` | `--sidebar-bg` |
| Bordes del marco y tarjetas | `#141C18` | `#D0D9CA` | `--home-border` |
| Bordes de campos | `#141C18` | `#7B8B7C` | `--portal-control-border` en tema claro |
| Tarjetas destacadas del inicio y suscripción | `#1A1F0D` | `#FFFFFF` | `--home-card` |
| Texto principal del marco | `#FFFFFF` | `#15271B` | `--home-text` |
| Texto secundario y última actualización | `#BEE6D7` | `#405C47` | `--home-muted` |
| Enlaces e iconos de resumen | `#26CE5F` | `#166D37` | `--home-link` |
| Dorado de acento | `#F0D58A` | `#806018` | `--home-gold` |
| Acento del inicio, invitación y acciones de suscripción | `#B1B617` | `#26734A` | `--home-winner` |
| Cabecera de tablas de Cosecha y Usuarios | `#777B19` | `#EEF3F0` | `--records-head` / `--users-table-head` |
| Líneas de tablas | `#303030` | `#D0D9CA` | `--records-border` / `--users-table-border` |
| Texto del cuerpo de las tablas | `#E2E2E2` | `#15271B` | `--records-table-text` / `--users-table-text` |
| Registrar trabajador (botón ancho) | `#102A1D` | `#26734A` | `--green-950` en oscuro; `--color-brand-primary` en claro |
| Botones generales de acción principal | `#56B77A` | `#26734A` | `--color-brand-primary` |
| Botón general al pasar el cursor | `#6AC68B` | `#1F5A3A` | `--color-brand-primary-hover` |
| Botón general presionado | `#83D19D` | `#173F2B` | `--color-brand-primary-pressed` |

En oscuro, las pestañas superiores usan SVG con `#777B19`, borde `#141C18` y texto blanco; las variantes inactivas aplican opacidad. En claro, esos fondos SVG se ocultan y la cápsula activa usa `#E8F4EC` con texto y borde `#166D37`; las inactivas usan blanco y texto `#405C47`.

La hoja `portal/src/presentation/light-theme.css` contiene las reglas que prevalecen en el tema claro. Añade sombras `0 2px 8px rgb(21 39 27 / 4%)` en tarjetas y `0 8px 24px rgb(21 39 27 / 10%)` en el panel lateral de edición, foco de 3 px en `#166D37` y cabeceras sin cursiva con texto `#15271B`. El inventario detallado que sigue conserva las declaraciones originales: los valores efectivos del tema claro son los de esta tabla y esa hoja compartida.

## Todas las variables de color y sus definiciones

El ámbito identifica el selector donde se declara la variable; consulta el enlace para revisar también las condiciones de pantalla. Los valores `var(...)`, `color-mix(...)` y gradientes se conservan para no confundir colores calculados con colores fijos.

| Variable | Valor declarado | ámbito | Archivo |
| --- | --- | --- | --- |
| `--records-border` | `#303030` | `.records-layout` | [harvest-records.css:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:3) |
| `--records-head` | `#777b19` | `.records-layout` | [harvest-records.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:4) |
| `--records-table-text` | `#e2e2e2` | `.records-layout` | [harvest-records.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:5) |
| `--records-border` | `#d0d9ca` | `[data-theme='light'] .records-layout` | [harvest-records.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:8) |
| `--records-head` | `#6a7116` | `[data-theme='light'] .records-layout` | [harvest-records.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:9) |
| `--records-table-text` | `#15271b` | `[data-theme='light'] .records-layout` | [harvest-records.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:10) |
| `--ticket-track` | `rgb(66 68 22 / 20%)` | `.harvest-tickets-page` | [harvest-tickets.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:5) |
| `--ticket-active` | `rgb(66 68 22 / 30%)` | `.harvest-tickets-page` | [harvest-tickets.css:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:6) |
| `--ticket-step` | `#294137` | `.harvest-tickets-page` | [harvest-tickets.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:7) |
| `--ticket-step-complete` | `#326227` | `.harvest-tickets-page` | [harvest-tickets.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:8) |
| `--ticket-status` | `#102a1d` | `.harvest-tickets-page` | [harvest-tickets.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:9) |
| `--ticket-track` | `#edf0dc` | `[data-theme='light'] .harvest-tickets-page` | [harvest-tickets.css:546](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:546) |
| `--ticket-active` | `#dfe3ad` | `[data-theme='light'] .harvest-tickets-page` | [harvest-tickets.css:547](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:547) |
| `--ticket-step` | `#d5e5db` | `[data-theme='light'] .harvest-tickets-page` | [harvest-tickets.css:548](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:548) |
| `--ticket-status` | `#dfede4` | `[data-theme='light'] .harvest-tickets-page` | [harvest-tickets.css:549](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:549) |
| `--home-canvas` | `#090f0b` | `.portal-shell` | [home.css:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:3) |
| `--home-shell` | `#0c1310` | `.portal-shell` | [home.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:4) |
| `--home-border` | `#141c18` | `.portal-shell` | [home.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:5) |
| `--home-card` | `#1a1f0d` | `.portal-shell` | [home.css:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:6) |
| `--home-text` | `#fff` | `.portal-shell` | [home.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:7) |
| `--home-muted` | `#bee6d7` | `.portal-shell` | [home.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:8) |
| `--home-link` | `#26ce5f` | `.portal-shell` | [home.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:9) |
| `--home-gold` | `#f0d58a` | `.portal-shell` | [home.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:10) |
| `--home-winner` | `#b1b617` | `.portal-shell` | [home.css:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:11) |
| `--home-canvas` | `#f5f8f1` | `[data-theme='light'] .portal-shell` | [home.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:20) |
| `--home-shell` | `#fff` | `[data-theme='light'] .portal-shell` | [home.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:21) |
| `--home-border` | `#e0e8db` | `[data-theme='light'] .portal-shell` | [home.css:22](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:22) |
| `--home-card` | `#eaf0da` | `[data-theme='light'] .portal-shell` | [home.css:23](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:23) |
| `--home-text` | `#15271b` | `[data-theme='light'] .portal-shell` | [home.css:24](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:24) |
| `--home-muted` | `#405c47` | `[data-theme='light'] .portal-shell` | [home.css:25](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:25) |
| `--home-link` | `#166d37` | `[data-theme='light'] .portal-shell` | [home.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:26) |
| `--home-gold` | `#806018` | `[data-theme='light'] .portal-shell` | [home.css:27](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:27) |
| `--home-winner` | `#c1c945` | `[data-theme='light'] .portal-shell` | [home.css:28](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:28) |
| `--series-color` | `var(--chart-1)` | `.series-1` | [redesign.css:718](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:718) |
| `--series-stroke` | `var(--chart-1-stroke)` | `.series-1` | [redesign.css:719](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:719) |
| `--series-color` | `var(--chart-2)` | `.series-2` | [redesign.css:722](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:722) |
| `--series-stroke` | `var(--chart-2-stroke)` | `.series-2` | [redesign.css:723](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:723) |
| `--series-color` | `var(--chart-3)` | `.series-3` | [redesign.css:726](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:726) |
| `--series-stroke` | `var(--chart-3-stroke)` | `.series-3` | [redesign.css:727](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:727) |
| `--series-color` | `var(--chart-4)` | `.series-4` | [redesign.css:730](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:730) |
| `--series-stroke` | `var(--chart-4-stroke)` | `.series-4` | [redesign.css:731](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:731) |
| `--series-color` | `var(--chart-5)` | `.series-5` | [redesign.css:734](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:734) |
| `--series-stroke` | `var(--chart-5-stroke)` | `.series-5` | [redesign.css:735](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:735) |
| `--series-color` | `var(--chart-6)` | `.series-6` | [redesign.css:738](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:738) |
| `--series-stroke` | `var(--chart-6-stroke)` | `.series-6` | [redesign.css:739](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:739) |
| `--sidebar-bg` | `#0c1310` | `.figma-navigation` | [sidebar.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:7) |
| `--sidebar-border` | `#141c18` | `.figma-navigation` | [sidebar.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:8) |
| `--sidebar-selected` | `rgb(66 68 22 / 30%)` | `.figma-navigation` | [sidebar.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:9) |
| `--sidebar-text` | `#fff` | `.figma-navigation` | [sidebar.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:10) |
| `--sidebar-heading` | `rgb(255 255 255 / 76%)` | `.figma-navigation` | [sidebar.css:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:11) |
| `--sidebar-bg` | `#fff` | `[data-theme='light'] .figma-navigation` | [sidebar.css:15](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:15) |
| `--sidebar-border` | `#e0e8db` | `[data-theme='light'] .figma-navigation` | [sidebar.css:16](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:16) |
| `--sidebar-selected` | `#eaf0da` | `[data-theme='light'] .figma-navigation` | [sidebar.css:17](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:17) |
| `--sidebar-text` | `#15271b` | `[data-theme='light'] .figma-navigation` | [sidebar.css:18](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:18) |
| `--sidebar-heading` | `#405c47` | `[data-theme='light'] .figma-navigation` | [sidebar.css:19](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:19) |
| `--green` | `var(--color-brand-primary)` | `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | [styles.css:19](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:19) |
| `--border` | `var(--color-border-subtle)` | `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | [styles.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:20) |
| `--muted` | `var(--color-text-secondary)` | `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | [styles.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:21) |
| `--green-950` | `#102a1d` | `:root` | [tokens.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:4) |
| `--green-900` | `#173f2b` | `:root` | [tokens.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:5) |
| `--green-800` | `#1f5a3a` | `:root` | [tokens.css:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:6) |
| `--green-700` | `#26734a` | `:root` | [tokens.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:7) |
| `--green-600` | `#2f8a57` | `:root` | [tokens.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:8) |
| `--green-500` | `#3a9c66` | `:root` | [tokens.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:9) |
| `--green-400` | `#68b286` | `:root` | [tokens.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:10) |
| `--green-300` | `#9ccdaf` | `:root` | [tokens.css:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:11) |
| `--green-200` | `#cfe6d7` | `:root` | [tokens.css:12](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:12) |
| `--green-100` | `#e8f4ec` | `:root` | [tokens.css:13](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:13) |
| `--green-050` | `#f4faf6` | `:root` | [tokens.css:14](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:14) |
| `--harvest-700` | `#8d6a1f` | `:root` | [tokens.css:16](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:16) |
| `--harvest-600` | `#a67c22` | `:root` | [tokens.css:17](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:17) |
| `--harvest-500` | `#c69a2d` | `:root` | [tokens.css:18](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:18) |
| `--harvest-400` | `#ddb557` | `:root` | [tokens.css:19](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:19) |
| `--harvest-300` | `#e7c97d` | `:root` | [tokens.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:20) |
| `--harvest-200` | `#f1deb0` | `:root` | [tokens.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:21) |
| `--harvest-100` | `#f8f0d8` | `:root` | [tokens.css:22](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:22) |
| `--yellow-900` | `var(--harvest-700)` | `:root` | [tokens.css:23](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:23) |
| `--yellow-800` | `var(--harvest-700)` | `:root` | [tokens.css:24](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:24) |
| `--yellow-700` | `var(--harvest-700)` | `:root` | [tokens.css:25](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:25) |
| `--yellow-600` | `var(--harvest-600)` | `:root` | [tokens.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:26) |
| `--yellow-500` | `var(--harvest-500)` | `:root` | [tokens.css:27](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:27) |
| `--yellow-400` | `var(--harvest-400)` | `:root` | [tokens.css:28](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:28) |
| `--yellow-300` | `var(--harvest-300)` | `:root` | [tokens.css:29](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:29) |
| `--yellow-200` | `var(--harvest-200)` | `:root` | [tokens.css:30](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:30) |
| `--yellow-100` | `var(--harvest-100)` | `:root` | [tokens.css:31](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:31) |
| `--yellow-050` | `var(--harvest-100)` | `:root` | [tokens.css:32](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:32) |
| `--aqua-900` | `#0c5557` | `:root` | [tokens.css:33](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:33) |
| `--aqua-800` | `#12696b` | `:root` | [tokens.css:34](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:34) |
| `--aqua-700` | `#177f81` | `:root` | [tokens.css:35](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:35) |
| `--aqua-600` | `#239698` | `:root` | [tokens.css:36](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:36) |
| `--aqua-500` | `#2fafb0` | `:root` | [tokens.css:37](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:37) |
| `--aqua-400` | `#52c0c0` | `:root` | [tokens.css:38](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:38) |
| `--aqua-300` | `#76cfce` | `:root` | [tokens.css:39](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:39) |
| `--aqua-200` | `#afe5e2` | `:root` | [tokens.css:40](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:40) |
| `--aqua-100` | `#ddf5f3` | `:root` | [tokens.css:41](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:41) |
| `--aqua-050` | `#f0fbfa` | `:root` | [tokens.css:42](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:42) |
| `--sky-900` | `#263f5d` | `:root` | [tokens.css:43](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:43) |
| `--sky-800` | `#2f4e72` | `:root` | [tokens.css:44](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:44) |
| `--sky-700` | `#365f8a` | `:root` | [tokens.css:45](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:45) |
| `--sky-600` | `#426d9a` | `:root` | [tokens.css:46](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:46) |
| `--sky-500` | `#4f7cac` | `:root` | [tokens.css:47](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:47) |
| `--sky-400` | `#6e93bc` | `:root` | [tokens.css:48](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:48) |
| `--sky-300` | `#8caed1` | `:root` | [tokens.css:49](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:49) |
| `--sky-200` | `#bcd0e5` | `:root` | [tokens.css:50](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:50) |
| `--sky-100` | `#e5eff8` | `:root` | [tokens.css:51](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:51) |
| `--sky-050` | `#f4f8fc` | `:root` | [tokens.css:52](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:52) |
| `--soil-900` | `#65311f` | `:root` | [tokens.css:53](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:53) |
| `--soil-800` | `#7d3d27` | `:root` | [tokens.css:54](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:54) |
| `--soil-700` | `#974a2e` | `:root` | [tokens.css:55](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:55) |
| `--soil-600` | `#af5b38` | `:root` | [tokens.css:56](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:56) |
| `--soil-500` | `#c96f45` | `:root` | [tokens.css:57](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:57) |
| `--soil-400` | `#d98965` | `:root` | [tokens.css:58](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:58) |
| `--soil-300` | `#e3a083` | `:root` | [tokens.css:59](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:59) |
| `--soil-200` | `#efc5b2` | `:root` | [tokens.css:60](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:60) |
| `--soil-100` | `#f8e9e2` | `:root` | [tokens.css:61](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:61) |
| `--soil-050` | `#fcf5f1` | `:root` | [tokens.css:62](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:62) |
| `--berry-900` | `#3b316b` | `:root` | [tokens.css:63](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:63) |
| `--berry-800` | `#493d82` | `:root` | [tokens.css:64](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:64) |
| `--berry-700` | `#57499b` | `:root` | [tokens.css:65](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:65) |
| `--berry-600` | `#6657b1` | `:root` | [tokens.css:66](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:66) |
| `--berry-500` | `#7767c7` | `:root` | [tokens.css:67](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:67) |
| `--berry-400` | `#9184d4` | `:root` | [tokens.css:68](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:68) |
| `--berry-300` | `#aaa0de` | `:root` | [tokens.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:69) |
| `--berry-200` | `#cfc8ec` | `:root` | [tokens.css:70](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:70) |
| `--berry-100` | `#eeebfa` | `:root` | [tokens.css:71](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:71) |
| `--berry-050` | `#f7f5fd` | `:root` | [tokens.css:72](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:72) |
| `--red-900` | `#6e211a` | `:root` | [tokens.css:73](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:73) |
| `--red-800` | `#842820` | `:root` | [tokens.css:74](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:74) |
| `--red-700` | `#9d3128` | `:root` | [tokens.css:75](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:75) |
| `--red-600` | `#b63930` | `:root` | [tokens.css:76](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:76) |
| `--red-500` | `#c4473a` | `:root` | [tokens.css:77](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:77) |
| `--red-400` | `#d66b61` | `:root` | [tokens.css:78](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:78) |
| `--red-300` | `#e6938b` | `:root` | [tokens.css:79](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:79) |
| `--red-200` | `#f2c1bc` | `:root` | [tokens.css:80](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:80) |
| `--red-100` | `#fbe9e7` | `:root` | [tokens.css:81](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:81) |
| `--red-050` | `#fef5f4` | `:root` | [tokens.css:82](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:82) |
| `--neutral-950` | `#17201a` | `:root` | [tokens.css:83](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:83) |
| `--neutral-900` | `#1f2a23` | `:root` | [tokens.css:84](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:84) |
| `--neutral-800` | `#2d3932` | `:root` | [tokens.css:85](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:85) |
| `--neutral-700` | `#46534b` | `:root` | [tokens.css:86](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:86) |
| `--neutral-600` | `#5d6a62` | `:root` | [tokens.css:87](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:87) |
| `--neutral-500` | `#748078` | `:root` | [tokens.css:88](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:88) |
| `--neutral-400` | `#99a39d` | `:root` | [tokens.css:89](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:89) |
| `--neutral-300` | `#bcc5bf` | `:root` | [tokens.css:90](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:90) |
| `--neutral-250` | `var(--neutral-200)` | `:root` | [tokens.css:91](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:91) |
| `--neutral-200` | `#dce4df` | `:root` | [tokens.css:92](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:92) |
| `--neutral-150` | `#e6ece8` | `:root` | [tokens.css:93](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:93) |
| `--neutral-100` | `#eef3f0` | `:root` | [tokens.css:94](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:94) |
| `--neutral-075` | `#f4f6f4` | `:root` | [tokens.css:95](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:95) |
| `--neutral-050` | `#f8faf8` | `:root` | [tokens.css:96](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:96) |
| `--white` | `#ffffff` | `:root` | [tokens.css:97](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:97) |
| `--dark-950` | `#090f0b` | `:root` | [tokens.css:98](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:98) |
| `--dark-900` | `#0d1410` | `:root` | [tokens.css:99](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:99) |
| `--dark-850` | `#101812` | `:root` | [tokens.css:100](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:100) |
| `--dark-800` | `#121a15` | `:root` | [tokens.css:101](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:101) |
| `--dark-750` | `#18221c` | `:root` | [tokens.css:102](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:102) |
| `--dark-700` | `#1e2a22` | `:root` | [tokens.css:103](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:103) |
| `--dark-600` | `#26332b` | `:root` | [tokens.css:104](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:104) |
| `--dark-500` | `#4b5a51` | `:root` | [tokens.css:105](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:105) |
| `--dark-400` | `#78867e` | `:root` | [tokens.css:106](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:106) |
| `--dark-300` | `#aab7af` | `:root` | [tokens.css:107](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:107) |
| `--dark-200` | `#cbd5cf` | `:root` | [tokens.css:108](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:108) |
| `--dark-100` | `#e2e9e5` | `:root` | [tokens.css:109](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:109) |
| `--dark-050` | `#f2f6f3` | `:root` | [tokens.css:110](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:110) |
| `--shadow-xs` | `0 1px 3px rgba(21, 32, 25, 0.04)` | `:root` | [tokens.css:165](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:165) |
| `--shadow-sm` | `0 3px 10px rgba(21, 32, 25, 0.06)` | `:root` | [tokens.css:166](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:166) |
| `--shadow-md` | `0 4px 14px rgba(21, 32, 25, 0.08)` | `:root` | [tokens.css:167](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:167) |
| `--shadow-lg` | `0 10px 28px rgba(21, 32, 25, 0.12)` | `:root` | [tokens.css:168](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:168) |
| `--shadow-xl` | `0 18px 48px rgba(21, 32, 25, 0.16)` | `:root` | [tokens.css:169](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:169) |
| `--focus-ring-color` | `var(--color-border-focus)` | `:root` | [tokens.css:200](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:200) |
| `--gradient-weather-light` | `linear-gradient(     135deg,     #bde6d4 0%,     #42bfc0 52%,     #f4e5b7 100%   )` | `:root` | [tokens.css:225](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:225) |
| `--gradient-weather-dark` | `linear-gradient(     135deg,     #17443d 0%,     #1f7375 55%,     #6a5b27 100%   )` | `:root` | [tokens.css:231](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:231) |
| `--gradient-brand-editorial` | `linear-gradient(     160deg,     var(--green-950) 10%,     transparent 160%   )` | `:root` | [tokens.css:237](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:237) |
| `--gradient-brand-overlay` | `linear-gradient(     90deg,     var(--green-950) 10%,     transparent 170%   )` | `:root` | [tokens.css:242](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:242) |
| `--chart-1-dark` | `#69bb88` | `:root` | [tokens.css:247](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:247) |
| `--chart-2-dark` | `var(--aqua-400)` | `:root` | [tokens.css:248](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:248) |
| `--chart-3-dark` | `var(--harvest-400)` | `:root` | [tokens.css:249](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:249) |
| `--chart-4-dark` | `var(--soil-400)` | `:root` | [tokens.css:250](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:250) |
| `--chart-5-dark` | `var(--berry-400)` | `:root` | [tokens.css:251](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:251) |
| `--chart-6-dark` | `var(--sky-400)` | `:root` | [tokens.css:252](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:252) |
| `--chart-primary` | `var(--chart-1)` | `:root` | [tokens.css:254](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:254) |
| `--chart-secondary` | `var(--chart-2)` | `:root` | [tokens.css:255](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:255) |
| `--chart-recent` | `var(--chart-3)` | `:root` | [tokens.css:256](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:256) |
| `--chart-recent-stroke` | `var(--chart-3-stroke)` | `:root` | [tokens.css:257](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:257) |
| `--chart-error` | `var(--error-fg)` | `:root` | [tokens.css:258](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:258) |
| `--chart-info` | `var(--color-accent-sky)` | `:root` | [tokens.css:259](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:259) |
| `--color-context-available-bg` | `var(--color-accent-aqua-soft)` | `:root` | [tokens.css:260](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:260) |
| `--color-context-available-fg` | `var(--color-accent-aqua-strong)` | `:root` | [tokens.css:261](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:261) |
| `--color-context-available-border` | `var(--color-accent-aqua-border)` | `:root` | [tokens.css:262](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:262) |
| `--color-brand-primary` | `var(--green-700)` | `:root, [data-theme='light']` | [tokens.css:266](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:266) |
| `--color-brand-primary-hover` | `var(--green-800)` | `:root, [data-theme='light']` | [tokens.css:267](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:267) |
| `--color-brand-primary-pressed` | `var(--green-900)` | `:root, [data-theme='light']` | [tokens.css:268](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:268) |
| `--color-brand-soft` | `var(--green-100)` | `:root, [data-theme='light']` | [tokens.css:269](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:269) |
| `--color-brand-softer` | `var(--green-050)` | `:root, [data-theme='light']` | [tokens.css:270](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:270) |
| `--color-accent-harvest` | `var(--harvest-500)` | `:root, [data-theme='light']` | [tokens.css:272](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:272) |
| `--color-accent-harvest-strong` | `var(--harvest-700)` | `:root, [data-theme='light']` | [tokens.css:273](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:273) |
| `--color-accent-harvest-soft` | `var(--harvest-100)` | `:root, [data-theme='light']` | [tokens.css:274](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:274) |
| `--color-accent-harvest-border` | `var(--harvest-300)` | `:root, [data-theme='light']` | [tokens.css:275](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:275) |
| `--color-accent-harvest-text` | `#7a5a16` | `:root, [data-theme='light']` | [tokens.css:276](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:276) |
| `--color-accent-aqua` | `var(--aqua-500)` | `:root, [data-theme='light']` | [tokens.css:277](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:277) |
| `--color-accent-aqua-strong` | `var(--aqua-800)` | `:root, [data-theme='light']` | [tokens.css:278](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:278) |
| `--color-accent-aqua-soft` | `var(--aqua-100)` | `:root, [data-theme='light']` | [tokens.css:279](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:279) |
| `--color-accent-aqua-border` | `var(--aqua-200)` | `:root, [data-theme='light']` | [tokens.css:280](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:280) |
| `--color-accent-sky` | `var(--sky-500)` | `:root, [data-theme='light']` | [tokens.css:281](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:281) |
| `--color-accent-soil` | `var(--soil-500)` | `:root, [data-theme='light']` | [tokens.css:282](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:282) |
| `--color-accent-berry` | `var(--berry-500)` | `:root, [data-theme='light']` | [tokens.css:283](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:283) |
| `--color-text-primary` | `var(--neutral-950)` | `:root, [data-theme='light']` | [tokens.css:285](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:285) |
| `--color-text-secondary` | `var(--neutral-700)` | `:root, [data-theme='light']` | [tokens.css:286](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:286) |
| `--color-text-tertiary` | `var(--neutral-600)` | `:root, [data-theme='light']` | [tokens.css:287](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:287) |
| `--color-text-inverse` | `var(--white)` | `:root, [data-theme='light']` | [tokens.css:288](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:288) |
| `--color-text-disabled` | `var(--neutral-400)` | `:root, [data-theme='light']` | [tokens.css:289](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:289) |
| `--color-surface-canvas` | `var(--neutral-075)` | `:root, [data-theme='light']` | [tokens.css:291](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:291) |
| `--color-surface-page` | `var(--neutral-050)` | `:root, [data-theme='light']` | [tokens.css:292](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:292) |
| `--color-surface-card` | `var(--white)` | `:root, [data-theme='light']` | [tokens.css:293](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:293) |
| `--color-surface-subtle` | `var(--neutral-100)` | `:root, [data-theme='light']` | [tokens.css:294](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:294) |
| `--color-surface-raised` | `var(--white)` | `:root, [data-theme='light']` | [tokens.css:295](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:295) |
| `--color-surface-disabled` | `#eef1ef` | `:root, [data-theme='light']` | [tokens.css:296](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:296) |
| `--color-border-subtle` | `var(--neutral-150)` | `:root, [data-theme='light']` | [tokens.css:298](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:298) |
| `--color-border-default` | `var(--neutral-200)` | `:root, [data-theme='light']` | [tokens.css:299](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:299) |
| `--color-border-strong` | `var(--neutral-300)` | `:root, [data-theme='light']` | [tokens.css:300](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:300) |
| `--color-border-focus` | `var(--green-700)` | `:root, [data-theme='light']` | [tokens.css:301](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:301) |
| `--color-overlay` | `rgba(16, 42, 29, 0.3)` | `:root, [data-theme='light']` | [tokens.css:303](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:303) |
| `--glass-bg` | `color-mix(in srgb, var(--white) 82%, transparent)` | `:root, [data-theme='light']` | [tokens.css:304](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:304) |
| `--success-bg` | `var(--green-100)` | `:root, [data-theme='light']` | [tokens.css:305](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:305) |
| `--success-fg` | `#1f6b43` | `:root, [data-theme='light']` | [tokens.css:306](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:306) |
| `--success-border` | `#bbddc7` | `:root, [data-theme='light']` | [tokens.css:307](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:307) |
| `--success-strong` | `#155232` | `:root, [data-theme='light']` | [tokens.css:308](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:308) |
| `--warning-bg` | `var(--color-accent-harvest-soft)` | `:root, [data-theme='light']` | [tokens.css:309](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:309) |
| `--warning-fg` | `var(--color-accent-harvest-text)` | `:root, [data-theme='light']` | [tokens.css:310](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:310) |
| `--warning-border` | `var(--color-accent-harvest-border)` | `:root, [data-theme='light']` | [tokens.css:311](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:311) |
| `--warning-strong` | `var(--color-accent-harvest-strong)` | `:root, [data-theme='light']` | [tokens.css:312](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:312) |
| `--error-bg` | `var(--red-100)` | `:root, [data-theme='light']` | [tokens.css:313](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:313) |
| `--error-fg` | `var(--red-600)` | `:root, [data-theme='light']` | [tokens.css:314](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:314) |
| `--error-border` | `var(--red-200)` | `:root, [data-theme='light']` | [tokens.css:315](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:315) |
| `--error-strong` | `var(--red-800)` | `:root, [data-theme='light']` | [tokens.css:316](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:316) |
| `--info-bg` | `var(--sky-100)` | `:root, [data-theme='light']` | [tokens.css:317](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:317) |
| `--info-fg` | `var(--sky-700)` | `:root, [data-theme='light']` | [tokens.css:318](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:318) |
| `--info-border` | `var(--sky-200)` | `:root, [data-theme='light']` | [tokens.css:319](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:319) |
| `--info-strong` | `var(--sky-900)` | `:root, [data-theme='light']` | [tokens.css:320](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:320) |
| `--gradient-weather` | `var(--gradient-weather-light)` | `:root, [data-theme='light']` | [tokens.css:321](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:321) |
| `--color-context-environment-foreground` | `var(--green-950)` | `:root, [data-theme='light']` | [tokens.css:322](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:322) |
| `--chart-1` | `var(--green-500)` | `:root, [data-theme='light']` | [tokens.css:323](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:323) |
| `--chart-2` | `var(--aqua-500)` | `:root, [data-theme='light']` | [tokens.css:324](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:324) |
| `--chart-3` | `var(--harvest-500)` | `:root, [data-theme='light']` | [tokens.css:325](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:325) |
| `--chart-4` | `var(--soil-500)` | `:root, [data-theme='light']` | [tokens.css:326](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:326) |
| `--chart-5` | `var(--berry-500)` | `:root, [data-theme='light']` | [tokens.css:327](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:327) |
| `--chart-6` | `var(--sky-500)` | `:root, [data-theme='light']` | [tokens.css:328](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:328) |
| `--chart-1-stroke` | `var(--green-700)` | `:root, [data-theme='light']` | [tokens.css:329](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:329) |
| `--chart-2-stroke` | `var(--aqua-700)` | `:root, [data-theme='light']` | [tokens.css:330](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:330) |
| `--chart-3-stroke` | `var(--harvest-700)` | `:root, [data-theme='light']` | [tokens.css:331](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:331) |
| `--chart-4-stroke` | `var(--soil-700)` | `:root, [data-theme='light']` | [tokens.css:332](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:332) |
| `--chart-5-stroke` | `var(--berry-700)` | `:root, [data-theme='light']` | [tokens.css:333](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:333) |
| `--chart-6-stroke` | `var(--sky-700)` | `:root, [data-theme='light']` | [tokens.css:334](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:334) |
| `--chart-grid` | `rgba(21, 32, 25, 0.08)` | `:root, [data-theme='light']` | [tokens.css:335](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:335) |
| `--chart-axis` | `var(--neutral-600)` | `:root, [data-theme='light']` | [tokens.css:336](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:336) |
| `--chart-label` | `var(--neutral-700)` | `:root, [data-theme='light']` | [tokens.css:337](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:337) |
| `--chart-success` | `var(--green-600)` | `:root, [data-theme='light']` | [tokens.css:338](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:338) |
| `--chart-warning` | `var(--harvest-600)` | `:root, [data-theme='light']` | [tokens.css:339](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:339) |
| `--color-brand-primary` | `#56b77a` | `[data-theme='dark']` | [tokens.css:343](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:343) |
| `--color-brand-primary-hover` | `#6ac68b` | `[data-theme='dark']` | [tokens.css:344](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:344) |
| `--color-brand-primary-pressed` | `#83d19d` | `[data-theme='dark']` | [tokens.css:345](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:345) |
| `--color-brand-soft` | `color-mix(in srgb, var(--green-500) 18%, transparent)` | `[data-theme='dark']` | [tokens.css:346](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:346) |
| `--color-brand-softer` | `color-mix(in srgb, var(--green-500) 10%, transparent)` | `[data-theme='dark']` | [tokens.css:347](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:347) |
| `--color-accent-harvest` | `var(--harvest-400)` | `[data-theme='dark']` | [tokens.css:349](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:349) |
| `--color-accent-harvest-strong` | `#f0d58a` | `[data-theme='dark']` | [tokens.css:350](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:350) |
| `--color-accent-harvest-soft` | `rgba(198, 154, 45, 0.14)` | `[data-theme='dark']` | [tokens.css:351](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:351) |
| `--color-accent-harvest-border` | `rgba(221, 181, 87, 0.28)` | `[data-theme='dark']` | [tokens.css:352](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:352) |
| `--color-accent-harvest-text` | `#f0d58a` | `[data-theme='dark']` | [tokens.css:353](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:353) |
| `--color-accent-aqua` | `var(--aqua-400)` | `[data-theme='dark']` | [tokens.css:354](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:354) |
| `--color-accent-aqua-strong` | `var(--aqua-300)` | `[data-theme='dark']` | [tokens.css:355](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:355) |
| `--color-accent-aqua-soft` | `color-mix(in srgb, var(--aqua-500) 16%, transparent)` | `[data-theme='dark']` | [tokens.css:356](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:356) |
| `--color-accent-aqua-border` | `color-mix(in srgb, var(--aqua-400) 36%, transparent)` | `[data-theme='dark']` | [tokens.css:357](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:357) |
| `--color-accent-sky` | `var(--sky-400)` | `[data-theme='dark']` | [tokens.css:358](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:358) |
| `--color-accent-soil` | `var(--soil-400)` | `[data-theme='dark']` | [tokens.css:359](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:359) |
| `--color-accent-berry` | `var(--berry-400)` | `[data-theme='dark']` | [tokens.css:360](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:360) |
| `--color-text-primary` | `var(--dark-050)` | `[data-theme='dark']` | [tokens.css:362](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:362) |
| `--color-text-secondary` | `var(--dark-300)` | `[data-theme='dark']` | [tokens.css:363](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:363) |
| `--color-text-tertiary` | `var(--dark-300)` | `[data-theme='dark']` | [tokens.css:364](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:364) |
| `--color-text-inverse` | `var(--dark-950)` | `[data-theme='dark']` | [tokens.css:365](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:365) |
| `--color-text-disabled` | `var(--dark-500)` | `[data-theme='dark']` | [tokens.css:366](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:366) |
| `--color-surface-canvas` | `var(--dark-950)` | `[data-theme='dark']` | [tokens.css:368](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:368) |
| `--color-surface-page` | `var(--dark-900)` | `[data-theme='dark']` | [tokens.css:369](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:369) |
| `--color-surface-card` | `var(--dark-800)` | `[data-theme='dark']` | [tokens.css:370](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:370) |
| `--color-surface-subtle` | `var(--dark-750)` | `[data-theme='dark']` | [tokens.css:371](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:371) |
| `--color-surface-raised` | `var(--dark-700)` | `[data-theme='dark']` | [tokens.css:372](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:372) |
| `--color-surface-disabled` | `var(--dark-750)` | `[data-theme='dark']` | [tokens.css:373](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:373) |
| `--color-border-subtle` | `rgba(223, 231, 226, 0.08)` | `[data-theme='dark']` | [tokens.css:375](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:375) |
| `--color-border-default` | `var(--dark-600)` | `[data-theme='dark']` | [tokens.css:376](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:376) |
| `--color-border-strong` | `rgba(223, 231, 226, 0.24)` | `[data-theme='dark']` | [tokens.css:377](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:377) |
| `--color-border-focus` | `var(--color-brand-primary-hover)` | `[data-theme='dark']` | [tokens.css:378](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:378) |
| `--color-overlay` | `rgba(0, 0, 0, 0.58)` | `[data-theme='dark']` | [tokens.css:380](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:380) |
| `--glass-bg` | `color-mix(in srgb, var(--color-surface-page) 86%, transparent)` | `[data-theme='dark']` | [tokens.css:381](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:381) |
| `--success-bg` | `color-mix(in srgb, var(--green-600) 18%, transparent)` | `[data-theme='dark']` | [tokens.css:382](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:382) |
| `--success-fg` | `var(--green-300)` | `[data-theme='dark']` | [tokens.css:383](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:383) |
| `--success-border` | `color-mix(in srgb, var(--green-400) 36%, transparent)` | `[data-theme='dark']` | [tokens.css:384](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:384) |
| `--success-strong` | `var(--green-200)` | `[data-theme='dark']` | [tokens.css:385](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:385) |
| `--warning-bg` | `var(--color-accent-harvest-soft)` | `[data-theme='dark']` | [tokens.css:386](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:386) |
| `--warning-fg` | `var(--color-accent-harvest-text)` | `[data-theme='dark']` | [tokens.css:387](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:387) |
| `--warning-border` | `var(--color-accent-harvest-border)` | `[data-theme='dark']` | [tokens.css:388](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:388) |
| `--warning-strong` | `var(--color-accent-harvest-text)` | `[data-theme='dark']` | [tokens.css:389](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:389) |
| `--error-bg` | `color-mix(in srgb, var(--red-500) 18%, transparent)` | `[data-theme='dark']` | [tokens.css:390](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:390) |
| `--error-fg` | `var(--red-300)` | `[data-theme='dark']` | [tokens.css:391](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:391) |
| `--error-border` | `color-mix(in srgb, var(--red-400) 36%, transparent)` | `[data-theme='dark']` | [tokens.css:392](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:392) |
| `--error-strong` | `var(--red-200)` | `[data-theme='dark']` | [tokens.css:393](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:393) |
| `--info-bg` | `color-mix(in srgb, var(--sky-500) 20%, transparent)` | `[data-theme='dark']` | [tokens.css:394](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:394) |
| `--info-fg` | `var(--sky-300)` | `[data-theme='dark']` | [tokens.css:395](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:395) |
| `--info-border` | `color-mix(in srgb, var(--sky-400) 36%, transparent)` | `[data-theme='dark']` | [tokens.css:396](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:396) |
| `--info-strong` | `var(--sky-200)` | `[data-theme='dark']` | [tokens.css:397](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:397) |
| `--gradient-weather` | `var(--gradient-weather-dark)` | `[data-theme='dark']` | [tokens.css:398](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:398) |
| `--color-context-environment-foreground` | `var(--white)` | `[data-theme='dark']` | [tokens.css:399](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:399) |
| `--chart-1` | `var(--chart-1-dark)` | `[data-theme='dark']` | [tokens.css:400](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:400) |
| `--chart-2` | `var(--chart-2-dark)` | `[data-theme='dark']` | [tokens.css:401](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:401) |
| `--chart-3` | `var(--chart-3-dark)` | `[data-theme='dark']` | [tokens.css:402](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:402) |
| `--chart-4` | `var(--chart-4-dark)` | `[data-theme='dark']` | [tokens.css:403](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:403) |
| `--chart-5` | `var(--chart-5-dark)` | `[data-theme='dark']` | [tokens.css:404](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:404) |
| `--chart-6` | `var(--chart-6-dark)` | `[data-theme='dark']` | [tokens.css:405](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:405) |
| `--chart-1-stroke` | `var(--chart-1)` | `[data-theme='dark']` | [tokens.css:406](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:406) |
| `--chart-2-stroke` | `var(--chart-2)` | `[data-theme='dark']` | [tokens.css:407](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:407) |
| `--chart-3-stroke` | `var(--chart-3)` | `[data-theme='dark']` | [tokens.css:408](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:408) |
| `--chart-4-stroke` | `var(--chart-4)` | `[data-theme='dark']` | [tokens.css:409](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:409) |
| `--chart-5-stroke` | `var(--chart-5)` | `[data-theme='dark']` | [tokens.css:410](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:410) |
| `--chart-6-stroke` | `var(--chart-6)` | `[data-theme='dark']` | [tokens.css:411](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:411) |
| `--chart-grid` | `rgba(223, 231, 226, 0.1)` | `[data-theme='dark']` | [tokens.css:412](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:412) |
| `--chart-axis` | `var(--dark-300)` | `[data-theme='dark']` | [tokens.css:413](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:413) |
| `--chart-label` | `var(--dark-050)` | `[data-theme='dark']` | [tokens.css:414](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:414) |
| `--chart-success` | `var(--green-400)` | `[data-theme='dark']` | [tokens.css:415](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:415) |
| `--chart-warning` | `var(--harvest-400)` | `[data-theme='dark']` | [tokens.css:416](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:416) |
| `--shadow-sm` | `none` | `[data-theme='dark']` | [tokens.css:417](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:417) |
| `--shadow-md` | `none` | `[data-theme='dark']` | [tokens.css:418](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:418) |
| `--users-table-border` | `#303030` | `.users-layout` | [users-access.css:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:3) |
| `--users-table-head` | `#777b19` | `.users-layout` | [users-access.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:4) |
| `--users-table-text` | `#e2e2e2` | `.users-layout` | [users-access.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:5) |
| `--users-table-border` | `#d0d9ca` | `[data-theme='light'] .users-layout` | [users-access.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:8) |
| `--users-table-head` | `#6a7116` | `[data-theme='light'] .users-layout` | [users-access.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:9) |
| `--users-table-text` | `#15271b` | `[data-theme='light'] .users-layout` | [users-access.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:10) |

## Dónde se usa cada variable

Se listan todas las referencias directas encontradas. Cuando una referencia asigna otra variable (por ejemplo `--color-brand-primary`), sigue esa variable para llegar al selector del componente. «Sin referencias directas» indica que el tono está definido sin un consumidor explícito `var(...)` en estos archivos; un SVG puede usar el mismo HEX de forma independiente.

### `--aqua-050`

Sin referencias directas.

### `--aqua-100`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-aqua-soft` | [tokens.css:279](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:279) |

### `--aqua-200`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-aqua-border` | [tokens.css:280](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:280) |

### `--aqua-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-accent-aqua-strong` | [tokens.css:355](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:355) |

### `--aqua-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--chart-2-dark` | [tokens.css:248](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:248) |
| `[data-theme='dark']` | `--color-accent-aqua` | [tokens.css:354](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:354) |
| `[data-theme='dark']` | `--color-accent-aqua-border` | [tokens.css:357](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:357) |

### `--aqua-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-aqua` | [tokens.css:277](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:277) |
| `:root, [data-theme='light']` | `--chart-2` | [tokens.css:324](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:324) |
| `[data-theme='dark']` | `--color-accent-aqua-soft` | [tokens.css:356](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:356) |

### `--aqua-600`

Sin referencias directas.

### `--aqua-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--chart-2-stroke` | [tokens.css:330](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:330) |

### `--aqua-800`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-aqua-strong` | [tokens.css:278](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:278) |

### `--aqua-900`

Sin referencias directas.

### `--berry-050`

Sin referencias directas.

### `--berry-100`

Sin referencias directas.

### `--berry-200`

Sin referencias directas.

### `--berry-300`

Sin referencias directas.

### `--berry-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--chart-5-dark` | [tokens.css:251](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:251) |
| `[data-theme='dark']` | `--color-accent-berry` | [tokens.css:360](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:360) |

### `--berry-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-berry` | [tokens.css:283](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:283) |
| `:root, [data-theme='light']` | `--chart-5` | [tokens.css:327](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:327) |

### `--berry-600`

Sin referencias directas.

### `--berry-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--chart-5-stroke` | [tokens.css:333](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:333) |

### `--berry-800`

Sin referencias directas.

### `--berry-900`

Sin referencias directas.

### `--border`

Sin referencias directas.

### `--chart-1`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.comparison-chips li` | `box-shadow` | [redesign.css:625](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:625) |
| `.series-1` | `--series-color` | [redesign.css:718](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:718) |
| `.comparison-bar .bar-fill` | `background` | [redesign.css:742](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:742) |
| `:root` | `--chart-primary` | [tokens.css:254](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:254) |
| `[data-theme='dark']` | `--chart-1-stroke` | [tokens.css:406](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:406) |

### `--chart-1-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--chart-1` | [tokens.css:400](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:400) |

### `--chart-1-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-index` | `border` | [redesign.css:711](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:711) |
| `.series-index` | `color` | [redesign.css:712](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:712) |
| `.series-1` | `--series-stroke` | [redesign.css:719](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:719) |
| `.comparison-bar .bar-fill` | `box-shadow` | [redesign.css:743](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:743) |
| `.daily-fill` | `box-shadow` | [styles.css:1378](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1378) |
| `.bar-fill` | `box-shadow` | [styles.css:1435](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1435) |

### `--chart-2`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-2` | `--series-color` | [redesign.css:722](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:722) |
| `:root` | `--chart-secondary` | [tokens.css:255](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:255) |
| `[data-theme='dark']` | `--chart-2-stroke` | [tokens.css:407](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:407) |

### `--chart-2-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--chart-2` | [tokens.css:401](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:401) |

### `--chart-2-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-2` | `--series-stroke` | [redesign.css:723](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:723) |

### `--chart-3`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-3` | `--series-color` | [redesign.css:726](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:726) |
| `:root` | `--chart-recent` | [tokens.css:256](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:256) |
| `[data-theme='dark']` | `--chart-3-stroke` | [tokens.css:408](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:408) |

### `--chart-3-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--chart-3` | [tokens.css:402](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:402) |

### `--chart-3-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-3` | `--series-stroke` | [redesign.css:727](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:727) |
| `:root` | `--chart-recent-stroke` | [tokens.css:257](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:257) |

### `--chart-4`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-4` | `--series-color` | [redesign.css:730](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:730) |
| `[data-theme='dark']` | `--chart-4-stroke` | [tokens.css:409](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:409) |

### `--chart-4-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--chart-4` | [tokens.css:403](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:403) |

### `--chart-4-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-4` | `--series-stroke` | [redesign.css:731](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:731) |

### `--chart-5`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-5` | `--series-color` | [redesign.css:734](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:734) |
| `[data-theme='dark']` | `--chart-5-stroke` | [tokens.css:410](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:410) |

### `--chart-5-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--chart-5` | [tokens.css:404](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:404) |

### `--chart-5-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-5` | `--series-stroke` | [redesign.css:735](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:735) |

### `--chart-6`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-6` | `--series-color` | [redesign.css:738](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:738) |
| `[data-theme='dark']` | `--chart-6-stroke` | [tokens.css:411](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:411) |

### `--chart-6-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--chart-6` | [tokens.css:405](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:405) |

### `--chart-6-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-6` | `--series-stroke` | [redesign.css:739](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:739) |

### `--chart-axis`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.chart-scale` | `color` | [styles.css:1442](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1442) |

### `--chart-error`

Sin referencias directas.

### `--chart-grid`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.daily-plot` | `border-bottom` | [styles.css:1345](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1345) |
| `.daily-plot` | `background` | [styles.css:1347](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1347) |

### `--chart-info`

Sin referencias directas.

### `--chart-label`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.daily-chart figcaption` | `color` | [styles.css:1336](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1336) |
| `.daily-column` | `color` | [styles.css:1365](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1365) |

### `--chart-primary`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.ranking-in-cell-bar > span` | `background` | [redesign.css:580](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:580) |
| `.daily-fill` | `background` | [styles.css:1377](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1377) |
| `.bar-fill` | `background` | [styles.css:1434](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1434) |

### `--chart-recent`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.daily-column.is-recent .daily-fill` | `background` | [styles.css:1382](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1382) |

### `--chart-recent-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.daily-column.is-recent .daily-fill` | `box-shadow` | [styles.css:1383](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1383) |

### `--chart-secondary`

Sin referencias directas.

### `--chart-success`

Sin referencias directas.

### `--chart-warning`

Sin referencias directas.

### `--color-accent-aqua`

Sin referencias directas.

### `--color-accent-aqua-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.commercial-effective-modules` | `border-color` | [styles.css:788](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:788) |
| `:root` | `--color-context-available-border` | [tokens.css:262](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:262) |

### `--color-accent-aqua-soft`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.commercial-effective-modules` | `background` | [styles.css:789](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:789) |
| `:root` | `--color-context-available-bg` | [tokens.css:260](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:260) |

### `--color-accent-aqua-strong`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--color-context-available-fg` | [tokens.css:261](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:261) |

### `--color-accent-berry`

Sin referencias directas.

### `--color-accent-harvest`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-entity-intro` | `border-top` | [styles.css:621](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:621) |
| `.base-note` | `border-left` | [styles.css:928](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:928) |
| `.harvest-tabs a.active` | `box-shadow` | [styles.css:1143](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1143) |
| `.commercial-future` | `background` | [styles.css:1466](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1466) |

### `--color-accent-harvest-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.hero-facts > span + span` | `border-color` | [redesign.css:352](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:352) |
| `.commercial-future` | `border` | [styles.css:1465](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1465) |
| `:root, [data-theme='light']` | `--warning-border` | [tokens.css:311](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:311) |
| `[data-theme='dark']` | `--warning-border` | [tokens.css:388](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:388) |

### `--color-accent-harvest-soft`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.hero-facts > span + span` | `background` | [redesign.css:350](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:350) |
| `:root, [data-theme='light']` | `--warning-bg` | [tokens.css:309](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:309) |
| `[data-theme='dark']` | `--warning-bg` | [tokens.css:386](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:386) |

### `--color-accent-harvest-strong`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--warning-strong` | [tokens.css:312](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:312) |

### `--color-accent-harvest-text`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.hero-facts > span + span` | `color` | [redesign.css:351](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:351) |
| `:root, [data-theme='light']` | `--warning-fg` | [tokens.css:310](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:310) |
| `[data-theme='dark']` | `--warning-fg` | [tokens.css:387](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:387) |
| `[data-theme='dark']` | `--warning-strong` | [tokens.css:389](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:389) |

### `--color-accent-sky`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--chart-info` | [tokens.css:259](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:259) |

### `--color-accent-soil`

Sin referencias directas.

### `--color-border-default`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-entry .rail-collection.is-selected` | `box-shadow` | [redesign.css:82](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:82) |
| `.rail-tooltip` | `border` | [redesign.css:91](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:91) |
| `.navigation-routes` | `border-left` | [redesign.css:185](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:185) |
| `.ranking-search > div` | `border` | [redesign.css:503](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:503) |
| `.comparison-tray` | `border` | [redesign.css:594](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:594) |
| `.comparison-chips li` | `border` | [redesign.css:620](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:620) |
| `.chart-tooltip` | `border` | [redesign.css:752](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:752) |
| `button` | `border` | [styles.css:55](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:55) |
| `input, select, textarea` | `border` | [styles.css:99](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:99) |
| `.empty-state` | `border` | [styles.css:266](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:266) |
| `.user-menu-panel` | `border` | [styles.css:497](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:497) |
| `.management-filterbar` | `border-color` | [styles.css:625](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:625) |
| `.management-table` | `border-color` | [styles.css:642](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:642) |
| `.settings-tabs, nav.actions` | `border-bottom` | [styles.css:979](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:979) |
| `.settings-form fieldset` | `border` | [styles.css:1023](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1023) |
| `.commercial-history` | `border-left` | [styles.css:1450](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1450) |
| `.commercial-form` | `border` | [styles.css:1460](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1460) |
| `.commercial-audit` | `border` | [styles.css:1474](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1474) |
| `.worker-drawer` | `border` | [workers.css:209](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:209) |

### `--color-border-focus`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `input:focus, select:focus, textarea:focus` | `border-color` | [styles.css:113](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:113) |
| `.login-form input:focus` | `border-color` | [styles.css:283](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:283) |
| `:root` | `--focus-ring-color` | [tokens.css:200](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:200) |

### `--color-border-strong`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `button:hover:not(:disabled)` | `border-color` | [styles.css:66](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:66) |
| `input:hover, select:hover, textarea:hover` | `border-color` | [styles.css:108](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:108) |
| `.table-scroll` | `scrollbar-color` | [styles.css:1064](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1064) |

### `--color-border-subtle`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.navigation-rail` | `border` | [redesign.css:27](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:27) |
| `.navigation-panel` | `border` | [redesign.css:124](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:124) |
| `.portal-layout .header` | `border-bottom-color` | [redesign.css:211](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:211) |
| `.weather-card` | `border` | [redesign.css:364](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:364) |
| `.ranking-general` | `border` | [redesign.css:463](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:463) |
| `.comparison-result` | `border` | [redesign.css:650](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:650) |
| `.comparison-availability` | `border-top` | [redesign.css:664](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:664) |
| `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | `--border` | [styles.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:20) |
| `.sidebar` | `border-right` | [styles.css:329](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:329) |
| `.header` | `border-bottom` | [styles.css:423](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:423) |
| `.user-menu-panel button` | `border-top` | [styles.css:518](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:518) |
| `.management-page-header` | `border-bottom` | [styles.css:558](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:558) |
| `.management-page-icon, .detail-hero-icon` | `border` | [styles.css:573](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:573) |
| `.detail-hero` | `border` | [styles.css:669](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:669) |
| `.detail-hero-facts` | `border-top` | [styles.css:710](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:710) |
| `.detail-hero-facts > div` | `border-left` | [styles.css:715](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:715) |
| `.report-secondary-nav` | `border` | [styles.css:748](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:748) |
| `.commercial-modules-grid > div` | `border` | [styles.css:775](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:775) |
| `.internal-report-context` | `border` | [styles.css:807](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:807) |
| `.content-card, .chart-card` | `border` | [styles.css:835](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:835) |
| `.badge` | `border` | [styles.css:867](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:867) |
| `.area` | `border-bottom` | [styles.css:906](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:906) |
| `.workspace-footer` | `border-top` | [styles.css:943](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:943) |
| `.table-scroll` | `border` | [styles.css:1061](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1061) |
| `th, td` | `border-bottom` | [styles.css:1078](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1078) |
| `.management-section` | `border-top` | [styles.css:1134](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1134) |
| `.harvest-surface .fact-list` | `border` | [styles.css:1138](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1138) |
| `.report-metrics` | `border` | [styles.css:1276](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1276) |
| `.report-metrics > div` | `border-left` | [styles.css:1282](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1282) |
| `.report-page:not(.report-ranking) .report-filters` | `border` | [styles.css:1479](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1479) |
| `.commercial-history > li` | `border-bottom` | [styles.css:1486](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1486) |
| `.report-metrics > div` | `border-bottom` | [styles.css:1558](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1558) |
| `.detail-hero-facts > div, .detail-hero-facts > div:nth-child(odd)` | `border-top` | [styles.css:1644](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1644) |
| `.worker-drawer > :is(section, form)` | `border-top` | [workers.css:238](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:238) |
| `.worker-campaigns li` | `border-bottom` | [workers.css:283](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:283) |

### `--color-brand-primary`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-wordmark` | `color` | [redesign.css:35](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:35) |
| `.rail-entry .rail-collection.is-active` | `color` | [redesign.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:69) |
| `.rail-entry .rail-collection.is-active::after` | `background` | [redesign.css:78](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:78) |
| `.is-active-module > .navigation-module-link` | `color` | [redesign.css:179](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:179) |
| `.navigation-routes a.active` | `color` | [redesign.css:202](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:202) |
| `.navigation-routes a.active` | `box-shadow` | [redesign.css:204](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:204) |
| `.ranking-table tr.is-top .ranking-position` | `color` | [redesign.css:412](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:412) |
| `.period-selector button[aria-pressed='true']` | `color` | [redesign.css:452](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:452) |
| `.ranking-table tr.is-selected td:first-child` | `box-shadow` | [redesign.css:562](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:562) |
| `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | `--green` | [styles.css:19](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:19) |
| `input[type='checkbox'], input[type='radio']` | `accent-color` | [styles.css:132](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:132) |
| `.primary` | `background` | [styles.css:185](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:185) |
| `.text-link` | `color` | [styles.css:202](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:202) |
| `.sidebar nav a.active` | `color` | [styles.css:371](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:371) |
| `.sidebar nav a.active:before` | `background` | [styles.css:382](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:382) |
| `.avatar` | `color` | [styles.css:529](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:529) |
| `.management-page-icon, .detail-hero-icon` | `border` | [styles.css:573](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:573) |
| `.management-page-icon, .detail-hero-icon` | `color` | [styles.css:577](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:577) |
| `.detail-hero` | `border` | [styles.css:669](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:669) |
| `.context-note` | `border-left` | [styles.css:826](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:826) |
| `.settings-tabs a.active, nav.actions a[aria-current='page']` | `color` | [styles.css:993](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:993) |
| `.settings-tabs a.active, nav.actions a[aria-current='page']` | `box-shadow` | [styles.css:995](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:995) |
| `td a` | `color` | [styles.css:1107](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1107) |
| `.harvest-tabs a.active` | `box-shadow` | [styles.css:1143](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1143) |
| `progress` | `accent-color` | [styles.css:1157](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1157) |
| `.report-metrics > div:first-child dd` | `color` | [styles.css:1302](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1302) |
| `summary` | `color` | [styles.css:1501](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1501) |
| `.workers-page .workers-primary, .worker-drawer .workers-primary` | `background` | [workers.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:7) |

### `--color-brand-primary-hover`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.primary:hover:not(:disabled)` | `background` | [styles.css:190](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:190) |
| `[data-theme='dark']` | `--color-border-focus` | [tokens.css:378](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:378) |

### `--color-brand-primary-pressed`

Sin referencias directas.

### `--color-brand-soft`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-entry .rail-collection.is-active` | `background` | [redesign.css:68](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:68) |
| `.is-active-module > .navigation-module-link` | `background` | [redesign.css:180](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:180) |
| `.navigation-routes a.active` | `background` | [redesign.css:201](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:201) |
| `.ranking-table tr.is-top .ranking-position` | `background` | [redesign.css:411](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:411) |
| `button:active:not(:disabled)` | `background` | [styles.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:69) |
| `.sidebar nav a.active` | `background` | [styles.css:372](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:372) |
| `.avatar` | `background` | [styles.css:528](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:528) |
| `.settings-tabs a.active, nav.actions a[aria-current='page']` | `background` | [styles.css:992](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:992) |

### `--color-brand-softer`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.ranking-table tr.is-selected` | `background` | [redesign.css:559](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:559) |
| `.management-page-icon, .detail-hero-icon` | `background` | [styles.css:576](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:576) |
| `.management-table tbody tr:hover` | `background` | [styles.css:662](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:662) |
| `.detail-hero` | `background` | [styles.css:672](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:672) |
| `.context-note` | `background` | [styles.css:828](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:828) |
| `.area:hover` | `background` | [styles.css:910](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:910) |
| `.report-metrics > div:first-child` | `background` | [styles.css:1287](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1287) |

### `--color-context-available-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.available` | `background` | [styles.css:895](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:895) |

### `--color-context-available-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.available` | `border-color` | [styles.css:897](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:897) |

### `--color-context-available-fg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.available` | `color` | [styles.css:896](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:896) |

### `--color-context-environment-foreground`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.weather-card` | `color` | [redesign.css:366](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:366) |
| `.weather-symbol` | `color` | [redesign.css:372](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:372) |
| `.weather-card .eyebrow` | `color` | [redesign.css:379](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:379) |
| `.weather-card p` | `color` | [redesign.css:387](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:387) |
| `.weather-footer` | `color` | [redesign.css:392](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:392) |

### `--color-overlay`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.nav-overlay` | `background` | [styles.css:1546](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1546) |
| `.nav-overlay:hover:not(:disabled)` | `background` | [styles.css:1552](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1552) |

### `--color-surface-canvas`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | `background` | [styles.css:18](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:18) |
| `.worker-drawer` | `background` | [workers.css:211](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:211) |

### `--color-surface-card`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.period-selector button[aria-pressed='true']` | `background` | [redesign.css:450](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:450) |
| `.ranking-general` | `background` | [redesign.css:462](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:462) |
| `.comparison-chips li` | `background` | [redesign.css:619](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:619) |
| `.comparison-result` | `background` | [redesign.css:652](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:652) |
| `button` | `background` | [styles.css:57](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:57) |
| `input, select, textarea` | `background` | [styles.css:102](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:102) |
| `.secondary` | `background` | [styles.css:194](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:194) |
| `.header` | `background` | [styles.css:424](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:424) |
| `.management-filterbar` | `background` | [styles.css:627](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:627) |
| `.management-table` | `background` | [styles.css:644](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:644) |
| `.detail-hero` | `background` | [styles.css:672](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:672) |
| `.report-secondary-nav` | `background` | [styles.css:750](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:750) |
| `.commercial-modules-grid > div` | `background` | [styles.css:777](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:777) |
| `.commercial-effective-modules` | `background` | [styles.css:789](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:789) |
| `.internal-report-context` | `background` | [styles.css:809](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:809) |
| `.content-card, .chart-card` | `background` | [styles.css:834](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:834) |
| `table caption` | `background` | [styles.css:1125](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1125) |
| `.report-metrics` | `background` | [styles.css:1275](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1275) |
| `.commercial-form` | `background` | [styles.css:1461](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1461) |
| `.commercial-future` | `background` | [styles.css:1466](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1466) |

### `--color-surface-disabled`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled` | `background` | [styles.css:78](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:78) |

### `--color-surface-page`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.ranking-search > div` | `background` | [redesign.css:505](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:505) |
| `.suite-navigation.is-open` | `background` | [redesign.css:824](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:824) |
| `.company-option` | `background` | [styles.css:306](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:306) |
| `th` | `background` | [styles.css:1082](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1082) |
| `.harvest-surface .fact-list` | `background` | [styles.css:1140](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1140) |
| `.commercial-audit` | `background` | [styles.css:1475](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1475) |
| `.report-page:not(.report-ranking) .report-filters` | `background` | [styles.css:1481](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1481) |
| `[data-theme='dark']` | `--glass-bg` | [tokens.css:381](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:381) |

### `--color-surface-raised`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-tooltip` | `background` | [redesign.css:89](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:89) |
| `.chart-tooltip` | `background` | [redesign.css:754](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:754) |
| `.user-menu-panel` | `background` | [styles.css:499](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:499) |
| `.skip-link` | `background` | [styles.css:955](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:955) |

### `--color-surface-subtle`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.navigation-module-link:hover` | `background` | [redesign.css:176](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:176) |
| `.period-selector > div` | `background` | [redesign.css:437](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:437) |
| `.ranking-in-cell-bar` | `background` | [redesign.css:573](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:573) |
| `.comparison-tray` | `background` | [redesign.css:596](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:596) |
| `button:hover:not(:disabled)` | `background` | [styles.css:65](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:65) |
| `input[readonly], textarea[readonly]` | `background` | [styles.css:121](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:121) |
| `.skeleton-lines i` | `background` | [styles.css:254](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:254) |
| `.sidebar nav a:hover` | `background` | [styles.css:367](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:367) |
| `.management-table th` | `background` | [styles.css:649](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:649) |
| `.badge` | `background` | [styles.css:871](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:871) |
| `.area-mark` | `background` | [styles.css:920](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:920) |
| `tbody tr:hover` | `background` | [styles.css:1099](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1099) |
| `.bar-track` | `background` | [styles.css:1428](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1428) |
| `.commercial-json` | `background` | [styles.css:1493](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1493) |

### `--color-text-disabled`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `button:disabled, input:disabled, select:disabled, textarea:disabled, fieldset:disabled` | `color` | [styles.css:77](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:77) |

### `--color-text-inverse`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.primary` | `color` | [styles.css:184](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:184) |
| `.primary:hover:not(:disabled)` | `color` | [styles.css:189](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:189) |
| `.workers-page .workers-primary, .worker-drawer .workers-primary` | `color` | [workers.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:8) |

### `--color-text-primary`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-wordmark > span > span` | `color` | [redesign.css:41](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:41) |
| `.rail-tooltip` | `color` | [redesign.css:90](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:90) |
| `button.navigation-module-link` | `color` | [redesign.css:163](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:163) |
| `.chart-tooltip` | `color` | [redesign.css:755](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:755) |
| `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | `color` | [styles.css:17](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:17) |
| `button` | `color` | [styles.css:58](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:58) |
| `input, select, textarea` | `color` | [styles.css:101](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:101) |
| `.user-menu-trigger` | `color` | [styles.css:478](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:478) |
| `.management-filterbar :is(input, select)` | `color` | [styles.css:638](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:638) |
| `.detail-hero-facts dd` | `color` | [styles.css:729](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:729) |
| `tbody th` | `color` | [styles.css:1096](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1096) |
| `table caption` | `color` | [styles.css:1124](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1124) |
| `.report-detail dd` | `color` | [styles.css:1321](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1321) |
| `.worker-drawer` | `color` | [workers.css:212](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:212) |

### `--color-text-secondary`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-entry .rail-collection` | `color` | [redesign.css:61](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:61) |
| `.rail-caption` | `color` | [redesign.css:113](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:113) |
| `.navigation-routes a` | `color` | [redesign.css:197](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:197) |
| `.editorial-report-actions > p` | `color` | [redesign.css:268](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:268) |
| `.ranking-position` | `color` | [redesign.css:406](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:406) |
| `.period-selector button` | `color` | [redesign.css:447](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:447) |
| `.ranking-search > div > .icon` | `color` | [redesign.css:509](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:509) |
| `.ranking-context` | `color` | [redesign.css:518](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:518) |
| `.ranking-table th small` | `color` | [redesign.css:549](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:549) |
| `.ranking-table .ranking-last-activity` | `color` | [redesign.css:565](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:565) |
| `.selection-hint` | `color` | [redesign.css:645](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:645) |
| `.comparison-availability` | `color` | [redesign.css:667](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:667) |
| `.comparison-chart figcaption` | `color` | [redesign.css:682](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:682) |
| `.ranking-mobile-activity` | `color` | [redesign.css:799](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:799) |
| `@import './tokens.css'; @import './redesign.css'; @import './home.css'; @import './sidebar.css'; @import './harvest-records.css'; @import './harvest-tickets.css'; @import './login.css'; @import './compact.css'; @import './tables.css'; @import './filters.css'; :root` | `--muted` | [styles.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:21) |
| `.muted, .settings-form label small, .check-row small` | `color` | [styles.css:180](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:180) |
| `.quiet` | `color` | [styles.css:197](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:197) |
| `.eyebrow` | `color` | [styles.css:213](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:213) |
| `.loading-state` | `color` | [styles.css:242](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:242) |
| `.empty-state` | `color` | [styles.css:265](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:265) |
| `.company-option small` | `color` | [styles.css:313](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:313) |
| `.sidebar nav a` | `color` | [styles.css:358](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:358) |
| `.sidebar-footer` | `color` | [styles.css:402](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:402) |
| `.tenant-control label` | `color` | [styles.css:439](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:439) |
| `.theme-switcher` | `color` | [styles.css:462](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:462) |
| `.user-menu-trigger > .icon` | `color` | [styles.css:488](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:488) |
| `.user-menu-panel small` | `color` | [styles.css:503](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:503) |
| `.page-heading p` | `color` | [styles.css:545](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:545) |
| `.management-page-copy p` | `color` | [styles.css:599](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:599) |
| `.management-filterbar label` | `color` | [styles.css:633](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:633) |
| `.detail-hero-heading p` | `color` | [styles.css:702](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:702) |
| `.commercial-modules-grid p` | `color` | [styles.css:784](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:784) |
| `.back-link` | `color` | [styles.css:820](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:820) |
| `.context-note` | `color` | [styles.css:829](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:829) |
| `.badge` | `color` | [styles.css:870](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:870) |
| `.area-mark` | `color` | [styles.css:921](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:921) |
| `.area p` | `color` | [styles.css:925](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:925) |
| `.base-note` | `color` | [styles.css:931](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:931) |
| `.workspace-footer` | `color` | [styles.css:941](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:941) |
| `.settings-tabs a, nav.actions a` | `color` | [styles.css:988](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:988) |
| `th` | `color` | [styles.css:1083](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1083) |
| `td small` | `color` | [styles.css:1103](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1103) |
| `.fact-list dt` | `color` | [styles.css:1169](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1169) |
| `.report-actions p` | `color` | [styles.css:1255](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1255) |
| `.report-period` | `color` | [styles.css:1268](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1268) |
| `.report-metrics dt` | `color` | [styles.css:1291](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1291) |
| `.metric-unit` | `color` | [styles.css:1306](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1306) |
| `.report-detail` | `color` | [styles.css:1316](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1316) |
| `.commercial-json` | `color` | [styles.css:1494](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1494) |
| `.lot-detail dt` | `color` | [styles.css:1773](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:1773) |
| `.worker-campaigns > p` | `color` | [workers.css:270](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:270) |
| `.worker-campaigns li span` | `color` | [workers.css:295](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:295) |
| `.worker-activity dt` | `color` | [workers.css:303](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:303) |

### `--color-text-tertiary`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.navigation-module-link > .icon:last-child` | `color` | [redesign.css:172](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:172) |
| `input::placeholder, textarea::placeholder` | `color` | [styles.css:117](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:117) |
| `.sidebar-caption` | `color` | [styles.css:343](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:343) |
| `.management-table th` | `color` | [styles.css:650](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:650) |
| `.detail-hero-facts dt` | `color` | [styles.css:723](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:723) |
| `.commercial-modules-grid .eyebrow` | `color` | [styles.css:763](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:763) |

### `--dark-050`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-text-primary` | [tokens.css:362](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:362) |
| `[data-theme='dark']` | `--chart-label` | [tokens.css:414](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:414) |

### `--dark-100`

Sin referencias directas.

### `--dark-200`

Sin referencias directas.

### `--dark-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-text-secondary` | [tokens.css:363](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:363) |
| `[data-theme='dark']` | `--color-text-tertiary` | [tokens.css:364](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:364) |
| `[data-theme='dark']` | `--chart-axis` | [tokens.css:413](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:413) |

### `--dark-400`

Sin referencias directas.

### `--dark-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-text-disabled` | [tokens.css:366](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:366) |

### `--dark-600`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-border-default` | [tokens.css:376](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:376) |

### `--dark-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-surface-raised` | [tokens.css:372](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:372) |

### `--dark-750`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-surface-subtle` | [tokens.css:371](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:371) |
| `[data-theme='dark']` | `--color-surface-disabled` | [tokens.css:373](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:373) |

### `--dark-800`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-surface-card` | [tokens.css:370](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:370) |

### `--dark-850`

Sin referencias directas.

### `--dark-900`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-surface-page` | [tokens.css:369](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:369) |

### `--dark-950`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--color-text-inverse` | [tokens.css:365](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:365) |
| `[data-theme='dark']` | `--color-surface-canvas` | [tokens.css:368](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:368) |

### `--error-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.notice[role='alert'], p[role='alert']` | `background` | [styles.css:232](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:232) |
| `.status-badge.error` | `background` | [styles.css:890](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:890) |

### `--error-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.notice[role='alert'], p[role='alert']` | `border-color` | [styles.css:233](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:233) |
| `.status-badge.error` | `border-color` | [styles.css:892](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:892) |

### `--error-fg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `input[aria-invalid='true'], select[aria-invalid='true']` | `border-color` | [styles.css:125](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:125) |
| `.notice[role='alert'], p[role='alert']` | `color` | [styles.css:231](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:231) |
| `.status-badge.error` | `color` | [styles.css:891](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:891) |
| `:root` | `--chart-error` | [tokens.css:258](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:258) |

### `--error-strong`

Sin referencias directas.

### `--focus-ring-color`

Sin referencias directas.

### `--glass-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.navigation-rail` | `background` | [redesign.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:26) |
| `.navigation-panel` | `background` | [redesign.css:122](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:122) |
| `.sidebar` | `background` | [styles.css:327](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:327) |

### `--gradient-brand-editorial`

Sin referencias directas.

### `--gradient-brand-overlay`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.portal-hero::after` | `background` | [redesign.css:304](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:304) |

### `--gradient-weather`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.weather-card` | `background` | [redesign.css:367](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:367) |

### `--gradient-weather-dark`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--gradient-weather` | [tokens.css:398](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:398) |

### `--gradient-weather-light`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--gradient-weather` | [tokens.css:321](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:321) |

### `--green`

Sin referencias directas.

### `--green-050`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.portal-hero` | `color` | [redesign.css:288](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:288) |
| `:root, [data-theme='light']` | `--color-brand-softer` | [tokens.css:270](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:270) |

### `--green-100`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-brand-soft` | [tokens.css:269](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:269) |
| `:root, [data-theme='light']` | `--success-bg` | [tokens.css:305](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:305) |

### `--green-200`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.hero-date` | `color` | [redesign.css:313](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:313) |
| `.hero-campaign` | `color` | [redesign.css:330](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:330) |
| `[data-theme='dark']` | `--success-strong` | [tokens.css:385](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:385) |

### `--green-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--success-fg` | [tokens.css:383](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:383) |

### `--green-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--success-border` | [tokens.css:384](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:384) |
| `[data-theme='dark']` | `--chart-success` | [tokens.css:415](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:415) |

### `--green-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--chart-1` | [tokens.css:323](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:323) |
| `[data-theme='dark']` | `--color-brand-soft` | [tokens.css:346](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:346) |
| `[data-theme='dark']` | `--color-brand-softer` | [tokens.css:347](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:347) |

### `--green-600`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.hero-facts > span` | `border` | [redesign.css:344](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:344) |
| `:root, [data-theme='light']` | `--chart-success` | [tokens.css:338](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:338) |
| `[data-theme='dark']` | `--success-bg` | [tokens.css:382](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:382) |

### `--green-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-brand-primary` | [tokens.css:266](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:266) |
| `:root, [data-theme='light']` | `--color-border-focus` | [tokens.css:301](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:301) |
| `:root, [data-theme='light']` | `--chart-1-stroke` | [tokens.css:329](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:329) |

### `--green-800`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-brand-primary-hover` | [tokens.css:267](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:267) |

### `--green-900`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.hero-facts > span` | `background` | [redesign.css:345](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:345) |
| `:root, [data-theme='light']` | `--color-brand-primary-pressed` | [tokens.css:268](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:268) |

### `--green-950`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.portal-hero` | `background` | [redesign.css:289](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:289) |
| `:root` | `--gradient-brand-editorial` | [tokens.css:237](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:237) |
| `:root` | `--gradient-brand-overlay` | [tokens.css:242](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:242) |
| `:root, [data-theme='light']` | `--color-context-environment-foreground` | [tokens.css:322](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:322) |
| `.workers-page .workers-register` | `background` | [workers.css:22](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:22) |

### `--harvest-100`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-100` | [tokens.css:31](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:31) |
| `:root` | `--yellow-050` | [tokens.css:32](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:32) |
| `:root, [data-theme='light']` | `--color-accent-harvest-soft` | [tokens.css:274](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:274) |

### `--harvest-200`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-200` | [tokens.css:30](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:30) |

### `--harvest-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-300` | [tokens.css:29](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:29) |
| `:root, [data-theme='light']` | `--color-accent-harvest-border` | [tokens.css:275](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:275) |

### `--harvest-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-400` | [tokens.css:28](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:28) |
| `:root` | `--chart-3-dark` | [tokens.css:249](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:249) |
| `[data-theme='dark']` | `--color-accent-harvest` | [tokens.css:349](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:349) |
| `[data-theme='dark']` | `--chart-warning` | [tokens.css:416](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:416) |

### `--harvest-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-500` | [tokens.css:27](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:27) |
| `:root, [data-theme='light']` | `--color-accent-harvest` | [tokens.css:272](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:272) |
| `:root, [data-theme='light']` | `--chart-3` | [tokens.css:325](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:325) |

### `--harvest-600`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-600` | [tokens.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:26) |
| `:root, [data-theme='light']` | `--chart-warning` | [tokens.css:339](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:339) |

### `--harvest-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--yellow-900` | [tokens.css:23](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:23) |
| `:root` | `--yellow-800` | [tokens.css:24](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:24) |
| `:root` | `--yellow-700` | [tokens.css:25](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:25) |
| `:root, [data-theme='light']` | `--color-accent-harvest-strong` | [tokens.css:273](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:273) |
| `:root, [data-theme='light']` | `--chart-3-stroke` | [tokens.css:331](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:331) |

### `--home-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-records :is(select, input)` | `border` | [harvest-records.css:87](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:87) |
| `.harvest-record-pagination button` | `border-color` | [harvest-records.css:263](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:263) |
| `.harvest-generation-step:not(.harvest-print-step)::after` | `background` | [harvest-tickets.css:86](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:86) |
| `.harvest-step-number` | `border` | [harvest-tickets.css:95](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:95) |
| `.harvest-generation-step input` | `border` | [harvest-tickets.css:127](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:127) |
| `.harvest-generation-result-list li` | `border-bottom` | [harvest-tickets.css:286](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:286) |
| `.harvest-ticket-restricted` | `border` | [harvest-tickets.css:295](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:295) |
| `.harvest-ticket-inventory-filters input, .harvest-ticket-inventory-filters select` | `border` | [harvest-tickets.css:329](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:329) |
| `.harvest-ticket-filters input, .harvest-ticket-filters select` | `border` | [harvest-tickets.css:357](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:357) |
| `.portal-shell .header` | `border` | [home.css:57](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:57) |
| `.portal-shell .user-menu-panel` | `border-color` | [home.css:118](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:118) |
| `.portal-shell .tenant-control select` | `border-color` | [home.css:126](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:126) |
| `.portal-shell .navigation-rail` | `border` | [home.css:134](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:134) |
| `.portal-shell .navigation-panel` | `border-color` | [home.css:181](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:181) |
| `.figma-home :is(.home-report-select, .home-campaign-select) select` | `border` | [home.css:303](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:303) |
| `.portal-shell .header .menu-button` | `border-color` | [home.css:594](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:594) |
| `.subscription-page .subscription-button` | `border` | [subscription.css:44](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:44) |
| `.subscription-card` | `border` | [subscription.css:62](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:62) |
| `.subscription-plan-heading` | `border-bottom` | [subscription.css:97](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:97) |
| `.subscription-module-list > li` | `border` | [subscription.css:169](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:169) |
| `.subscription-module-option` | `border` | [subscription.css:194](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:194) |
| `.subscription-billing dl > div` | `border-top` | [subscription.css:224](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:224) |
| `.subscription-payments :is(th, td)` | `border-color` | [subscription.css:257](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:257) |
| `.subscription-page :is(.commercial-form, .commercial-audit, .commercial-future)` | `border-color` | [subscription.css:286](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:286) |
| `.subscription-management .commercial-form fieldset` | `border-color` | [subscription.css:293](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:293) |
| `.subscription-page .commercial-form :is(input:not([type='checkbox']), select, textarea)` | `border` | [subscription.css:298](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:298) |
| `.access-account-card, .access-editor-card` | `border` | [user-access-editor.css:32](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:32) |
| `:is(.user-access-editor, .invitation-card) .access-field :is(input, select)` | `border` | [user-access-editor.css:113](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:113) |
| `.access-check input[type='checkbox']:checked` | `border` | [user-access-editor.css:178](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:178) |
| `.invitation-card` | `border` | [user-access-editor.css:259](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:259) |
| `.users-access-toolbar :is(input, select)` | `border` | [users-access.css:60](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:60) |
| `.users-access-pagination button` | `border-color` | [users-access.css:182](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:182) |
| `.workers-toolbar :is(input, select)` | `border` | [workers.css:64](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:64) |
| `.workers-summary > :is(div, button)` | `border` | [workers.css:105](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:105) |

### `--home-canvas`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-ticket-table td` | `background` | [harvest-tickets.css:495](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:495) |
| `.portal-shell` | `background` | [home.css:15](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:15) |

### `--home-card`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.portal-shell .avatar` | `background` | [home.css:113](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:113) |
| `.portal-shell .rail-entry .rail-collection:hover, .portal-shell .rail-entry .rail-collection.is-selected` | `background` | [home.css:166](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:166) |
| `.figma-home :is(.home-production, .home-top-worker)` | `background` | [home.css:351](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:351) |
| `.figma-home .home-activity` | `background` | [home.css:514](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:514) |
| `.subscription-page .subscription-button` | `background` | [subscription.css:46](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:46) |
| `.subscription-page .subscription-button:hover:not(:disabled)` | `background` | [subscription.css:55](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:55) |
| `.subscription-page .badge` | `background` | [subscription.css:79](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:79) |
| `.subscription-payments th` | `background` | [subscription.css:250](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:250) |
| `.access-inherited li` | `background` | [user-access-editor.css:212](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:212) |
| `.invitation-card .access-module-chips .access-check` | `background` | [user-access-editor.css:295](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:295) |

### `--home-gold`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-home .home-today > span` | `color` | [home.css:386](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:386) |
| `.figma-home .home-today > strong` | `color` | [home.css:399](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:399) |

### `--home-link`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-home .home-link` | `color` | [home.css:405](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:405) |
| `.subscription-module-link` | `color` | [subscription.css:215](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:215) |
| `.workers-summary .icon` | `color` | [workers.css:115](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:115) |
| `.workers-table .workers-person` | `color` | [workers.css:163](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:163) |

### `--home-muted`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-record-updated p` | `color` | [harvest-records.css:112](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:112) |
| `.harvest-records .harvest-clear-filters` | `color` | [harvest-records.css:194](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:194) |
| `.harvest-record-count` | `color` | [harvest-records.css:199](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:199) |
| `.harvest-number-arrows button, .harvest-number-arrows button:hover:not(:disabled), .harvest-number-arrows button:active:not(:disabled), .harvest-number-arrows button:disabled` | `color` | [harvest-tickets.css:171](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:171) |
| `.harvest-generation-reset` | `color` | [harvest-tickets.css:242](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:242) |
| `.harvest-generation-status p` | `color` | [harvest-tickets.css:271](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:271) |
| `.harvest-generation-result-list` | `color` | [harvest-tickets.css:281](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:281) |
| `.harvest-ticket-restricted p` | `color` | [harvest-tickets.css:305](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:305) |
| `.harvest-ticket-inventory-filters label` | `color` | [harvest-tickets.css:320](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:320) |
| `.harvest-ticket-updated p` | `color` | [harvest-tickets.css:378](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:378) |
| `.harvest-ticket-state select` | `color` | [harvest-tickets.css:438](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:438) |
| `.harvest-ticket-count` | `color` | [harvest-tickets.css:449](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:449) |
| `.portal-shell .avatar` | `color` | [home.css:112](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:112) |
| `.figma-home .home-updated p` | `color` | [home.css:328](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:328) |
| `.figma-home :is(.home-production, .home-top-worker) h3` | `color` | [home.css:364](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:364) |
| `.figma-home .home-production-values dt, .figma-home .home-today > span` | `color` | [home.css:382](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:382) |
| `.figma-home .home-no-production` | `color` | [home.css:415](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:415) |
| `.figma-home .home-winner-score dt` | `color` | [home.css:475](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:475) |
| `.figma-home .home-activity h3` | `color` | [home.css:519](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:519) |
| `.figma-home .home-activity time` | `color` | [home.css:528](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:528) |
| `.figma-home .home-top-worker .empty-state` | `color` | [home.css:533](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:533) |
| `.subscription-description` | `color` | [subscription.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:20) |
| `.subscription-toolbar > p` | `color` | [subscription.css:35](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:35) |
| `.subscription-card h2` | `color` | [subscription.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:69) |
| `.subscription-facts dt` | `color` | [subscription.css:135](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:135) |
| `.subscription-readonly` | `color` | [subscription.css:147](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:147) |
| `.subscription-modules-note, .subscription-muted, .subscription-module-option > p` | `color` | [subscription.css:178](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:178) |
| `.subscription-modules h3` | `color` | [subscription.css:186](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:186) |
| `.subscription-billing dt` | `color` | [subscription.css:227](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:227) |
| `.subscription-payments th` | `color` | [subscription.css:251](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:251) |
| `.subscription-payments .subscription-payments-empty` | `color` | [subscription.css:263](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:263) |
| `.subscription-details > summary` | `color` | [subscription.css:275](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:275) |
| `.access-breadcrumb` | `color` | [user-access-editor.css:12](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:12) |
| `.access-description` | `color` | [user-access-editor.css:28](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:28) |
| `.access-account-card h2, .access-editor-card h2` | `color` | [user-access-editor.css:51](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:51) |
| `.access-account-card p` | `color` | [user-access-editor.css:58](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:58) |
| `.access-field` | `color` | [user-access-editor.css:92](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:92) |
| `:is(.user-access-editor, .invitation-card) small` | `color` | [user-access-editor.css:127](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:127) |
| `.access-modules legend, .access-scope legend` | `color` | [user-access-editor.css:144](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:144) |
| `.access-inherited > p` | `color` | [user-access-editor.css:198](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:198) |
| `.access-inherited li` | `color` | [user-access-editor.css:213](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:213) |
| `.access-message, .access-warning` | `color` | [user-access-editor.css:250](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:250) |
| `.users-access-description` | `color` | [users-access.css:33](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:33) |
| `.users-access-pagination` | `color` | [users-access.css:176](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:176) |
| `.workers-list-heading` | `color` | [workers.css:127](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:127) |
| `.workers-pagination > span` | `color` | [workers.css:197](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:197) |

### `--home-shell`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-records :is(select, input)` | `background` | [harvest-records.css:89](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:89) |
| `.harvest-record-table tbody tr:hover td` | `background` | [harvest-records.css:250](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:250) |
| `.harvest-record-pagination button` | `background` | [harvest-records.css:262](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:262) |
| `.harvest-generation-step input` | `background` | [harvest-tickets.css:129](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:129) |
| `.harvest-ticket-restricted` | `background` | [harvest-tickets.css:297](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:297) |
| `.harvest-ticket-inventory-filters input, .harvest-ticket-inventory-filters select` | `background` | [harvest-tickets.css:331](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:331) |
| `.harvest-ticket-filters input, .harvest-ticket-filters select` | `background` | [harvest-tickets.css:359](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:359) |
| `.portal-shell .header` | `background` | [home.css:56](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:56) |
| `.portal-shell select option` | `background` | [home.css:92](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:92) |
| `.portal-shell .user-menu-panel` | `background` | [home.css:117](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:117) |
| `.portal-shell .tenant-control select` | `background` | [home.css:125](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:125) |
| `.portal-shell .navigation-rail` | `background` | [home.css:136](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:136) |
| `.portal-shell .navigation-panel` | `background` | [home.css:179](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:179) |
| `.figma-home :is(.home-report-select, .home-campaign-select) select` | `background` | [home.css:305](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:305) |
| `.figma-home [role='alert']` | `background` | [home.css:537](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:537) |
| `.portal-shell .header .menu-button` | `background` | [home.css:595](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:595) |
| `.subscription-page .subscription-refresh` | `background` | [subscription.css:58](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:58) |
| `.subscription-card` | `background` | [subscription.css:64](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:64) |
| `.subscription-page :is(.commercial-form, .commercial-audit, .commercial-future)` | `background` | [subscription.css:284](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:284) |
| `.subscription-page .commercial-form :is(input:not([type='checkbox']), select, textarea)` | `background` | [subscription.css:300](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:300) |
| `.access-account-card, .access-editor-card` | `background` | [user-access-editor.css:34](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:34) |
| `:is(.user-access-editor, .invitation-card) .access-field :is(input, select)` | `background` | [user-access-editor.css:115](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:115) |
| `:is(.user-access-editor, .invitation-card) :is(.access-submit, .access-cancel)` | `background` | [user-access-editor.css:237](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:237) |
| `.invitation-card` | `background` | [user-access-editor.css:261](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:261) |
| `.invitation-card .access-module-chips .access-check input::after` | `background` | [user-access-editor.css:317](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:317) |
| `.users-access-toolbar :is(input, select)` | `background` | [users-access.css:62](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:62) |
| `.users-access-table tbody tr:hover td` | `background` | [users-access.css:161](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:161) |
| `.users-access-pagination button` | `background` | [users-access.css:180](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:180) |
| `.workers-toolbar :is(input, select)` | `background` | [workers.css:66](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:66) |
| `.workers-summary > :is(div, button)` | `background` | [workers.css:108](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:108) |

### `--home-text`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-records :is(select, input)` | `color` | [harvest-records.css:90](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:90) |
| `.harvest-record-search input::placeholder` | `color` | [harvest-records.css:136](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:136) |
| `.harvest-date-placeholder` | `color` | [harvest-records.css:178](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:178) |
| `.harvest-record-pagination button` | `color` | [harvest-records.css:261](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:261) |
| `.harvest-records [role='alert']` | `color` | [harvest-records.css:270](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:270) |
| `.harvest-tickets-page` | `color` | [harvest-tickets.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:4) |
| `.harvest-ticket-tab` | `color` | [harvest-tickets.css:41](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:41) |
| `.harvest-step-number` | `color` | [harvest-tickets.css:98](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:98) |
| `.harvest-generation-step input` | `color` | [harvest-tickets.css:130](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:130) |
| `.harvest-print-step .harvest-print-reveal button` | `color` | [harvest-tickets.css:216](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:216) |
| `.harvest-generation-result-list a` | `color` | [harvest-tickets.css:289](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:289) |
| `.harvest-ticket-inventory-filters input, .harvest-ticket-inventory-filters select` | `color` | [harvest-tickets.css:332](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:332) |
| `.harvest-ticket-filters input, .harvest-ticket-filters select` | `color` | [harvest-tickets.css:360](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:360) |
| `.harvest-ticket-search input::placeholder` | `color` | [harvest-tickets.css:365](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:365) |
| `.portal-shell` | `color` | [home.css:16](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:16) |
| `.portal-shell .header` | `color` | [home.css:59](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:59) |
| `.portal-shell .theme-switcher` | `color` | [home.css:74](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:74) |
| `.portal-shell .theme-switcher select` | `color` | [home.css:80](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:80) |
| `.portal-shell select option` | `color` | [home.css:91](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:91) |
| `.portal-shell .user-menu-trigger` | `color` | [home.css:98](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:98) |
| `.portal-shell .user-menu-panel` | `color` | [home.css:116](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:116) |
| `.portal-shell .tenant-control select` | `color` | [home.css:124](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:124) |
| `.portal-shell .rail-entry .rail-collection` | `color` | [home.css:155](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:155) |
| `.portal-shell .navigation-panel` | `color` | [home.css:180](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:180) |
| `.figma-home :is(.home-report-select, .home-campaign-select) select` | `color` | [home.css:306](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:306) |
| `.figma-home .home-updated button` | `color` | [home.css:334](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:334) |
| `.portal-shell .header .menu-button` | `color` | [home.css:593](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:593) |
| `.subscription-page` | `color` | [subscription.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:10) |
| `.subscription-page .subscription-button` | `color` | [subscription.css:47](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:47) |
| `.subscription-page .badge` | `color` | [subscription.css:78](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:78) |
| `.subscription-module-option > summary` | `color` | [subscription.css:205](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:205) |
| `.subscription-billing dd` | `color` | [subscription.css:234](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:234) |
| `.subscription-page :is(.commercial-form, .commercial-audit, .commercial-future)` | `color` | [subscription.css:285](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:285) |
| `.subscription-page .commercial-form :is(input:not([type='checkbox']), select, textarea)` | `color` | [subscription.css:301](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:301) |
| `.user-access-editor, .invitation-card` | `color` | [user-access-editor.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:4) |
| `:is(.user-access-editor, .invitation-card) .access-field :is(input, select)` | `color` | [user-access-editor.css:116](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:116) |
| `.access-check` | `color` | [user-access-editor.css:157](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:157) |
| `:is(.user-access-editor, .invitation-card) :is(.access-submit, .access-cancel)` | `color` | [user-access-editor.css:236](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:236) |
| `.users-access-page` | `color` | [users-access.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:21) |
| `.users-access-toolbar :is(input, select)` | `color` | [users-access.css:63](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:63) |
| `.users-search input::placeholder` | `color` | [users-access.css:74](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:74) |
| `.users-access-pagination button` | `color` | [users-access.css:181](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:181) |
| `.workers-page` | `color` | [workers.css:2](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:2) |
| `.workers-toolbar :is(input, select)` | `color` | [workers.css:67](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:67) |
| `.workers-summary > :is(div, button)` | `color` | [workers.css:109](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:109) |

### `--home-winner`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-home .home-winner-name` | `background` | [home.css:432](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:432) |
| `.subscription-page .subscription-button:hover:not(:disabled)` | `border-color` | [subscription.css:54](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:54) |
| `.subscription-page .badge.success` | `background` | [subscription.css:88](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:88) |
| `.subscription-page .commercial-form input[type='checkbox']` | `accent-color` | [subscription.css:307](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:307) |
| `.subscription-page .commercial-form button` | `background` | [subscription.css:312](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:312) |
| `:is(.user-access-editor, .invitation-card) .access-check input` | `accent-color` | [user-access-editor.css:167](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:167) |
| `.access-check input[type='checkbox']:checked` | `background` | [user-access-editor.css:180](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:180) |
| `:is(.user-access-editor, .invitation-card) .access-submit` | `background` | [user-access-editor.css:241](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:241) |
| `:is(.user-access-editor, .invitation-card) .access-submit:hover:not(:disabled)` | `background` | [user-access-editor.css:245](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:245) |
| `.invitation-card .access-module-chips .access-check input` | `background` | [user-access-editor.css:307](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:307) |
| `.users-access-toolbar .users-invite` | `background` | [users-access.css:104](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:104) |

### `--info-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.notice, p[role='alert']` | `background` | [styles.css:225](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:225) |
| `.status-badge.info` | `background` | [styles.css:885](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:885) |

### `--info-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.notice, p[role='alert']` | `border` | [styles.css:223](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:223) |
| `.status-badge.info` | `border-color` | [styles.css:887](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:887) |

### `--info-fg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.comparison-availability .icon` | `color` | [redesign.css:674](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:674) |
| `.notice, p[role='alert']` | `color` | [styles.css:226](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:226) |
| `.status-badge.info` | `color` | [styles.css:886](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:886) |

### `--info-strong`

Sin referencias directas.

### `--muted`

Sin referencias directas.

### `--neutral-050`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-surface-page` | [tokens.css:292](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:292) |

### `--neutral-075`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-surface-canvas` | [tokens.css:291](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:291) |

### `--neutral-100`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-surface-subtle` | [tokens.css:294](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:294) |

### `--neutral-150`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-border-subtle` | [tokens.css:298](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:298) |

### `--neutral-200`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--neutral-250` | [tokens.css:91](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:91) |
| `:root, [data-theme='light']` | `--color-border-default` | [tokens.css:299](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:299) |

### `--neutral-250`

Sin referencias directas.

### `--neutral-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-border-strong` | [tokens.css:300](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:300) |

### `--neutral-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-text-disabled` | [tokens.css:289](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:289) |

### `--neutral-500`

Sin referencias directas.

### `--neutral-600`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-text-tertiary` | [tokens.css:287](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:287) |
| `:root, [data-theme='light']` | `--chart-axis` | [tokens.css:336](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:336) |

### `--neutral-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-text-secondary` | [tokens.css:286](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:286) |
| `:root, [data-theme='light']` | `--chart-label` | [tokens.css:337](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:337) |

### `--neutral-800`

Sin referencias directas.

### `--neutral-900`

Sin referencias directas.

### `--neutral-950`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-text-primary` | [tokens.css:285](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:285) |

### `--records-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-record-table :is(th, td)` | `border-right` | [harvest-records.css:224](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:224) |
| `.harvest-record-table :is(th, td)` | `border-bottom` | [harvest-records.css:225](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:225) |
| `.harvest-ticket-table th, .harvest-ticket-table td` | `border-right` | [harvest-tickets.css:477](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:477) |
| `.harvest-ticket-table th, .harvest-ticket-table td` | `border-bottom` | [harvest-tickets.css:478](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:478) |
| `.workers-table :is(th, td)` | `border-bottom` | [workers.css:142](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:142) |
| `.workers-table :is(th, td)` | `border-right` | [workers.css:143](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:143) |

### `--records-head`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-record-table th` | `background` | [harvest-records.css:235](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:235) |
| `.harvest-ticket-table th` | `background` | [harvest-tickets.css:485](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:485) |
| `.workers-table th` | `background` | [workers.css:146](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:146) |

### `--records-table-text`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-records .harvest-record-table` | `color` | [harvest-records.css:219](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:219) |
| `.harvest-ticket-table` | `color` | [harvest-tickets.css:468](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:468) |
| `.workers-table` | `color` | [workers.css:138](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:138) |

### `--red-050`

Sin referencias directas.

### `--red-100`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--error-bg` | [tokens.css:313](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:313) |

### `--red-200`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--error-border` | [tokens.css:315](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:315) |
| `[data-theme='dark']` | `--error-strong` | [tokens.css:393](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:393) |

### `--red-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--error-fg` | [tokens.css:391](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:391) |

### `--red-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--error-border` | [tokens.css:392](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:392) |

### `--red-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--error-bg` | [tokens.css:390](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:390) |

### `--red-600`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--error-fg` | [tokens.css:314](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:314) |

### `--red-700`

Sin referencias directas.

### `--red-800`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--error-strong` | [tokens.css:316](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:316) |

### `--red-900`

Sin referencias directas.

### `--series-color`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.comparison-chips li` | `box-shadow` | [redesign.css:625](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:625) |
| `.comparison-bar .bar-fill` | `background` | [redesign.css:742](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:742) |

### `--series-stroke`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.series-index` | `border` | [redesign.css:711](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:711) |
| `.series-index` | `color` | [redesign.css:712](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:712) |
| `.comparison-bar .bar-fill` | `box-shadow` | [redesign.css:743](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:743) |

### `--shadow-lg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.worker-drawer` | `box-shadow` | [workers.css:214](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:214) |

### `--shadow-md`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.rail-tooltip` | `box-shadow` | [redesign.css:94](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:94) |
| `.navigation-panel` | `box-shadow` | [redesign.css:125](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:125) |
| `.chart-tooltip` | `box-shadow` | [redesign.css:753](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:753) |
| `.sidebar:hover, .sidebar:focus-within, .sidebar.is-pinned, .sidebar.is-open` | `box-shadow` | [styles.css:339](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:339) |
| `.user-menu-panel` | `box-shadow` | [styles.css:500](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:500) |

### `--shadow-sm`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.navigation-rail` | `box-shadow` | [redesign.css:29](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:29) |

### `--shadow-xl`

Sin referencias directas.

### `--shadow-xs`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.period-selector button[aria-pressed='true']` | `box-shadow` | [redesign.css:451](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/redesign.css:451) |
| `.management-filterbar` | `box-shadow` | [styles.css:628](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:628) |
| `.management-table` | `box-shadow` | [styles.css:645](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:645) |
| `.detail-hero` | `box-shadow` | [styles.css:677](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:677) |
| `.report-secondary-nav` | `box-shadow` | [styles.css:751](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:751) |
| `.internal-report-context` | `box-shadow` | [styles.css:810](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:810) |
| `.content-card, .chart-card` | `box-shadow` | [styles.css:839](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:839) |

### `--sidebar-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-navigation .navigation-rail` | `background` | [sidebar.css:40](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:40) |
| `.figma-navigation .navigation-panel` | `background` | [sidebar.css:106](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:106) |
| `.figma-navigation.suite-navigation.is-open` | `background` | [sidebar.css:270](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:270) |

### `--sidebar-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-navigation .navigation-rail` | `border` | [sidebar.css:38](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:38) |
| `.figma-navigation .navigation-panel` | `border` | [sidebar.css:103](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:103) |
| `.figma-navigation .navigation-routes` | `border-color` | [sidebar.css:147](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:147) |
| `.figma-navigation .sidebar-tree-line` | `background` | [sidebar.css:173](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:173) |

### `--sidebar-heading`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-navigation .rail-entry .rail-collection:is(.is-selected, :hover), .figma-navigation .rail-entry .rail-collection.is-active:not([aria-label='Inicio'])` | `color` | [sidebar.css:79](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:79) |
| `.figma-navigation .navigation-panel-heading strong` | `color` | [sidebar.css:118](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:118) |
| `.figma-navigation .navigation-module-link:is(:hover, [aria-expanded='true']), .figma-navigation .is-active-module > .navigation-module-link` | `color` | [sidebar.css:144](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:144) |
| `.figma-navigation .sidebar-tickets-toggle:is([aria-expanded='true'], :hover, :active, .is-active)` | `color` | [sidebar.css:214](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:214) |

### `--sidebar-selected`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-navigation .rail-entry .rail-collection:is(.is-selected, :hover), .figma-navigation .rail-entry .rail-collection.is-active:not([aria-label='Inicio'])` | `background` | [sidebar.css:80](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:80) |
| `.figma-navigation .navigation-module-link:is(:hover, [aria-expanded='true']), .figma-navigation .is-active-module > .navigation-module-link` | `background` | [sidebar.css:143](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:143) |
| `.figma-navigation .navigation-routes a.active` | `background` | [sidebar.css:153](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:153) |
| `.figma-navigation .sidebar-harvest-routes > a:is(:hover, :focus-visible), .figma-navigation .sidebar-ticket-routes a:is(:hover, :focus-visible)` | `background` | [sidebar.css:191](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:191) |
| `.figma-navigation .sidebar-tickets-toggle:is([aria-expanded='true'], :hover, :active, .is-active)` | `background` | [sidebar.css:215](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:215) |
| `.figma-navigation .sidebar-settings-links a:is(:hover, .active)` | `background` | [sidebar.css:254](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:254) |

### `--sidebar-text`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.figma-navigation.suite-navigation` | `color` | [sidebar.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:26) |
| `.figma-navigation .rail-entry .rail-collection` | `color` | [sidebar.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:69) |
| `.figma-navigation .rail-pin` | `color` | [sidebar.css:94](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:94) |
| `.figma-navigation .navigation-panel` | `color` | [sidebar.css:105](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:105) |
| `.figma-navigation .navigation-module-link` | `color` | [sidebar.css:138](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:138) |
| `.figma-navigation .navigation-routes a` | `color` | [sidebar.css:150](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:150) |
| `.figma-navigation .navigation-routes a.active` | `color` | [sidebar.css:155](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:155) |
| `.figma-navigation .sidebar-tickets-toggle` | `color` | [sidebar.css:206](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:206) |
| `.figma-navigation .sidebar-settings-links a` | `color` | [sidebar.css:249](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:249) |
| `.figma-navigation .drawer-close` | `color` | [sidebar.css:310](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:310) |

### `--sky-050`

Sin referencias directas.

### `--sky-100`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--info-bg` | [tokens.css:317](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:317) |

### `--sky-200`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--info-border` | [tokens.css:319](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:319) |
| `[data-theme='dark']` | `--info-strong` | [tokens.css:397](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:397) |

### `--sky-300`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `[data-theme='dark']` | `--info-fg` | [tokens.css:395](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:395) |

### `--sky-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--chart-6-dark` | [tokens.css:252](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:252) |
| `[data-theme='dark']` | `--color-accent-sky` | [tokens.css:358](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:358) |
| `[data-theme='dark']` | `--info-border` | [tokens.css:396](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:396) |

### `--sky-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-sky` | [tokens.css:281](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:281) |
| `:root, [data-theme='light']` | `--chart-6` | [tokens.css:328](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:328) |
| `[data-theme='dark']` | `--info-bg` | [tokens.css:394](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:394) |

### `--sky-600`

Sin referencias directas.

### `--sky-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--info-fg` | [tokens.css:318](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:318) |
| `:root, [data-theme='light']` | `--chart-6-stroke` | [tokens.css:334](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:334) |

### `--sky-800`

Sin referencias directas.

### `--sky-900`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--info-strong` | [tokens.css:320](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:320) |

### `--soil-050`

Sin referencias directas.

### `--soil-100`

Sin referencias directas.

### `--soil-200`

Sin referencias directas.

### `--soil-300`

Sin referencias directas.

### `--soil-400`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root` | `--chart-4-dark` | [tokens.css:250](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:250) |
| `[data-theme='dark']` | `--color-accent-soil` | [tokens.css:359](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:359) |

### `--soil-500`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-accent-soil` | [tokens.css:282](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:282) |
| `:root, [data-theme='light']` | `--chart-4` | [tokens.css:326](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:326) |

### `--soil-600`

Sin referencias directas.

### `--soil-700`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--chart-4-stroke` | [tokens.css:332](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:332) |

### `--soil-800`

Sin referencias directas.

### `--soil-900`

Sin referencias directas.

### `--success-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.success` | `background` | [styles.css:875](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:875) |

### `--success-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.success` | `border-color` | [styles.css:877](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:877) |

### `--success-fg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.success` | `color` | [styles.css:876](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:876) |

### `--success-strong`

Sin referencias directas.

### `--ticket-active`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-ticket-tab:is(:hover, :focus-visible, .is-active)` | `background` | [harvest-tickets.css:49](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:49) |

### `--ticket-status`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-generation-status` | `background` | [harvest-tickets.css:254](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:254) |

### `--ticket-step`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-step-number` | `background` | [harvest-tickets.css:97](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:97) |

### `--ticket-step-complete`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-generation-step.is-complete .harvest-step-number` | `background` | [harvest-tickets.css:106](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:106) |

### `--ticket-track`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.harvest-ticket-tabs` | `background` | [harvest-tickets.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:26) |

### `--users-table-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.users-access-table :is(th, td)` | `border-right` | [users-access.css:133](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:133) |
| `.users-access-table :is(th, td)` | `border-bottom` | [users-access.css:134](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:134) |

### `--users-table-head`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.access-account-status` | `background` | [user-access-editor.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:69) |
| `.users-access-table th` | `background` | [users-access.css:144](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:144) |

### `--users-table-text`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.users-access-table` | `color` | [users-access.css:128](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:128) |

### `--warning-bg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.warning` | `background` | [styles.css:880](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:880) |

### `--warning-border`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.warning` | `border-color` | [styles.css:882](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:882) |

### `--warning-fg`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `.status-badge.warning` | `color` | [styles.css:881](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/styles.css:881) |

### `--warning-strong`

Sin referencias directas.

### `--white`

| Selector | Propiedad o variable receptora | Ubicación |
| --- | --- | --- |
| `:root, [data-theme='light']` | `--color-text-inverse` | [tokens.css:288](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:288) |
| `:root, [data-theme='light']` | `--color-surface-card` | [tokens.css:293](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:293) |
| `:root, [data-theme='light']` | `--color-surface-raised` | [tokens.css:295](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:295) |
| `:root, [data-theme='light']` | `--glass-bg` | [tokens.css:304](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:304) |
| `[data-theme='dark']` | `--color-context-environment-foreground` | [tokens.css:399](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:399) |
| `.workers-page .workers-register` | `color` | [workers.css:23](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:23) |

### `--yellow-050`

Sin referencias directas.

### `--yellow-100`

Sin referencias directas.

### `--yellow-200`

Sin referencias directas.

### `--yellow-300`

Sin referencias directas.

### `--yellow-400`

Sin referencias directas.

### `--yellow-500`

Sin referencias directas.

### `--yellow-600`

Sin referencias directas.

### `--yellow-700`

Sin referencias directas.

### `--yellow-800`

Sin referencias directas.

### `--yellow-900`

Sin referencias directas.

## Todos los colores literales y sus ubicaciones

Los HEX abreviados se normalizan a seis u ocho dígitos. La opacidad aplicada en reglas o grupos SVG se revisa en su archivo; no se mezcla automáticamente con el fondo. La lista incluye sombras, superposiciones, gradientes y colores de iconos.

| Color | Ubicaciones |
| --- | --- |
| `#090F0B` | [home.css:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:3), [login.css:82](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:82), [login.css:112](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:112), [tokens.css:98](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:98) |
| `#0C1310` | [home.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:4), [login.css:29](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:29), [login.css:168](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:168), [login.css:240](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:240), [login.css:328](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:328), [sidebar.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:7) |
| `#0C5557` | [tokens.css:33](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:33) |
| `#0D1410` | [tokens.css:99](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:99) |
| `#101812` | [tokens.css:100](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:100) |
| `#102A1D` | [harvest-tickets.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:9), [home.css:193](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:193), [home.css:207](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:207), [home.css:751](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:751), [tokens.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:4) |
| `#102A1D33` | [home.css:751](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:751) |
| `#102A1DD9` | [home.css:751](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:751) |
| `#121A15` | [tokens.css:101](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:101) |
| `#12696B` | [tokens.css:34](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:34) |
| `#141C18` | [home.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:5), [sidebar.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:8), [records-tab.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/records-tab.svg:7), [reports-tab.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/reports-tab.svg:7), [tickets-tab.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets-tab.svg:7), [records-tab.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/records-tab.svg:7), [reports-tab.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/reports-tab.svg:7), [tickets-tab.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/tickets-tab.svg:7) |
| `#15271B` | [harvest-records.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:10), [home.css:24](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:24), [sidebar.css:18](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:18), [users-access.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:10) |
| `#155232` | [tokens.css:308](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:308) |
| `#166D37` | [home.css:26](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:26) |
| `#17201A` | [tokens.css:83](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:83) |
| `#173F2B` | [tokens.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:5) |
| `#17443D` | [tokens.css:233](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:233) |
| `#174740` | [home.css:247](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:247) |
| `#177F81` | [tokens.css:35](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:35) |
| `#18221C` | [tokens.css:102](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:102) |
| `#1A1F0D` | [home.css:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:6) |
| `#1E2A22` | [tokens.css:103](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:103) |
| `#1F2A23` | [tokens.css:84](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:84) |
| `#1F5A3A` | [tokens.css:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:6) |
| `#1F6B43` | [tokens.css:306](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:306) |
| `#1F7375` | [tokens.css:234](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:234) |
| `#227271` | [home.css:248](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:248) |
| `#233129` | [login.css:166](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:166), [login.css:286](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:286), [login.css:302](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:302) |
| `#239698` | [tokens.css:36](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:36) |
| `#24352B` | [login.css:27](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:27), [login.css:58](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:58) |
| `#26332B` | [tokens.css:104](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:104) |
| `#263F5D` | [tokens.css:43](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:43) |
| `#26734A` | [tokens.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:7) |
| `#26CE5F` | [home.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:9), [arrow.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/arrow.svg:3), [arrow.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/arrow.svg:4) |
| `#281612` | [login.css:319](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:319) |
| `#294137` | [harvest-tickets.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:7) |
| `#2D3932` | [tokens.css:85](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:85) |
| `#2F4E72` | [tokens.css:44](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:44) |
| `#2F8A57` | [tokens.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:8) |
| `#2FAFB0` | [tokens.css:37](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:37) |
| `#303030` | [harvest-records.css:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:3), [users-access.css:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:3) |
| `#326227` | [harvest-tickets.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:8) |
| `#365F8A` | [tokens.css:45](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:45) |
| `#3A9C66` | [tokens.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:9) |
| `#3B316B` | [tokens.css:63](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:63) |
| `#405C47` | [home.css:25](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:25), [sidebar.css:19](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:19) |
| `#426D9A` | [tokens.css:46](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:46) |
| `#42BFC0` | [tokens.css:228](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:228) |
| `#46534B` | [tokens.css:86](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:86) |
| `#493D82` | [tokens.css:64](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:64) |
| `#4B5A51` | [tokens.css:105](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:105) |
| `#4CB617` | [harvest-tickets.css:146](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:146), [harvest-tickets.css:215](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:215), [harvest-tickets.css:228](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:228) |
| `#4F7CAC` | [tokens.css:47](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:47) |
| `#52C0C0` | [tokens.css:38](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:38) |
| `#56B77A` | [tokens.css:343](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:343) |
| `#57499B` | [tokens.css:65](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:65) |
| `#5D6A62` | [tokens.css:87](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:87) |
| `#635D2E` | [home.css:249](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:249) |
| `#65311F` | [tokens.css:53](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:53) |
| `#6657B1` | [tokens.css:66](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:66) |
| `#68B286` | [tokens.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:10) |
| `#69BB88` | [tokens.css:247](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:247) |
| `#6A5B27` | [tokens.css:235](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:235) |
| `#6A7116` | [harvest-records.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:9), [users-access.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:9) |
| `#6AC68B` | [tokens.css:344](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:344) |
| `#6E211A` | [tokens.css:73](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:73) |
| `#6E93BC` | [tokens.css:48](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:48) |
| `#713A31` | [login.css:320](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:320) |
| `#748078` | [tokens.css:88](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:88) |
| `#76CFCE` | [tokens.css:39](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:39) |
| `#7767C7` | [tokens.css:67](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:67) |
| `#777B19` | [harvest-records.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:4), [login.css:179](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:179), [login.css:247](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:247), [login.css:269](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:269), [users-access.css:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:4), [records-tab.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/records-tab.svg:3), [reports-tab.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/reports-tab.svg:3), [tickets-tab.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets-tab.svg:3), [records-tab.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/records-tab.svg:3), [reports-tab.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/reports-tab.svg:3), [tickets-tab.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/tickets-tab.svg:3) |
| `#78867E` | [tokens.css:106](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:106) |
| `#7A5A16` | [tokens.css:276](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:276) |
| `#7D3D27` | [tokens.css:54](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:54) |
| `#806018` | [home.css:27](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:27) |
| `#83D19D` | [tokens.css:345](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:345) |
| `#842820` | [tokens.css:74](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:74) |
| `#898E1D` | [login.css:275](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:275) |
| `#8CAED1` | [tokens.css:49](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:49) |
| `#8D6A1F` | [tokens.css:16](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:16) |
| `#9184D4` | [tokens.css:68](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:68) |
| `#92A49A` | [login.css:174](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:174), [login.css:204](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:204), [login.css:238](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:238), [login.css:292](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:292), [eye.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/login/eye.svg:3) |
| `#974A2E` | [tokens.css:55](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:55) |
| `#99A39D` | [tokens.css:89](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:89) |
| `#9CCDAF` | [tokens.css:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:11) |
| `#9D3128` | [tokens.css:75](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:75) |
| `#A67C22` | [tokens.css:17](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:17) |
| `#AAA0DE` | [tokens.css:69](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:69) |
| `#AAB7AF` | [tokens.css:107](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:107) |
| `#AF5B38` | [tokens.css:56](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:56) |
| `#AFE5E2` | [tokens.css:40](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:40) |
| `#B1B617` | [home.css:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:11), [login.css:36](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:36), [login.css:59](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:59), [login.css:195](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:195), [login.css:248](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:248), [login.css:335](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:335) |
| `#B63930` | [tokens.css:76](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:76) |
| `#BBDDC7` | [tokens.css:307](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:307) |
| `#BCC5BF` | [tokens.css:90](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:90) |
| `#BCD0E5` | [tokens.css:50](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:50) |
| `#BDE6D4` | [tokens.css:227](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:227) |
| `#BEE6D7` | [home.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:8), [home.css:215](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:215), [home.css:233](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:233), [login.css:23](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:23), [login.css:41](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:41), [login.css:48](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:48), [login.css:218](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:218), [login.css:228](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:228), [login.css:327](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:327) |
| `#C1C945` | [home.css:28](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:28) |
| `#C4473A` | [tokens.css:77](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:77) |
| `#C69A2D` | [tokens.css:18](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:18) |
| `#C96F45` | [tokens.css:57](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:57) |
| `#CBD5CF` | [tokens.css:108](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:108) |
| `#CFC8EC` | [tokens.css:70](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:70) |
| `#CFE6D7` | [tokens.css:12](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:12) |
| `#D0D9CA` | [harvest-records.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:8), [users-access.css:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:8) |
| `#D5E5DB` | [harvest-tickets.css:548](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:548) |
| `#D66B61` | [tokens.css:78](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:78) |
| `#D98965` | [tokens.css:58](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:58) |
| `#DCE4DF` | [tokens.css:92](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:92) |
| `#DDB557` | [tokens.css:19](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:19) |
| `#DDF5F3` | [tokens.css:41](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:41) |
| `#DFE3AD` | [harvest-tickets.css:547](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:547) |
| `#DFEDE4` | [harvest-tickets.css:549](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:549) |
| `#E0E8DB` | [home.css:22](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:22), [sidebar.css:16](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:16) |
| `#E2E2E2` | [harvest-records.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:5), [harvest-records.css:236](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:236), [harvest-tickets.css:486](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:486), [users-access.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:5), [users-access.css:145](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:145) |
| `#E2E9E5` | [tokens.css:109](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:109) |
| `#E3A083` | [tokens.css:59](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:59) |
| `#E5EFF8` | [tokens.css:51](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:51) |
| `#E6938B` | [tokens.css:79](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:79) |
| `#E6ECE8` | [tokens.css:93](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:93) |
| `#E7C97D` | [tokens.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:20) |
| `#E8F4EC` | [tokens.css:13](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:13) |
| `#EAF0DA` | [home.css:23](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:23), [sidebar.css:17](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:17) |
| `#EDF0DC` | [harvest-tickets.css:546](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:546) |
| `#EEEBFA` | [tokens.css:71](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:71) |
| `#EEF1EF` | [tokens.css:296](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:296) |
| `#EEF3F0` | [tokens.css:94](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:94) |
| `#EFC5B2` | [tokens.css:60](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:60) |
| `#F0D58A` | [home.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:10), [tokens.css:350](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:350), [tokens.css:353](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:353) |
| `#F0FBFA` | [tokens.css:42](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:42) |
| `#F1DEB0` | [tokens.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:21) |
| `#F2C1BC` | [tokens.css:80](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:80) |
| `#F2F6F3` | [tokens.css:110](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:110) |
| `#F4E5B7` | [tokens.css:229](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:229) |
| `#F4F6F4` | [tokens.css:95](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:95) |
| `#F4F8FC` | [tokens.css:52](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:52) |
| `#F4FAF6` | [tokens.css:14](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:14) |
| `#F5F8F1` | [home.css:20](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:20) |
| `#F7F5FD` | [tokens.css:72](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:72) |
| `#F8E9E2` | [tokens.css:61](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:61) |
| `#F8F0D8` | [tokens.css:22](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:22) |
| `#F8FAF8` | [tokens.css:96](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:96) |
| `#FBE9E7` | [tokens.css:81](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:81) |
| `#FCF5F1` | [tokens.css:62](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:62) |
| `#FEF5F4` | [tokens.css:82](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:82) |
| `#FFC9BC` | [login.css:318](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:318) |
| `#FFFFFF` | [harvest-records.css:43](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-records.css:43), [harvest-tickets.css:107](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:107), [home.css:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:7), [home.css:21](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:21), [home.css:194](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:194), [home.css:433](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/home.css:433), [login.css:14](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:14), [login.css:30](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:30), [login.css:37](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:37), [login.css:83](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:83), [login.css:146](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:146), [login.css:169](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:169), [login.css:254](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:254), [login.css:270](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/login.css:270), [sidebar.css:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:10), [sidebar.css:15](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:15), [subscription.css:89](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:89), [subscription.css:313](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/subscription.css:313), [tokens.css:97](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:97), [user-access-editor.css:70](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:70), [user-access-editor.css:181](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:181), [user-access-editor.css:242](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:242), [users-access.css:103](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/users-access.css:103), [workers.css:147](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:147), [calendar.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/calendar.svg:3), [calendar.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/calendar.svg:4), [calendar.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/calendar.svg:5), [calendar.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/calendar.svg:6), [calendar.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/calendar.svg:7), [calendar.svg:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/calendar.svg:8), [mark.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/mark.svg:3), [mark.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/mark.svg:4), [mark.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/mark.svg:5), [records-tab.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/records-tab.svg:4), [reports-tab.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/reports-tab.svg:4), [tickets-tab.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets-tab.svg:4), [calendar.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/calendar.svg:3), [calendar.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/calendar.svg:4), [calendar.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/calendar.svg:5), [carriers.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/carriers.svg:3), [carriers.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/carriers.svg:4), [carriers.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/carriers.svg:5), [carriers.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/carriers.svg:6), [chevron.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/chevron.svg:3), [clock.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/clock.svg:3), [clock.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/clock.svg:4), [clock.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/clock.svg:5), [harvesters.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/harvesters.svg:3), [harvesters.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/harvesters.svg:4), [harvesters.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/harvesters.svg:5), [harvesters.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/harvesters.svg:6), [harvesters.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/harvesters.svg:7), [harvesters.svg:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/harvesters.svg:8), [home.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/home.svg:3), [home.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/home.svg:4), [layers.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/layers.svg:3), [layers.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/layers.svg:4), [layers.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/layers.svg:5), [lots.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:3), [lots.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:4), [lots.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:5), [lots.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:6), [lots.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:7), [lots.svg:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:8), [lots.svg:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:9), [lots.svg:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:10), [lots.svg:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:11), [lots.svg:12](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/lots.svg:12), [moon.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/moon.svg:3), [production.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/production.svg:3), [production.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/production.svg:4), [production.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/production.svg:5), [production.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/production.svg:6), [ranking.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/ranking.svg:3), [ranking.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/ranking.svg:4), [ranking.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/ranking.svg:5), [refresh.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/refresh.svg:3), [refresh.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/refresh.svg:4), [refresh.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/refresh.svg:5), [refresh.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/refresh.svg:6), [settings.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/settings.svg:3), [settings.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/settings.svg:4), [varieties.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/varieties.svg:3), [varieties.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/varieties.svg:4), [varieties.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/varieties.svg:5), [weather.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/weather.svg:3), [weather.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/weather.svg:4), [weather.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/weather.svg:5), [weather.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/weather.svg:6), [weather.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/weather.svg:7), [weather.svg:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/home/weather.svg:8), [arrow-right.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/login/arrow-right.svg:3), [chevron.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/sidebar/chevron.svg:3), [harvest.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/sidebar/harvest.svg:3), [harvest.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/sidebar/harvest.svg:4), [select.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/users/select.svg:3), [assignments.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/assignments.svg:3), [assignments.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/assignments.svg:4), [assignments.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/assignments.svg:5), [assignments.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/assignments.svg:6), [generation.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/generation.svg:3), [generation.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/generation.svg:4), [generation.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/generation.svg:5), [lots.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/lots.svg:3), [lots.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/lots.svg:4), [lots.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/lots.svg:5), [lots.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/lots.svg:6), [printing.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/printing.svg:3), [printing.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/printing.svg:4), [printing.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/printing.svg:5), [records-tab.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/records-tab.svg:4), [reports-tab.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/reports-tab.svg:4), [stat-active.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-active.svg:3), [stat-active.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-active.svg:4), [stat-active.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-active.svg:5), [stat-finished.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-finished.svg:3), [stat-finished.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-finished.svg:4), [stat-finished.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-finished.svg:5), [stat-today.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-today.svg:3), [stat-today.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-today.svg:4), [stat-today.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-today.svg:5), [stat-today.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-today.svg:6), [stat-today.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/stat-today.svg:7), [tickets-tab.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/tickets-tab.svg:4), [waiting.svg:3](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:3), [waiting.svg:4](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:4), [waiting.svg:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:5), [waiting.svg:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:6), [waiting.svg:7](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:7), [waiting.svg:8](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:8), [waiting.svg:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:9), [waiting.svg:10](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/assets/harvest/tickets/waiting.svg:10) |
| `rgb(0 0 0 / 0.2)` | [user-access-editor.css:263](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:263) |
| `rgb(0 0 0 / 0.38)` | [user-access-editor.css:266](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/user-access-editor.css:266) |
| `rgb(0 0 0 / 55%)` | [workers.css:217](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/workers.css:217) |
| `rgb(255 255 255 / 76%)` | [sidebar.css:11](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:11) |
| `rgb(66 68 22 / 20%)` | [harvest-tickets.css:5](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:5) |
| `rgb(66 68 22 / 30%)` | [harvest-tickets.css:6](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/harvest-tickets.css:6), [sidebar.css:9](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/sidebar.css:9) |
| `rgba(0, 0, 0, 0.58)` | [tokens.css:380](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:380) |
| `rgba(16, 42, 29, 0.3)` | [tokens.css:303](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:303) |
| `rgba(198, 154, 45, 0.14)` | [tokens.css:351](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:351) |
| `rgba(21, 32, 25, 0.04)` | [tokens.css:165](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:165) |
| `rgba(21, 32, 25, 0.06)` | [tokens.css:166](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:166) |
| `rgba(21, 32, 25, 0.08)` | [tokens.css:167](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:167), [tokens.css:335](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:335) |
| `rgba(21, 32, 25, 0.12)` | [tokens.css:168](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:168) |
| `rgba(21, 32, 25, 0.16)` | [tokens.css:169](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:169) |
| `rgba(221, 181, 87, 0.28)` | [tokens.css:352](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:352) |
| `rgba(223, 231, 226, 0.08)` | [tokens.css:375](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:375) |
| `rgba(223, 231, 226, 0.1)` | [tokens.css:412](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:412) |
| `rgba(223, 231, 226, 0.24)` | [tokens.css:377](C:/Users/Usuario/Documents/Quijas/SCC/scc/portal/src/presentation/tokens.css:377) |

`transparent` representa transparencia y `currentColor` hereda el color del texto del elemento; no tienen un HEX fijo.
