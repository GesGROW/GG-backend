# Tablas reutilizables del Portal

Todas las tablas de `portal/src/presentation` usan `DataTable`, exportada desde
`Ui.jsx` e implementada en `DataTable.jsx`. Cada pantalla entrega sus columnas,
datos y acciones. Las consultas, filtros, estados de carga y mensajes sin resultados
siguen en la pantalla. La tabla comparte el estilo de Trabajadores y administra
la paginación local o delega la paginación remota a la pantalla.

```jsx
<DataTable
  label="Trabajadores"
  data={trabajadores}
  rowKey="id"
  columns={[
    { key: 'dni', header: 'DNI' },
    { key: 'nombre', header: 'Nombre', rowHeader: true },
    { key: 'estado', header: 'Estado', status: true },
    {
      key: 'jabas',
      header: 'Jabas',
      className: 'numeric',
      render: (fila) => numero(fila.jabas)
    }
  ]}
  actions={(fila) => <button onClick={() => editar(fila)}>Editar {fila.nombre}</button>}
/>
```

Cada columna tiene una `key` única y un `header`. Sin `render`, la celda muestra
`fila[key]`; los valores nulos o ausentes se muestran como `—`. `render(fila, índice)`
permite fechas, enlaces, estados, controles o contenido compuesto.

Opciones de columna:

- `width`: ancho CSS opcional, por ejemplo `'25%'`; genera el `colgroup` común.
- `className`: clase de la celda y, por defecto, de su cabecera.
- `headerClassName`: clase propia de la cabecera; `''` evita heredar `className`.
- `cellProps(fila, índice)`: propiedades como `title` o clases por valor.
- `rowHeader`: usa `th scope="row"` para identificar la fila.
- `status`: presenta el valor con una insignia de estado centrada y un punto de
  color; la cabecera conserva su alineación izquierda.
- `muted`: booleano o función por fila para mostrar datos secundarios en gris.
  Los valores ausentes (`—`, `Sin actividad`, `Datos pendientes`, entre otros)
  también reciben ese tratamiento cuando el contenido de la celda es texto.

`rowKey` admite el nombre de un campo o una función y debe identificar cada fila
de forma estable. Su valor por defecto es `'id'`. `rowClassName` admite una clase
o una función por fila.

`onRowActivate(fila, índice)` permite abrir detalles pulsando cualquier celda o
activando la fila con Enter o Espacio. `rowLabel` admite texto o una función para
dar un nombre accesible a esa acción. Las filas conservan su semántica de tabla;
los botones, enlaces y campos internos mantienen sus acciones independientes.

`actions(fila, índice)` agrega la última columna; `actionsHeader` cambia su título
predeterminado, «Acciones». También se pueden incluir botones dentro de cualquier
columna con `render`.

`className` pertenece al contenedor con desplazamiento horizontal y
`tableClassName` a la tabla. `label` nombra la región accesible. La tabla toma su
nombre de `caption`, si existe, o de `label`; `tableLabel` permite uno diferente.
`captionClassName="sr-only"` conserva un título solo para lectores de pantalla.

La estructura se cambia en `DataTable.jsx`, los estilos compartidos en
`tables.css` y sus medidas en `tokens.css`: cabeceras oliva, texto blanco sin
negrita en las filas, celdas de 40 px y separación mediante líneas finas. Las
filas muestran un fondo tenue al pasar el cursor. `StatusBadge.jsx` centraliza
los colores y los puntos de estado. Cada pantalla conserva sus columnas,
acciones y controles propios.

## Paginación

`DataTable` incluye de forma predeterminada un contador de resultados y controles
con flechas, páginas numeradas y puntos suspensivos. Pagina los datos recibidos
en grupos de 50 filas; `pageSize` permite cambiar ese tamaño. Al cambiar el
conjunto de claves de las filas, vuelve a la primera página. `pagination={false}`
permite mostrar todos los datos sin pie de paginación.

Si la pantalla ya recibe una página del servidor o recorta sus datos, debe pasar
un objeto `pagination` para evitar una segunda división de filas:

```jsx
pagination={{
  label: 'Paginación de trabajadores',
  total,
  offset,
  pageSize: 50,
  onPageChange: (pagina) => setOffset((pagina - 1) * 50)
}}
```

`onPageChange` recibe páginas desde 1. La pantalla conserva sus filtros al
actualizar el offset. El pie usa `TablePagination`, también exportado desde
`Ui.jsx`, con `total`, `offset`, `pageSize`, `onPageChange`, `label` y `showSummary`.
