# AppSheet / CAPTURAS — flujo V11

## Regla de arquitectura

AppSheet captura y revisa. Apps Script V11 es el único componente que promueve una captura aprobada hacia TRANSPORTISTA, TELEFONOS, LUGARES, VISITA y DIRECCION.

Ningún Bot/Action de AppSheet debe crear, fusionar o actualizar directamente esas tablas maestras desde CAPTURAS.

## Columnas nuevas de CAPTURAS

- IDTRANSPORTE — Ref -> TRANSPORTISTA[IDTRANSPORTE].
- ESTADO IDENTIDAD — solo lectura: ENCONTRADO / NUEVO / AMBIGUO / REVISAR.
- ESTADO COMPARACION — solo lectura: DUPLICADO / ACTUALIZAR / NUEVO / REVISAR.
- ALCANCE CAPTURA — Enum: PARCIAL / COMPLETA / ESPECIFICA. Initial value: "PARCIAL".
- CAMBIOS DETECTADOS — LongText, solo lectura.
- FECHA PROCESAMIENTO — DateTime, solo lectura.
- PROCESADO POR — Text, solo lectura.
- HASH CAPTURA — Text, solo lectura.

Después de añadir las columnas en Google Sheets, ejecutar Data > Columns > CAPTURAS > Regenerate Structure.

## Acción Aprobar captura

Debe ser la única forma normal de establecer ESTADO = "Aprobado".

Only if this condition is true:

AND(
  [ESTADO] = "Procesado por IA",
  ISNOTBLANK([NOMBRE DEL TRANSPORTISTA])
)

No permita edición manual de ESTADO en formularios o Detail views. El Bot/Action puede seguir cambiándolo.

## IDTRANSPORTE

La identidad persistente es IDTRANSPORTE.

- Teléfono compartido: permitido.
- GPS compartido: permitido.
- Dirección/bodega compartida: permitido.
- Mismo propietario: permitido.
- Nombres iguales en IDs distintos: permitido, pero una captura sin ID queda en AMBIGUO.

Cuando ESTADO IDENTIDAD sea AMBIGUO o REVISAR, mostrar IDTRANSPORTE para selección manual.

## ALCANCE CAPTURA

- PARCIAL: agrega/actualiza información presente y nunca interpreta ausencias como bajas.
- ESPECIFICA: para una toma de teléfono, GPS, bodega u otro dato puntual.
- COMPLETA: declara que la imagen pretende representar el conjunto actual. Si omite teléfonos/destinos existentes, V11 NO los borra; clasifica REVISAR para evitar pérdida accidental.

## Bots

Conservar Bots que:
1. procesen FOTO con IA y escriban únicamente en CAPTURAS;
2. cambien ESTADO a "Procesado por IA";
3. llamen al Apps Script V11 después de una aprobación explícita.

Deshabilitar o modificar cualquier Bot/Action que, desde CAPTURAS, escriba directamente en:
TRANSPORTISTA, TELEFONOS, LUGARES, VISITA o DIRECCION.

El Bot MAYUSCONVERT puede mantenerse para normalización visual si no cambia IDs, teléfonos, correos ni columnas técnicas de staging.
