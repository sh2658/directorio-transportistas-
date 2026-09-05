# 📱 Guía de Solución: Capturas Multi-Transportista y Revisión Visual en AppSheet

Esta guía resuelve las dos inquietudes que tienes en AppSheet:
1. **Reparto automático multi-transportista:** Cuando tomas una foto de un letrero que tiene varios transportistas en una misma bodega física, la IA (Gemini) extrae cada empresa por separado y le **reparte automáticamente el mismo GPS (`LatLong`), la misma Zona, la misma Dirección y el mismo Horario general**.
2. **Revisión visual antes de aprobar (Human-in-the-Loop):** Cómo configurar la vista en AppSheet para que **veas la imagen original arriba y debajo la lista de transportistas detectados**, permitiéndote editar o corregir cualquier dato antes de presionar **"Aprobar y Distribuir"**.

---

## 🏗️ 1. ¿Por qué no podías ver lo capturado antes?

En AppSheet, si intentas guardar varios transportistas en una sola fila plana:
* AppSheet solo puede mostrar la imagen y campos de texto largos juntos, pero no te permite editar de forma ordenada cada empresa individual.
* La solución profesional estándar en AppSheet es una **relación Padre-Hijo (Parent-Child)**:
  * **Tabla Padre (`Capturas_Revision`):** Almacena la **FOTO**, el **GPS satelital**, la **Dirección de la bodega** y el **Horario general**.
  * **Tabla Hija (`Capturas_Detalle`):** Almacena cada **Transportista** individual detectado en esa foto.

---

## 📊 2. Estructura de Tablas en Google Sheets

El script [`apps_script/Procesar_Capturas_Gemini.js`](../apps_script/Procesar_Capturas_Gemini.js) crea o utiliza automáticamente estas dos pestañas en tu hoja de cálculo:

### Tabla 1: `Capturas_Revision` (Padre)
| Columna | Tipo en AppSheet | Descripción |
| :--- | :--- | :--- |
| `ID_Captura` | `Text` | Clave primaria (`Key = TRUE`). |
| `Fecha` | `DateTime` | Fecha y hora de la captura. |
| `Imagen` | `Image` | La fotografía del letrero o bodega. |
| `Zona_Bodega` | `Text` | Cantón o zona (ej. `TIBÁS`, `BARRIO MÉXICO`). |
| `Direccion_Bodega`| `Text` | Dirección física de la bodega. |
| `GPS_Coordenadas` | `LatLong` | Coordenadas satelitales capturadas con el móvil. |
| `Horario_General` | `Text` | Horario general que aplica a todos (ej. `L-V 7:00 - 17:00`). |
| `Cantidad_Detectada`| `Number` | Número de empresas encontradas en la imagen. |
| `Estado` | `Enum` | `PENDIENTE DE REVISIÓN`, `APROBADO`, `DESCARTADO`. |

### Tabla 2: `Capturas_Detalle` (Hija)
| Columna | Tipo en AppSheet | Configuración Especial |
| :--- | :--- | :--- |
| `ID_Detalle` | `Text` | Clave primaria (`Key = TRUE`). |
| `ID_Captura` | `Ref` | Referencia a la tabla `Capturas_Revision` con **`IsPartOf = TRUE`** (¡Clave!). |
| `Nombre_Transportista`| `Name` | Nombre de la empresa en MAYÚSCULAS. |
| `Telefonos` | `Phone` o `Text` | Teléfonos de contacto. |
| `Destinos` | `EnumList` o `Text`| Destinos que cubre esa empresa en particular. |
| `Horario` | `Text` | Horario particular (hereda el general si estaba vacío). |
| `Zona_Bodega` | `Text` | Heredado automáticamente de la bodega compartida. |
| `Direccion_Bodega`| `Text` | Heredado automáticamente de la bodega compartida. |
| `GPS_Coordenadas` | `LatLong` | Heredado automáticamente de la bodega compartida. |
| `Estado` | `Enum` | `POR APROBAR`, `APROBADO`, `DESCARTADO`. |

---

## 🛠️ 3. Paso a Paso para Configurar la Vista en AppSheet

### Paso 1: Activar la Relación Padre-Hijo (`IsPartOf`)
1. En AppSheet, ve a **Data > Columns > tabla `Capturas_Detalle`**.
2. En la columna **`ID_Captura`**, asegúrate de que el tipo sea **`Ref`** apuntando a **`Capturas_Revision`**.
3. Haz clic en el lápiz de edición de `ID_Captura` y activa la casilla:  
   👉 **`IsPartOf = TRUE`**.
4. *¿Qué hace esto?* Hace que AppSheet cree automáticamente una columna virtual en la tabla padre llamada **`Related Capturas_Detalles`**.

### Paso 2: Configurar la Vista Detallada de Revisión
1. Ve a **App > Views** y selecciona o crea la vista para `Capturas_Revision`:
   * **View Type:** `Detail`.
   * **Column Order:**
     1. `Imagen` *(para que la foto aparezca en grande arriba)*.
     2. `Zona_Bodega` y `Direccion_Bodega`.
     3. `GPS_Coordenadas` *(con vista de mapa en miniatura)*.
     4. `Horario_General`.
     5. `Related Capturas_Detalles` *(¡Aquí se mostrará la tabla de todos los transportistas encontrados!)*.
     6. `Estado`.

### Paso 3: Revisión y Corrección en Pantalla
Cuando abras una captura en AppSheet:
* **Arriba:** Verás la foto original que tomaste.
* **Abajo:** Verás la lista de cada empresa que Gemini detectó (ej. *Transcama*, *Transportes San Carleños*, *Transportes Mejía*).
* **Si algún dato se leyó con un error en la foto:** Tocas la fila del transportista, corriges el teléfono o el nombre con el teclado de tu teléfono y guardas.

---

## ⚡ 4. Creación del Botón "Aprobar y Distribuir al Directorio"

Para que al estar satisfecho con lo que se capturó, los transportistas se asignen a la tabla maestra con el mismo GPS y bodega:

1. En AppSheet, ve a **App > Actions > New Action**.
2. Configura:
   * **Action name:** `✅ Aprobar y Distribuir`
   * **For a record of table:** `Capturas_Revision`
   * **Do this:** `App: execute an action on a set of rows`
   * **Referenced Table:** `Capturas_Detalle`
   * **Referenced Rows:** `[Related Capturas_Detalles]`
   * **Action to run:** Una acción secundaria que inserte en `Transportistas` o cambie el estado a `APROBADO`.

### Alternativa con Apps Script (Automática 1-Clic):
En tu proyecto de Google Apps Script:
El archivo [`apps_script/Procesar_Capturas_Gemini.js`](../apps_script/Procesar_Capturas_Gemini.js) contiene la función lista:
```javascript
aprobarYDistribuirCaptura("ID_DE_LA_CAPTURA");
```
Al llamarla, el script:
1. Toma todos los transportistas de esa captura.
2. Les asigna las coordenadas GPS satelitales de la bodega.
3. Les asigna la dirección y la zona de la bodega compartida.
4. Les asigna el horario general.
5. Los inserta en la pestaña `Transportistas` con `Estado = APROBADO`.
6. ¡Aparecen instantáneamente en tu web de **Rutas CR**!
