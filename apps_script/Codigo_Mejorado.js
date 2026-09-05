/**
 * ==============================================================================
 * RUTAS CR - MOTOR DE EXTRACCIÓN CON GEMINI MULTI-TRANSPORTISTA (codigo.gs)
 * ==============================================================================
 * - Extrae múltiples transportistas de un solo rótulo/imagen.
 * - REPARTO AUTOMÁTICO: Asigna el mismo GPS, misma Bodega y mismo Horario a todos.
 * - Asigna los teléfonos específicos a cada transportista según aparezcan en la foto.
 * - Inserta una fila por cada transportista en la hoja CAPTURAS con la misma FOTO y GPS
 *   para que en AppSheet puedas revisar, corregir y aprobar cada uno por separado.
 * - 100% compatible con AsignarCapturas.gs y la estructura actual de tu base de datos.
 * ==============================================================================
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA',
  SHEET_NAME: 'CAPTURAS',
  API_KEY_PROPERTY: 'GEMINI_API_KEY',
  // Modelos oficiales confirmados activos en tu cuenta de Google AI
  MODELS: ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite'],
  STATUS_PENDING: 'Pendiente',
  STATUS_PROCESSING: 'Procesando', 
  STATUS_DONE: 'Procesado por IA',
  STATUS_ERROR: 'Error de IA',
  MAX_IMAGE_BYTES: 18 * 1024 * 1024,
  MAX_ROWS_PER_RUN: 5
});

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Capturas con IA')
      .addItem('⚡ Reprocesar fila seleccionada', 'reprocesarFilaSeleccionada')
      .addItem('Procesar pendientes ahora', 'procesarCapturasPendientes')
      .addItem('Asignar aprobadas ahora', 'asignarCapturasAprobadas')
      .addItem('Instalar revisión automática', 'configurarActivador')
      .addToUi();
  } catch (e) {
    Logger.log("Ejecución en segundo plano sin UI.");
  }
}

/**
 * Permite al usuario pararse sobre cualquier fila en CAPTURAS y reprocesarla
 * inmediatamente con Gemini sin importar su estado anterior.
 */
function reprocesarFilaSeleccionada() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    Logger.log("No existe la hoja " + CONFIG.SHEET_NAME);
    return;
  }
  
  const activeSheet = ss.getActiveSheet();
  let rowNumber = activeSheet.getActiveCell().getRow();
  
  // Si no está parado en una fila válida, procesa la última fila con foto
  if (activeSheet.getName() !== CONFIG.SHEET_NAME || rowNumber < 2) {
    rowNumber = sheet.getLastRow();
  }

  Logger.log("Reprocesando manualmente fila: " + rowNumber);
  sheet.getRange(rowNumber, findColIndex_(sheet.getDataRange().getValues()[0].map(String), ["ESTADO", "Estado"]) + 1).setValue(CONFIG.STATUS_PENDING);
  procesarCapturasPendientes();
}

function configurarActivador() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'procesarCapturasPendientes' || fn === 'alCambiar') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('alCambiar')
    .forSpreadsheet(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID))
    .onChange()
    .create();
    
  Logger.log("Activador alCambiar instalado con éxito.");
}

function alCambiar() {
  try { procesarCapturasPendientes(); } catch (e) { Logger.log('Error extracción: ' + e.message); }
  try { asignarCapturasAprobadas(); }   catch (e) { Logger.log('Error asignación: ' + e.message); }
}

/**
 * Procesa las fotos en estado "Pendiente" y distribuye los transportistas
 */
function procesarCapturasPendientes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty(CONFIG.API_KEY_PROPERTY);
    if (!apiKey) throw new Error('Falta la propiedad privada GEMINI_API_KEY en Propiedades del Script.');

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error('No existe la hoja ' + CONFIG.SHEET_NAME);

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const data = sheet.getDataRange().getValues();
    const rawHeaders = data[0];
    const headers = rawHeaders.map(h => String(h).trim());

    // Mapeo dinámico de encabezados
    const idxFoto           = findColIndex_(headers, ["FOTO", "Foto"]);
    const idxEstado         = findColIndex_(headers, ["ESTADO", "Estado"]);
    const idxIdTransporte   = findColIndex_(headers, ["IDTRANSPORTE", "ID TRANSPORTE"]);
    const idxGps            = findColIndex_(headers, ["GPS"]);
    const idxTransportista  = findColIndex_(headers, ["NOMBRE DEL TRANSPORTISTA", "TRANSPORTISTA"]);
    const idxTelefonos      = findColIndex_(headers, ["TELEFONOS", "Teléfonos"]);
    const idxDestinos       = findColIndex_(headers, ["LUGARES O DESTINOS", "DESTINOS", "LUGARES"]);
    const idxBodegas        = findColIndex_(headers, ["DIRECCIONES O BODEGAS", "BODEGAS", "DIRECCION"]);
    const idxHorario        = findColIndex_(headers, ["HORARIO", "Horario"]);
    const idxObservaciones  = findColIndex_(headers, ["OBSERVACIONES", "Observaciones"]);

    if (idxFoto === -1 || idxEstado === -1) {
      Logger.log("No se encontraron las columnas FOTO o ESTADO en la hoja CAPTURAS.");
      return;
    }

    let processed = 0;

    // Procesamos de arriba a abajo
    for (let index = 1; index < data.length; index++) {
      if (processed >= CONFIG.MAX_ROWS_PER_RUN) break;

      const rowNumber = index + 1;
      const photoPath = String(data[index][idxFoto] || '').trim();
      const status = String(data[index][idxEstado] || '').trim();
      const gpsValue = (idxGps !== -1) ? String(data[index][idxGps] || '').trim() : '';

      if (!photoPath || status.toLowerCase() !== CONFIG.STATUS_PENDING.toLowerCase()) continue;

      processed++;
      sheet.getRange(rowNumber, idxEstado + 1).setValue(CONFIG.STATUS_PROCESSING);
      SpreadsheetApp.flush();

      try {
        const imageFile = localizarFoto_(photoPath);
        const resultadoIA = extraerDatosMultiTransportistaGemini_(imageFile.getBlob(), apiKey);
        
        // Reparto de transportistas en la hoja CAPTURAS
        escribirRepartoEnCapturas_(sheet, rowNumber, photoPath, gpsValue, resultadoIA, {
          idxFoto, idxEstado, idxIdTransporte, idxGps, idxTransportista, idxTelefonos,
          idxDestinos, idxBodegas, idxHorario, idxObservaciones, headersCount: headers.length
        });

      } catch (error) {
        registrarError_(sheet, rowNumber, idxEstado, idxObservaciones, error);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Localiza la foto en Google Drive buscando por nombre de archivo
 */
function localizarFoto_(photoPath) {
  let cleanPath = photoPath.split('?')[0];
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch (ignored) {}

  const fileName = cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
  if (!fileName) throw new Error('La ruta de la foto está vacía o no es válida: ' + photoPath);

  const files = DriveApp.getFilesByName(fileName);
  if (!files.hasNext()) throw new Error('No se encontró en Google Drive la foto: ' + fileName);
  
  return files.next();
}

/**
 * Consulta a Gemini Vision con soporte MULTI-TRANSPORTISTA, bodega compartida y reparto
 */
function extraerDatosMultiTransportistaGemini_(blob, apiKey) {
  const bytes = blob.getBytes();
  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) {
    throw new Error('La imagen supera 18 MB; toma una foto con menor resolución.');
  }

  const prompt = [
    'Eres un experto analista en logística y empresas de transporte y encomiendas en Costa Rica.',
    'Analiza exhaustivamente esta imagen (volante, letrero, rótulo o portón).',
    'REGLAS CRÍTICAS DE EXTRACCIÓN:',
    '1. IDENTIFICACIÓN DE BODEGA COMPARTIDA VS TRANSPORTISTAS INDIVIDUALES:',
    '   - El título superior puede ser el nombre de la BODEGA o TERMINAL (ej: "BODEGA GOLFO EXPRESS").',
    '   - En el cuerpo del documento suele haber una lista con viñetas (bullets) donde CADA LÍNEA ES UNA EMPRESA DE ENCOMIENDA DIFERENTE.',
    '     Ejemplos en este tipo de volantes:',
    '     * "ENCOMIENDAS GOLFO EXPRESS"',
    '     * "ENCOMIENDAS Y MUDANZAS CENTENO JUNIOR"',
    '     * "TRANSPORTE RODRIGUEZ SERRANO"',
    '     * "ENCOMIENDAS Y MUDANZAS CENTENO"',
    '     * "TRANS SACO"',
    '     * "TRANSPORTES UPALA EXPRESS"',
    '   - ¡NUNCA agrupes todas las empresas en una sola! Debes extraer CADA EMPRESA como un elemento independiente dentro del array "transportistas". Si hay 6 empresas, devuelve 6 elementos.',
    '2. UBICACIÓN FÍSICA DE LA BODEGA COMÚN:',
    '   - Extrae la dirección exacta de la bodega o terminal (ej: "BARRIO MÉXICO, CONTIGUO A PARTES DE CHASIS, FRENTE A ANTIGUA BÓTICA SOLERA").',
    '3. HORARIO GENERAL DE LA BODEGA:',
    '   - Extrae el horario de atención (ej: "DE LUNES A VIERNES DE 8 AM A 5 PM").',
    '4. DATOS ESPECÍFICOS POR CADA EMPRESA:',
    '   - "nombre": Nombre exacto de la empresa en MAYÚSCULAS.',
    '   - "telefonos": Teléfono propio de esa empresa (ej: "8340-3547") MÁS el teléfono general de la bodega si aparece arriba (ej: "2221-0338"). Corrige errores tipográficos evidentes como ":" en vez de "-" (ej: "8375:9370" -> "8375-9370").',
    '   - "destinos": Lista de todos los pueblos, cantones o distritos a los que viaja esa empresa específica.',
    '5. TODO EL TEXTO DEBE DEVOLVERSE EN MAYÚSCULAS.'
  ].join('\n');


  const schema = {
    type: 'OBJECT',
    properties: {
      bodega_compartida: { type: 'STRING', description: 'Dirección física y zona de la bodega compartida' },
      horario_general: { type: 'STRING', description: 'Horario general de atención de la bodega' },
      observaciones_bodega: { type: 'STRING', description: 'Detalles adicionales de la bodega' },
      transportistas: {
        type: 'ARRAY',
        description: 'Lista de cada una de las empresas de transporte que aparecen en la imagen',
        items: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING', description: 'Nombre de la empresa en MAYÚSCULAS' },
            telefonos: { type: 'ARRAY', items: { type: 'STRING' } },
            destinos: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Pueblos o rutas de viaje' },
            horario_especifico: { type: 'STRING', description: 'Horario particular de esta empresa si difiere del general' }
          },
          required: ['nombre', 'telefonos', 'destinos']
        }
      }
    },
    required: ['bodega_compartida', 'horario_general', 'transportistas']
  };

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: blob.getContentType() || 'image/jpeg',
            data: Utilities.base64Encode(bytes)
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  // Modelos de visión multimodal confirmados en tu cuenta (excluyendo modelos de audio/tts)
  const modelosIntentar = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite'];
  Logger.log("Intentando extracción con modelos de visión: " + JSON.stringify(modelosIntentar));

  let lastError = null;
  for (let i = 0; i < modelosIntentar.length; i++) {
    const model = modelosIntentar[i];
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + apiKey;

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code >= 200 && code < 300) {
      const parsed = JSON.parse(body);
      const text = parsed && parsed.candidates && parsed.candidates[0] &&
        parsed.candidates[0].content && parsed.candidates[0].content.parts &&
        parsed.candidates[0].content.parts[0] && parsed.candidates[0].content.parts[0].text;
      if (!text) throw new Error('Gemini no devolvió contenido de texto.');
      Logger.log("✅ Extracción exitosa con modelo de visión: " + model);
      return JSON.parse(text);
    }

    lastError = new Error('Gemini respondió HTTP ' + code + ': ' + resumirMensajeApi_(body));
    Logger.log("Modelo " + model + " falló con HTTP " + code + ": " + resumirMensajeApi_(body));
  }
  throw lastError || new Error('No fue posible consultar la API de Gemini.');
}


/**
 * FUNCIÓN DE DIAGNÓSTICO:
 * Ejecuta esta función en Apps Script para ver en el registro exactamente
 * qué modelos están activos y permitidos con tu API Key.
 */
function probarModelosDisponibles() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(CONFIG.API_KEY_PROPERTY);
  if (!apiKey) {
    Logger.log("❌ Falta la propiedad privada GEMINI_API_KEY.");
    return;
  }
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log("Código HTTP: " + resp.getResponseCode());
  const body = resp.getContentText();
  Logger.log("Respuesta completa de Google AI: " + body);
}


/**
 * Distribuye los resultados en la hoja CAPTURAS:
 * - Si el transportista YA EXISTE en TRANSPORTISTA, llena su IDTRANSPORTE y avisa: [YA EXISTE: TRP-XXXX].
 * - Si es 1 solo transportista: actualiza la fila existente.
 * - Si son varios: actualiza la primera fila con el primero y agrega filas adicionales
 *   para los demás con la MISMA FOTO, MISMO GPS, MISMA BODEGA y MISMO HORARIO.
 */
function escribirRepartoEnCapturas_(sheet, rowNumber, photoPath, gpsValue, dataIA, cols) {
  const ss = sheet.getParent();
  const sheetTrp = ss.getSheetByName('TRANSPORTISTA');
  const mapExistentes = sheetTrp ? obtenerMapTransportistasExistentes_(sheetTrp) : new Map();

  const bodegaComun = String(dataIA.bodega_compartida || '').trim().toUpperCase();
  const horarioComun = String(dataIA.horario_general || '').trim().toUpperCase();
  const obsComun = String(dataIA.observaciones_bodega || '').trim().toUpperCase();
  const transportistas = Array.isArray(dataIA.transportistas) && dataIA.transportistas.length > 0 
    ? dataIA.transportistas 
    : [{ nombre: 'NO IDENTIFICADO', telefonos: [], destinos: [] }];

  const total = transportistas.length;

  // 1. Asignar el primer transportista a la fila original
  asignarFilaCaptura_(sheet, rowNumber, transportistas[0], bodegaComun, horarioComun, obsComun, total > 1 ? `[1 DE ${total}]` : '', mapExistentes, cols);

  // 2. Si hay más transportistas en el mismo rótulo/bodega, agregar una fila para cada uno
  for (let k = 1; k < total; k++) {
    const t = transportistas[k];
    const nombreNorm = normalizarClave_(t.nombre);
    const existeId = mapExistentes.get(nombreNorm) || '';

    const nuevaFila = new Array(cols.headersCount).fill('');

    if (cols.idxFoto !== -1) nuevaFila[cols.idxFoto] = photoPath;
    if (cols.idxEstado !== -1) {
      nuevaFila[cols.idxEstado] = existeId ? 'Existe - ¿Actualizar?' : CONFIG.STATUS_DONE;
    }
    if (cols.idxGps !== -1) nuevaFila[cols.idxGps] = gpsValue;
    if (cols.idxIdTransporte !== -1 && existeId) nuevaFila[cols.idxIdTransporte] = existeId;
    if (cols.idxTransportista !== -1) nuevaFila[cols.idxTransportista] = String(t.nombre || '').trim().toUpperCase();
    if (cols.idxTelefonos !== -1) nuevaFila[cols.idxTelefonos] = limpiarListaTexto_(t.telefonos).join('\n');
    if (cols.idxDestinos !== -1) nuevaFila[cols.idxDestinos] = limpiarListaTexto_(t.destinos).join('\n');
    if (cols.idxBodegas !== -1) nuevaFila[cols.idxBodegas] = bodegaComun;
    if (cols.idxHorario !== -1) nuevaFila[cols.idxHorario] = String(t.horario_especifico || horarioComun).trim().toUpperCase();
    if (cols.idxObservaciones !== -1) {
      const tagExiste = existeId ? `[YA EXISTE: ${existeId}] ` : '';
      nuevaFila[cols.idxObservaciones] = `${tagExiste}[${k + 1} DE ${total} EN ESTA BODEGA] ${obsComun}`.trim();
    }

    sheet.appendRow(nuevaFila);
  }
}

function asignarFilaCaptura_(sheet, rowNumber, t, bodegaComun, horarioComun, obsComun, tagMulti, mapExistentes, cols) {
  const nombre = String(t.nombre || '').trim().toUpperCase();
  const nombreNorm = normalizarClave_(nombre);
  const existeId = mapExistentes.get(nombreNorm) || '';

  const telefonos = limpiarListaTexto_(t.telefonos).join('\n');
  const destinos = limpiarListaTexto_(t.destinos).join('\n');
  const horario = String(t.horario_especifico || horarioComun).trim().toUpperCase();
  
  const tagExiste = existeId ? `[YA EXISTE: ${existeId}] ` : '';
  const obs = `${tagExiste}${tagMulti ? tagMulti + ' ' : ''}${obsComun}`.trim();

  if (cols.idxTransportista !== -1) sheet.getRange(rowNumber, cols.idxTransportista + 1).setValue(nombre);
  if (cols.idxIdTransporte !== -1 && existeId) sheet.getRange(rowNumber, cols.idxIdTransporte + 1).setValue(existeId);
  if (cols.idxTelefonos !== -1) sheet.getRange(rowNumber, cols.idxTelefonos + 1).setValue(telefonos);
  if (cols.idxDestinos !== -1) sheet.getRange(rowNumber, cols.idxDestinos + 1).setValue(destinos);
  if (cols.idxBodegas !== -1) sheet.getRange(rowNumber, cols.idxBodegas + 1).setValue(bodegaComun);
  if (cols.idxHorario !== -1) sheet.getRange(rowNumber, cols.idxHorario + 1).setValue(horario);
  if (cols.idxObservaciones !== -1) sheet.getRange(rowNumber, cols.idxObservaciones + 1).setValue(obs);
  
  if (cols.idxEstado !== -1) {
    const estadoFinal = existeId ? 'Existe - ¿Actualizar?' : CONFIG.STATUS_DONE;
    sheet.getRange(rowNumber, cols.idxEstado + 1).setValue(estadoFinal);
  }
}

function obtenerMapTransportistasExistentes_(sheetTrp) {
  const map = new Map();
  const data = sheetTrp.getDataRange().getValues();
  if (data.length <= 1) return map;
  
  // Asume columna 0 = IDTRANSPORTE, columna 1 = NOMBRE
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const nombreNorm = normalizarClave_(data[i][1]);
    if (id && nombreNorm) {
      map.set(nombreNorm, id);
    }
  }
  return map;
}


function registrarError_(sheet, rowNumber, idxEstado, idxObservaciones, error) {
  const safeMessage = String(error && error.message ? error.message : error)
    .replace(/AIza[0-9A-Za-z_-]+/g, '[CLAVE OCULTA]').substring(0, 500);

  if (idxObservaciones !== -1) {
    const cell = sheet.getRange(rowNumber, idxObservaciones + 1);
    const prev = String(cell.getValue() || '').trim();
    cell.setValue((prev ? prev + '\n' : '') + 'Error IA: ' + safeMessage);
  }

  if (idxEstado !== -1) {
    sheet.getRange(rowNumber, idxEstado + 1).setValue(CONFIG.STATUS_ERROR);
  }
}

function findColIndex_(headers, variants) {
  const normVariants = variants.map(normalizarClave_);
  for (let i = 0; i < headers.length; i++) {
    const h = normalizarClave_(headers[i]);
    if (normVariants.includes(h)) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    const h = normalizarClave_(headers[i]);
    for (let v of normVariants) {
      if (h.includes(v)) return i;
    }
  }
  return -1;
}

function normalizarClave_(texto) {
  if (!texto) return '';
  return texto.toString()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .trim();
}

function limpiarListaTexto_(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
}

function resumirMensajeApi_(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.error && parsed.error.message ? String(parsed.error.message).substring(0, 300) : 'respuesta no personalizada';
  } catch (ignored) {
    return String(body || '').substring(0, 300);
  }
}
