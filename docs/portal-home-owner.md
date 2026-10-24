# Home del owner

Referencia implementada: [Home sin módulos, nodo 64:383](https://www.figma.com/design/WNGim3Dsoohk4XCWihje7k/Portal---GesGROW?node-id=64-383).

La vista de [Home con Cosecha, nodo 86:656](https://www.figma.com/design/WNGim3Dsoohk4XCWihje7k/Portal---GesGROW?node-id=86-656) se implementó tomando como referencia el PNG aportado por el usuario. Esa imagen permitió completar la composición después de que la cuota del MCP impidiera consultar el segundo frame.

## Comportamiento

- `OwnerHome.jsx` muestra saludo, fecha en Lima y nombre de la cuenta. El clima conserva sólo el icono del diseño: no se inventan datos meteorológicos.
- Sin HARVEST habilitado aparece «Adquiere un módulo para poder ver su resumen». No aparece el selector Módulo ni se consultan campañas o reportes.
- Con HARVEST aparece Módulo → Cosecha. El resumen reutiliza las consultas existentes, la campaña seleccionada, actualización manual, métricas, ranking y aislamiento por empresa. El permiso de reportes sigue siendo necesario; contratar un módulo no concede permisos de usuario.
- Producción y Top cosechador ocupan dos tarjetas; las campañas aparecen en una lista lateral y las cinco métricas en una franja inferior. La lista conserva el foco al cambiar de campaña, mientras se actualizan las consultas. La actualización manual está disponible al enfocar o pasar el puntero por el panel y es visible en móvil.
- Una revalidación de acceso puede activar o retirar el resumen. Al retirar el módulo se desmontan las consultas y sus datos.
- El sidebar ofrece Inicio, Módulos y, si está autorizado, Configuración → Usuarios y accesos. Para el owner sin permisos operativos, Módulos abre directamente `/modulos`, la pantalla de adquisición. El catálogo no concede acceso operativo. Los enlaces de producción diaria y ranking del resumen permanecen deshabilitados para ese owner.
- El topbar muestra Cuenta. El menú conserva identidad, cierre de sesión y, para cuentas con varias empresas, el cambio de empresa. Se conserva el drawer móvil y el funcionamiento por teclado.

## Presentación y verificación

`owner-home.css` utiliza los tamaños del lienzo 1920 × 1080 y adaptación móvil. `owner-harvest-summary.css` completa el resumen según el PNG, equivalente a un lienzo 1920 × 1532. Se desactiva el zoom heredado del shell anterior. Los ocho recursos visibles exportados desde el primer frame se almacenan en `portal/src/assets/owner`; los SVG conservan sus dimensiones originales. El resumen reutiliza los recursos existentes de `portal/src/assets/home`.

La composición sin módulos se contrastó con las posiciones y tamaños del frame. Se revisaron las vistas en 1920, 1440, 1024, 390 y 320 px, junto con el menú de cuenta, drawer, navegación y consultas del resumen. Las pruebas incluyen activación/revocación del módulo, permisos, cambio de empresa y respuestas tardías.

El resumen con Cosecha se contrastó visualmente con el PNG en escritorio y se revisó en 1920, 1440, 1024, 768, 390 y 320 px, sin desbordamiento horizontal. Se verificaron la selección de campaña por ratón y teclado, la conservación del foco y las consultas de producción, ranking y lotes de la campaña elegida. Los nombres y cifras provienen de los reportes; los valores de muestra del diseño no se fijan en la interfaz.

Fixtures sin backend: `/tests/visual.html?single&owner-empty` y `/tests/visual.html?single&harvest-only`.
