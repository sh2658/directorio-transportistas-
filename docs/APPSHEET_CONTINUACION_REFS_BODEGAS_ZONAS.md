# Continuación AppSheet — Rutas CR
Fecha inicial: 2026-09-11. Base revisada: d5ffa4ceb79923e0768550dd6436f25d29ff2f30.

## Actualización ejecutada — 2026-09-12

Base actual: `main` en `4112d11`; PR #2 fusionado.

Aplicado y verificado en el editor de **TRANSPORTES Y ENCOMIENDAS**:

- Las referencias existentes de DIRECCION, TELEFONOS y VISITA se conservaron.
- `CAPTURAS[ESTADO]` incluye `Procesado` y `Procesando`, no acepta valores libres y usa
  `CONTEXT("ViewType") <> "Form"` como `Editable_If` para impedir cambios manuales
  en formularios sin bloquear las acciones.
- Se creó la tabla `ZONAS` en la hoja fuente, se conectó a AppSheet y
  `DIRECCION[ZONA]` quedó como `Ref -> ZONAS`.
- `ZONAS[ZONA]` es Key y Label. La tabla quedó de solo lectura en la app.
- Las formas canónicas quedan activas; los alias históricos siguen siendo claves
  válidas para no romper filas existentes, pero se excluyen de nuevas altas con
  el `Valid_If` documentado en la sección 4.
- Se creó la vista Ref `RutasCR_OtraBodega_Form` para DIRECCION, con orden
  `IDTRANSPORTE`, `DIRECCION`, `ZONA`, `GPS`.
- Se creó en TRANSPORTISTA la acción prominente **Agregar otra bodega**, con
  icono de cajas/bodega y el `LINKTOFORM` documentado en la sección 3.
- `IDTRANSPORTE` se precarga y no es editable en ese formulario.
- GPS es obligatorio en ese formulario y su `Valid_If` impide guardar otra fila
  del mismo transportista cuando existe una dirección a `<= 0.1 km`.
- El preview confirmó el botón, el formulario correcto y el transportista
  preseleccionado. No se guardó ninguna fila de prueba.
- AppSheet guardó los cambios con **No issues found**.

En la hoja `ZONAS!A1:D15` quedaron 14 claves, incluidas GRECIA y LIBERIA.
Los alias sin tilde y `GAM` están inactivos y marcados para revisión. Las diez
variantes sin tilde de DIRECCION se normalizaron a BARRIO MÉXICO, SAN JOSÉ y
TIBÁS; `GAM` permanece sin reinterpretar porque no identifica una zona concreta.

La corrección V10 para la frontera exacta de 100 m, para detener escrituras
parciales ante conflicto zona/GPS y para no fusionar empresas distintas por
compartir teléfono está en `main`. Sus 40 pruebas pasan.

La revisión del proyecto real confirmó que Apps Script conserva V9; instalar V10
sigue pendiente. En datos quedan un GPS físico por completar y una zona histórica
`GAM` por revisar. Se completaron las ocho zonas vacías, se normalizaron diez alias,
se devolvieron tres capturas estancadas en `Procesando` a `Procesado por IA` y se
retiró una copia exacta de la visita COCORÍ/BATÁN; la sincronización externa volvió
a insertar ese par, por lo que la exportación lo deduplica y mantiene el diagnóstico.
También falta cerrar las dos alertas de credenciales expuestas después de revocarlas,
seleccionar imágenes públicas y ejecutar la publicación final.
GitHub Pages continúa desactivado hasta ese cierre.

## Historial y punto de partida
Se revisaron los 18 commits del PR, su descripción y la lista “Pendiente para cuando Santiago llegue a casa”.
V10 y 34 pruebas están reportados como validados; su instalación sigue pendiente en la lista. No confundir el código del repositorio con el instalado.
Aplicación objetivo: la identificada en el historial del proyecto; abrirla desde la cuenta de AppSheet autorizada.
La guía histórica CONFIGURACION_APPSHEET_REVISION.md describe otras tablas; no aplicarla como migración del modelo actual.

## 1. Preparación del ensayo
Usar copia de la aplicación Y copia de sus datos. Confirmar cada fuente de tabla: copiar solo la app puede mantener la conexión a producción.
Comprobar que bots, scripts, webhooks y activadores de la copia no escriban en el libro original.
No activar sincronización hacia main ni Pages.
Registrar configuración actual, claves, expresiones y conteos antes de cambiarla.

## 2. Ref y claves — Data > Columns
Mantener literalmente los nombres de columnas existentes, incluida IDDDIREECION.

| Tabla | Key (Text) | Columna Ref | Source table |
|---|---|---|---|
| TRANSPORTISTA | IDTRANSPORTE | — | — |
| DIRECCION | IDDDIREECION | IDTRANSPORTE | TRANSPORTISTA |
| TELEFONOS | IDTELEFONO | IDTRANSPORTE | TRANSPORTISTA |
| VISITA | IDVISITA | IDTRANSPORTE | TRANSPORTISTA |
| VISITA | misma clave anterior | IDLUGARES | LUGARES |
| LUGARES | IDLUGARES | — | — |

Labels: TRANSPORTISTA[TRANSPORTE], LUGARES[LUGAR], DIRECCION[DIRECCION].
Ref obligatorios; Valid_If devuelve IDs, nunca nombres.
Conservar IDs existentes; para nuevas filas Initial value UNIQUEID(), sin App formula ni Reset on edit.
No usar _RowNumber como Key.
No activar Is a part of? para este flujo: el botón explícito no lo necesita y activarlo añade borrado en cascada. Si ya está activo, registrar y evaluar antes de cambiar.

## 3. Agregar otra bodega
Crear en la copia una vista Form llamada RutasCR_OtraBodega_Form, tabla DIRECCION.
Orden: IDTRANSPORTE, DIRECCION, ZONA, GPS.
IDTRANSPORTE se muestra por Label y queda no editable en este formulario; se precarga desde la ficha. No permitir crear una empresa desde el selector.
DIRECCION: LongText, Required. GPS: LatLong. No poner HERE() como App formula: la posición del dispositivo no siempre es la bodega.
Capturar GPS explícitamente en campo o pegar coordenadas verificadas.
Conservar el comportamiento actual de otros formularios al fijar Editable_If.

En TRANSPORTISTA crear acción:
- Nombre visible: Agregar otra bodega.
- Do this: App: go to another view within this app.
- Target:

```appsheet
LINKTOFORM(
  "RutasCR_OtraBodega_Form",
  "IDTRANSPORTE", [IDTRANSPORTE]
)
```

En la copia agregar columna virtual BodegasCercanas: List, element type Ref → DIRECCION.
App formula:

```appsheet
IF(
  ISBLANK([GPS]),
  LIST(),
  SELECT(
    DIRECCION[IDDDIREECION],
    AND(
      [IDTRANSPORTE] = [_THISROW].[IDTRANSPORTE],
      [IDDDIREECION] <> [_THISROW].[IDDDIREECION],
      ISNOTBLANK([GPS]),
      DISTANCE([GPS], [_THISROW].[GPS]) <= 0.1
    )
  )
)
```

DISTANCE devuelve kilómetros: 0.1 km equivale a 100 m. Mostrar BodegasCercanas antes de guardar.
En el formulario de alta, impedir guardar una nueva dirección cuando COUNT([BodegasCercanas]) > 0; mensaje:
“Ya existe una bodega de este transportista a 100 metros o menos. Abra esa bodega para completar los datos que falten.”
Aplicar junto con las validaciones GPS existentes, sin reemplazarlas. Para ensayos con GPS, Required = TRUE en este formulario.
Verificar rechazo de vacío, 0,0, coordenadas invertidas y texto inválido. Una envolvente territorial solo detecta errores obvios.
Las filas históricas sin GPS no deben perderse ni recibir coordenadas inventadas.

Este formulario escribe DIRECCION directamente y NO ejecuta automáticamente la lógica de CAPTURAS V10.
Para mismo predio, abrir la bodega relacionada y completar solo faltantes con revisión; no sobrescribir GPS o zona existentes.
Para otra dirección, guardar una nueva Key manteniendo IDTRANSPORTE.
El control cliente no evita carreras entre dispositivos offline ni ve filas ocultas por security filters. Mantener el alta directa en ensayo hasta comprobar sincronización y visibilidad de todas las bodegas del transportista.
Probar el límite de 100 m en AppSheet: su cálculo no se ha comparado todavía con Haversine V10. No declarar equivalencia exacta sin ese ensayo.

## 4. Catálogo de zonas sin alterar datos vigentes
Zonas logísticas de bodegas y destinos LUGARES son conceptos distintos; no reutilizar LUGARES como catálogo de ZONA.
Valores observados en el snapshot:
BARRIO MÉXICO; CALLE BLANCOS; GAM; PAVAS; Paseo Colón; SAN CARLOS; SAN JOSE; San José; TIBÁS; URUCA.

Crear en la copia ZONAS con:
- ZONA: Text, Key, Label; usar el valor histórico exacto como clave para compatibilidad inicial.
- ZONA_CANONICA: Text.
- ACTIVA: Yes/No.
- REQUIERE_REVISION: Yes/No.

No declarar este catálogo “oficial”: mezcla barrios, distritos, cantones y una región.
Cargar inicialmente todos los valores existentes en la copia real, incluso los que no aparezcan en el snapshot.
DIRECCION[ZONA]: Ref → ZONAS, Is a part of? desactivado.
Así se conservan valores actuales que V10 escribe como texto; no introducir IDs ZON-... sin adaptar primero exportador y script.

Mapa propuesto, pendiente de revisión:
| Valor existente | Canónico propuesto | Observación |
|---|---|---|
| Paseo Colón | PASEO COLÓN | Variación de mayúsculas |
| SAN JOSE | SAN JOSÉ | Precisar alcance geográfico |
| San José | SAN JOSÉ | Precisar alcance geográfico |
| GAM | GAM | Demasiado general para ubicar una bodega |
| Resto | Mismo valor | Revisar físicamente cuando corresponda |

Marcar alias como inactivos para nuevas altas solo después de incorporar el valor canónico.
Valid_If de ZONA que conserva el valor histórico de una fila editada:

```appsheet
UNIQUE(
  SELECT(ZONAS[ZONA], [ACTIVA] = TRUE)
  +
  SELECT(
    DIRECCION[ZONA],
    [IDDDIREECION] = [_THISROW].[IDDDIREECION]
  )
)
```

No migrar masivamente ZONA hasta verificar cada correspondencia.
Los radios y coincidencias textuales de V10 son heurísticos, no límites administrativos oficiales.

## 5. Vistas relacionadas
En TRANSPORTISTA:
- REF_ROWS("DIRECCION", "IDTRANSPORTE")
- REF_ROWS("VISITA", "IDTRANSPORTE")
En LUGARES:
- REF_ROWS("VISITA", "IDLUGARES")
Reutilizar virtuales existentes cuando tengan estas expresiones.
Configurar vistas Ref separadas para mostrar LUGAR bajo transportista y TRANSPORTE bajo lugar.
Comprobar en preview qué vista inline resuelve AppSheet. Conservar el Valid_If de VISITA documentado en RUTAS_CR_IMPLEMENTACION.md.

## 6. Verificación GPS ejecutada sin servicios externos
Se ejecutaron las funciones puras originales de V10 en JavaScript, sin SpreadsheetApp ni escrituras.
Base sintética: 9.951587,-84.089046; mismo transportista TEST-A.
Puntos hacia el norte calculados con radio 6371000 m.

| Distancia objetivo | Resultado V10 | Estado |
|---|---|---|
| 0 m | MISMO_PREDIO | Conforme |
| 50 m | MISMO_PREDIO | Conforme |
| 99.9 m | MISMO_PREDIO | Conforme |
| 100 m | NUEVA_DIRECCION | Revisar precisión numérica |
| 100.1 m | NUEVA_DIRECCION | Conforme |
| 150 m | NUEVA_DIRECCION | Conforme |

Para 100 m, el punto 9.95248632160592,-84.089046 devuelve 100.00000000005356 m.
La comparación estricta <=100 lo deja fuera. La diferencia es numérica, no evidencia de error físico de GPS.
Pendiente: acordar y probar tolerancia exclusivamente numérica y añadir regresión de frontera antes de instalar V10; no redondear a metros enteros, pues admitiría distancias reales superiores a 100 m.
Se verificó además que “BODEGA EN PAVAS” con el GPS base produce conflicto zonaTexto=PAVAS / zonaGps=TIBÁS.

Estas comprobaciones no son las 34 pruebas originales ni pruebas del editor AppSheet.

## 7. Matriz de aceptación pendiente en copia
- Alta >100 m: +1 DIRECCION, +0 TRANSPORTISTA, mismo IDTRANSPORTE.
- Alta <=100 m: impedir duplicado directo; captura V10 completa mismo predio.
- Dos empresas en idéntico GPS: mantener IDs, teléfonos y destinos separados.
- Misma descripción a >100 m: otra dirección del mismo transportista.
- GPS ausente: revisión, no inferir proximidad.
- Conflicto zona/GPS por CAPTURAS: estado Revisado.
- Repetir captura: no duplicar DIRECCION, TELEFONOS ni VISITA.
- Editar VISITA: mantener destino actual; impedir repetido en la misma empresa.
- Cancelar formulario: no crear filas.
- Sincronizar dos dispositivos: comprobar duplicación y referencias.

Hallazgo de revisión del código: V10 escribe datos del transportista, teléfonos y destinos ANTES de evaluar conflicto de zona.
Por tanto, Revisado no significa que toda la captura quedó sin aplicar. Comprobar esos efectos en el ensayo.
Conservar estados de entrada de aprobación ya usados por CAPTURAS. Asignado/Procesado/Revisado son salidas; no sustituir todo el Enum por solo esas tres opciones.

## 8. Pendientes conservados
Instalación real de V10; un GPS físico; revisión de la zona `GAM`; imágenes públicas
seleccionadas; sincronización real; revocación de las dos credenciales expuestas;
revisión multidispositivo y publicación final.

## Referencias
- [Propiedades de columnas y Ref](https://support.google.com/appsheet/answer/10106509?hl=en)
- [Ejemplo oficial LINKTOFORM](https://www.appsheet.com/samples/This-app-shows-how-to-link-to-a-form-and-fill-in-default-values?appGuidString=ad497f8e-7d8a-4664-8a4a-43c202bb6126)
- [DISTANCE en kilómetros](https://support.google.com/appsheet/answer/11587699?hl=en)
