# Anay y guía de embalaje

Se corrigen dos defectos de presentación del directorio:

- `app.js` excluía expresamente `transp2`, Bodega Anay. Ahora se muestra identificada como centro de recepción compartido, con sus contactos y cobertura registrados.
- La búsqueda por transportista solo consultaba nombres. Ahora también consulta las direcciones y zonas de las bodegas. Buscar Anay o Bodega Anay muestra el centro y los operadores con esa bodega o su dirección exacta en el directorio. La proximidad GPS no crea asociaciones.
- La guía general y las guías abiertas desde una ficha permiten imprimir con el transportista vacío. Se conserva el texto «Transportista por definir» y el resto de datos del paquete. El selector indica que es opcional.

En `data/centros-recepcion.json` se preservan los 18 nombres anunciados en el folleto RUTAS BODEGA ANAY, aportado por Santiago y revisado el 8 de noviembre. El folleto no tiene fecha visible; la interfaz lo señala como anuncio pendiente de confirmar recepción actual y destinos individuales. No se crean transportistas ni se les reparten los 125 destinos del centro.

La consulta del 24 de noviembre al sitio de Anay, https://encomiendasanay.com/, mantiene teléfono 2290-8315, atención lunes a viernes de 8 a 17 y cobertura conjunta de varias regiones. La fuente no distribuye destinos entre los operadores del folleto.

Se conservan sin cambios los datos maestros y su JSON. No se altera AppSheet ni Apps Script. Se actualiza la versión de recursos y caché de v34 a v35 para que los navegadores soliciten el código corregido.
