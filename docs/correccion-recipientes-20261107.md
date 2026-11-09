# Reclasificación autorizada de recipientes

El usuario confirmó que las 358 lecturas históricas de Fundo Quijas fueron
jarras. Se clasificaron como JARRA, a 1.3 kg: 465.4 kg estimados.

Para el fundo ficticio Santa Lucía solicitó alternar recipientes. Se ordenaron
las 382 lecturas por fecha e ID dentro de cada cosechador y se alternaron,
empezando por jarra: 194 jarras (252.2 kg) y 188 jabas (451.2 kg).
Total estimado: 703.4 kg.

Los hechos productivos y recibos originales permanecen inmutables. Las
correcciones se guardan en una tabla privada con motivo, fecha, ejecutor y
valores originales; los reportes utilizan el recipiente corregido.
Las huellas de IDs, códigos y fechas antes/después coinciden en ambos fundos.

Las reglas de bonos no se modificaron. Al separar los recipientes, Santa Lucía
ya no supera su umbral histórico de 30 jabas por trabajador. Su bono de jarras
está deshabilitado; el bono histórico recalculado queda en cero.

Sin lecturas el peso es 0. Con lecturas sin ningún peso conocido continúa
siendo N/A; con pesos conocidos y desconocidos se indica parcial.

Script operativo: `scripts/corregir-recipientes-quijas-santa-lucia-20261107.sql`.
El script verifica los conteos antes de actuar y no se ejecuta automáticamente
al instalar una base de datos nueva.
