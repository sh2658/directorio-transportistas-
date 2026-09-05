# 📱 Guía de Integración con AppSheet: Rutas CR

Esta guía explica cómo vincular y configurar **AppSheet** sobre la hoja de cálculo de Google Sheets de Rutas CR para convertirla en una potente herramienta de backoffice móvil y web.

---

## 1. Conexión de la Base de Datos en AppSheet

1. Ve a [AppSheet.com](https://www.appsheet.com/) e inicia sesión con tu cuenta de Google.
2. Pulsa **"Create" > "App" > "Start with existing data"**.
3. Nombra la aplicación (ej. `Rutas CR Admin`) y selecciona como fuente de datos la hoja de cálculo:
   - **ID:** `1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA`

---

## 2. Configuración de Columnas y Tipos de Datos Clave

En el panel **Data > Columns**, asegúrate de que cada columna tenga el tipo adecuado:

| Columna en Sheets | Tipo en AppSheet | Configuración / Descripción |
| :--- | :--- | :--- |
| `ID` | `Text` | Clave primaria (`Key = TRUE`). Si está vacía, fórmula initial: `UNIQUEID()`. |
| `Nombre` | `Name` | Nombre de la empresa o transportista (`Label = TRUE`). |
| `Estado` | `Enum` | Valores: `Aprobado`, `Pendiente`, `Inactivo`. *(Vital para filtrar en la web pública)*. |
| `Horario` | `Text` | Horario de atención y despacho (ej. `L-V 8:00 - 17:00`). |
| `Bodega_Direccion`| `Address` | Dirección descriptiva del local o bodega. |
| `Bodega_Coordenadas`| `LatLong` | Coordenadas GPS. AppSheet permite capturarlas con 1 toque usando el GPS del móvil. |
| `Zona` | `Enum` o `Text` | Zona o cantón (ej. `San José Centro`, `Pérez Zeledón`, `Tibás`). |
| `Destinos` | `EnumList` | Lugares que visita. Permite seleccionar múltiples destinos de una lista predefinida. |
| `Telefonos` | `Phone` | Permite marcar o enviar WhatsApp directamente desde la app. |
| `Imagen` | `Image` | Foto del camión, fachada o logotipo. Se guarda automáticamente en Google Drive. |

---

## 3. Flujo de Trabajo: Aprobación de Nuevos Registros

Cuando un transportista llena el formulario público de Google Forms:
1. Su registro ingresa automáticamente a la hoja con `Estado = Pendiente`.
2. En AppSheet, el administrador ve una vista filtrada: **"Nuevos por Aprobar"**.
3. El administrador revisa que la dirección sea clara, verifica o ajusta el pin de ubicación `LatLong`, revisa la foto y presiona una acción de 1 clic: **"Aprobar Transportista"**.
4. La API pública (`Codigo_AppsScript_API.js`) solo entrega los registros con `Estado = Aprobado`, blindando el sitio web contra datos incompletos o spam.

---

## 4. Captura Precisa de Ubicación en Campo

Con la columna de tipo **`LatLong`**:
- Si estás físicamente en la bodega del transportista, al tocar el icono de mira telescópica, AppSheet captura la latitud y longitud satelital exacta.
- Esto alimenta directamente a **Waze** y **Google Maps** en el sitio web de GitHub Pages.
