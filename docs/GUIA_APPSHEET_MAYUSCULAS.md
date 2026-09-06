# Guía: Conversión Automática a Mayúsculas en AppSheet

Esta guía detalla cómo configurar AppSheet para que cualquier texto que se ingrese o edite en cualquier tabla se transforme de forma automática a **MAYÚSCULAS**.

---

## Opción 1: Acción de Guardado en Formulario (Recomendada - 100% Instantánea)

Esta opción se ejecuta directamente en el móvil al pulsar el botón **"Save" (Guardar)**, sin demoras de red.

### Paso 1: Crear la Acción
1. Ve a **App > Actions** (icono de rayo ⚡ en la barra lateral izquierda).
2. Pulsa **+ New Action**:
   - **Action name:** `Auto Mayúsculas - [NombreDeTuTabla]` (ej: `Auto Mayúsculas - TRANSPORTISTA`).
   - **For a record of table:** Selecciona la tabla deseada (ej: `TRANSPORTISTA`, `CAPTURAS`, `LUGARES`, etc.).
   - **Do this:** Selecciona `Data: set the values of some columns in this row`.
3. **Set these columns:** Añade cada campo que desees convertir:
   - Para el nombre: `[NOMBRE]` = `UPPER([NOMBRE])`
   - Para la dirección: `[DIRECCION]` = `UPPER([DIRECCION])`
   - Para el horario: `[HORARIO]` = `UPPER([HORARIO])`
4. En **Appearance**:
   - **Prominence:** Selecciona **`Do not display`** (para que actúe como proceso invisible de fondo).
5. Pulsa **Save** arriba a la derecha.

### Paso 2: Vincular al Formulario
1. Ve a **App > Views**.
2. Abre la vista del formulario correspondiente (ej: `TRANSPORTISTA_Form` o `CAPTURAS_Form`).
3. Despliega la sección **Behavior** (Comportamiento).
4. En el campo **Form Saved**, selecciona la acción que acabas de crear:
   `Auto Mayúsculas - [NombreDeTuTabla]`
5. Guarda los cambios (**Save**).

---

## Opción 2: Bot de Automatización (Corre en Servidor)

Ideal si los datos entran por sincronizaciones externas o importaciones masivas.

### Configuración del Bot:
1. Ve a **Automation > Bots** y pulsa **+ New Bot**.
2. Configura el evento (**Event**):
   - **Event Type:** `Data Change`.
   - **Data Change Type:** `Adds and Updates`.
   - **Table:** Selecciona la tabla deseada.
3. En el proceso (**Run this PROCESS**):
   - Pulsa el botón azul **`+ Add a step`**.
   - **Run this step:** Selecciona `Run a data action`.
   - **Data action to run:** Elige la acción de mayúsculas creada en la Opción 1.
4. Guarda los cambios (**Save**).

---

## Reutilización en Otras Tablas
Para replicar en cualquier otra tabla:
1. Crea una acción con la fórmula `UPPER([NombreDelCampo])` vinculada a la nueva tabla.
2. Asígnala en el evento **Form Saved** del formulario de esa tabla.
