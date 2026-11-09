# Auditoría de reportes del 9 de noviembre

La separación de recipientes dejó el Home consultando únicamente jabas y el
selector operativo abría en Jabas. Quijas tiene 358 jarras: el cero no era una
pérdida de lecturas, pero la vista inicial y el mensaje de ranking eran confusos.
El error SQL de conexión había sido corregido previamente: el filtro de
recipiente se había aplicado también al agregado de lotes configurados.

El Home ahora usa una fachada autorizada que permite GENERAL/JABA/JARRA.
Producción y top comparten selección; General suma paquetes sin conversión
por peso. Producción y Rendimiento abren en General. Los bonos permanecen
separados y las consultas anteriores siguen conservando su contrato de jabas.

Se ejecutaron 36 consultas con identidades autorizadas de Quijas y Santa Lucía:
inicio y ranking por cada recipiente; Producción y Rendimiento por cada
recipiente; Dashboard, Resumen, Diaria, Lotes y Ranking anteriores; Bonos.
No hubo errores. Los totales General y la suma del ranking coincidieron:

| Fundo | Jabas | Jarras | General | Kg estimados |
| --- | ---: | ---: | ---: | ---: |
| Quijas | 0 | 358 | 358 | 465.4 |
| Santa Lucía | 188 | 194 | 382 | 703.4 |

Los ceros al elegir Jabas en Quijas son correctos. Las tarjetas «hoy» solo
cuentan el día de Perú; no hay cosecha registrada ese día en estos datos.
No se modificaron hechos productivos, recipientes ni reglas de bonos durante
esta auditoría. Se verificaron regresión SQL, cambio de selección compartida,
reportes operativos y suite del portal.
