# Reversión de la integración de tareo

La integración iniciada con la información del padrón y del tareo se retiró el 9 de noviembre de 2026 por solicitud del usuario. El portal vuelve al comportamiento del commit 25cc24e; se conserva el historial Git mediante un commit de reversión.

La migración 20261109220933 elimina únicamente las cinco tablas privadas añadidas, las RPC y funciones de tareo, el trigger de códigos al alta y la columna codigo_externo. Restaura las tres funciones de consulta modificadas. Las tres migraciones originales se conservan como historial de instalación; una instalación completa las aplica y después las revierte.

Se comprobó localmente que los cuerpos de las tres funciones restauradas son idénticos a los anteriores. En producción se verificó que permanecen los 54 trabajadores, 740 hechos de producción y 740 correcciones; el hash del historial de reglas de bonos permaneció igual. Los bonos de jabas/jarras anteriores a esta integración se conservan.

Los valores anteriores de nombres y apellidos no se registraron antes de la actualización de los 37 trabajadores. No hay historial de valores en esa tabla. Esa parte de la reversión requiere una exportación o respaldo anterior y permanece pendiente; no se sustituyeron por valores supuestos. Se guardó una copia local privada del estado anterior a retirar la integración, excluida de Git.
