# Reversión de la integración de tareo

La integración iniciada con la información del padrón y del tareo se retiró el 9 de noviembre de 2026 por solicitud del usuario. El portal vuelve al comportamiento del commit 25cc24e; se conserva el historial Git mediante un commit de reversión.

La migración 20261109220933 elimina únicamente las cinco tablas privadas añadidas, las RPC y funciones de tareo, el trigger de códigos al alta y la columna codigo_externo. Restaura las tres funciones de consulta modificadas. Las tres migraciones originales se conservan como historial de instalación; una instalación completa las aplica y después las revierte.

Se comprobó localmente que los cuerpos de las tres funciones restauradas son idénticos a los anteriores. En producción se verificó que permanecen los 54 trabajadores, 740 hechos de producción y 740 correcciones; el hash del historial de reglas de bonos permaneció igual. Los bonos de jabas/jarras anteriores a esta integración se conservan.

El usuario confirmó posteriormente que antes ninguno de los trabajadores de Quijas tenía nombre. Conforme a esa instrucción se dejaron vacíos nombres y apellidos de los 38 trabajadores de esa empresa, sin modificar sus DNI, participaciones ni registros de producción. La verificación confirmó los 38 sin nombre, los mismos 740 hechos y correcciones, y el mismo hash del historial de bonos. La reversión queda completada. Se conserva una copia local privada del estado anterior a retirar la integración, excluida de Git.
