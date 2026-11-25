# Traslado de bodega Mau Jiménez y Álvarez

Confirmación de Santiago el 24 de noviembre de 2026: La Nosareña, Mau Jiménez, Los Toros de San Carlos y Transportes Fallas y Vega utilizarán el punto **9.938538, -84.088788** desde el **11 de enero de 2027**, zona horaria **America/Costa_Rica**. El aviso indica Barrio México, 75 m sur de la terminal de Pulmitán. Como vigencia por día se aplica desde las 00:00 locales, equivalentes a las 06:00 UTC.

## Registros afectados

| Empresa | IDTRANSPORTE | Bodega |
|---|---|---|
| Mau Jiménez | 51b25c54 | 586fc606 |
| La Nosareña | TRP-E0C73E19 | DIR-0D875184 |
| Los Toros de San Carlos | b1cbf101 | 963fadb3 |
| Fallas y Vega | TRP-FALLAS-VEGA | DIR-FV-MAU |

Fallas y Vega no estaba en el snapshot: se incorpora mediante el catálogo complementario de traslados con IDs estables, horario por confirmar, sin teléfonos ni destinos inventados. La ubicación actual se vincula a la bodega Mau confirmada por Santiago y al punto existente de Mau Jiménez. Si el maestro incorpora después el mismo ID, se reutiliza y no se duplica.

`data/traslados-programados.json` conserva la autorización, el destino, el instante efectivo y las claves exactas. `assets/js/scheduled-moves.js` aplica una proyección por fecha sin modificar el JSON maestro. Antes del instante efectivo mantiene las direcciones actuales; después reemplaza únicamente las cuatro bodegas indicadas, conservando sus IDs. Las otras bodegas y los destinos/contactos de cada empresa no cambian. El punto trasladado se presenta primero cuando no se ha pedido ordenar por cercanía.

La página muestra el aviso futuro y actualiza direcciones, marcadores y enlaces de navegación al entrar en vigor. Una pestaña que permanezca abierta comprueba el cambio cada minuto y al volver a primer plano. El reloj de referencia es el del dispositivo, comparado con un instante que incluye explícitamente -06:00. Se necesita hora correcta en el dispositivo. La guía se recalcula si está abierta.

La consulta del JSON y la del plan se realizan por red, sin caché. Un plan inválido bloquea la carga para no presentar ubicaciones obsoletas como vigentes. Una tarea adicional verifica la activación e integra los registros en Google Sheets/AppSheet mediante las mismas claves si esas conexiones están disponibles. Esto no presupone que el Apps Script instalado haya cambiado: en esta preparación se modifica la publicación web y se deja trazabilidad para el maestro.
