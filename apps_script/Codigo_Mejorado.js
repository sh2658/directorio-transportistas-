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
  // Modelos oficiales y de máxima velocidad para OCR y visión
  MODELS: ['gemini-2.0-flash', 'gemini-1.5-flash'],
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
      .addItem('Procesar pendientes ahora', 'procesarCapturasPendientes')
      .addItem('Asignar aprobadas ahora', 'asignarCapturasAprobadas')
      .addItem('Instalar revisión automática', 'configurarActivador')
      .addToUi();
  } catch (e) {
    Logger.log("Ejecución en segundo plano sin UI.");
  }
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
          idxFoto, idxEstado, idxGps, idxTransportista, idxTelefonos,
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
    'Eres un experto analista en logística y transportistas de encomiendas en Costa Rica.',
    'Analiza esta imagen (letrero, rótulo de bodega, portón o volante comercial).',
    'REGLAS OBLIGATORIAS:',
    '1. MULTI-TRANSPORTISTA: Una sola imagen puede contener VARIAS empresas que comparten la misma bodega (ej: Transcama, San Carleños, Mejía, Damaka). Extrae CADA transportista por separado en la lista "transportistas".',
    '2. BODEGA FÍSICA: Extrae la dirección exacta de la bodega o terminal (ej: "COLIMA DE TIBÁS, 100M NORTE DE CENTRAL DE BATERÍAS", "BARRIO MÉXICO"). Esta bodega es compartida por todos.',
    '3. HORARIO GENERAL: Si hay un horario visible (ej: "L-V 7:00 AM - 5:00 PM, SÁB 7:00 AM - 12:00 MD"), extráelo. Se aplicará a todos a menos que alguno tenga un horario individual.',
    '4. DESTINOS / LUGARES: Pueblos, cantones o rutas a los que viaja cada transportista (ej: San Carlos, Ciudad Quesada, Pital, Pérez Zeledón).',
    '5. TELÉFONOS: Extrae los números de teléfono limpios (ej: "8888-8888", "2222-2222") asignados a la empresa correspondiente.',
    '6. TODO EL TEXTO DEBE VENIR EN MAYÚSCULAS.'
  ].join(' ');

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

  let lastError = null;
  for (let i = 0; i < CONFIG.MODELS.length; i++) {
    const model = CONFIG.MODELS[i];
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';

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
      return JSON.parse(text);
    }

    lastError = new Error('Gemini respondió HTTP ' + code + ': ' + resumirMensajeApi_(body));
    if (code !== 404) break;
  }
  throw lastError || new Error('No fue posible consultar la API de Gemini.');
}

/**
 * Distribuye los resultados en la hoja CAPTURAS:
 * - Si es 1 solo transportista: actualiza la fila existente.
 * - Si son varios: actualiza la primera fila con el primero y agrega filas adicionales
 *   para los demás con la MISMA FOTO, MISMO GPS, MISMA BODEGA y MISMO HORARIO.
 */
function escribirRepartoEnCapturas_(sheet, rowNumber, photoPath, gpsValue, dataIA, cols) {
  const bodegaComun = String(dataIA.bodega_compartida || '').trim().toUpperCase();
  const horarioComun = String(dataIA.horario_general || '').trim().toUpperCase();
  const obsComun = String(dataIA.observaciones_bodega || '').trim().toUpperCase();
  const transportistas = Array.isArray(dataIA.transportistas) && dataIA.transportistas.length > 0 
    ? dataIA.transportistas 
    : [{ nombre: 'NO IDENTIFICADO', telefonos: [], destinos: [] }];

  const total = transportistas.length;

  // 1. Asignar el primer transportista a la fila original
  asignarFilaCaptura_(sheet, rowNumber, transportistas[0], bodegaComun, horarioComun, obsComun, total > 1 ? `[1 DE ${total} EN ESTA BODEGA]` : '', cols);

  // 2. Si hay más transportistas en el mismo rótulo/bodega, agregar una fila para cada uno
  for (let k = 1; k < total; k++) {
    const t = transportistas[k];
    const nuevaFila = new Array(cols.headersCount).fill('');

    if (cols.idxFoto !== -1) nuevaFila[cols.idxFoto] = photoPath;
    if (cols.idxEstado !== -1) nuevaFila[cols.idxEstado] = CONFIG.STATUS_DONE;
    if (cols.idxGps !== -1) nuevaFila[cols.idxGps] = gpsValue;
    if (cols.idxTransportista !== -1) nuevaFila[cols.idxTransportista] = String(t.nombre || '').trim().toUpperCase();
    if (cols.idxTelefonos !== -1) nuevaFila[cols.idxTelefonos] = limpiarListaTexto_(t.telefonos).join('\n');
    if (cols.idxDestinos !== -1) nuevaFila[cols.idxDestinos] = limpiarListaTexto_(t.destinos).join('\n');
    if (cols.idxBodegas !== -1) nuevaFila[cols.idxBodegas] = bodegaComun;
    if (cols.idxHorario !== -1) nuevaFila[cols.idxHorario] = String(t.horario_especifico || horarioComun).trim().toUpperCase();
    if (cols.idxObservaciones !== -1) {
      nuevaFila[cols.idxObservaciones] = `[${k + 1} DE ${total} EN ESTA BODEGA] ${obsComun}`.trim();
    }

    sheet.appendRow(nuevaFila);
  }
}

function asignarFilaCaptura_(sheet, rowNumber, t, bodegaComun, horarioComun, obsComun, tagMulti, cols) {
  const nombre = String(t.nombre || '').trim().toUpperCase();
  const telefonos = limpiarListaTexto_(t.telefonos).join('\n');
  const destinos = limpiarListaTexto_(t.destinos).join('\n');
  const horario = String(t.horario_especifico || horarioComun).trim().toUpperCase();
  const obs = (tagMulti ? tagMulti + ' ' : '') + obsComun;

  if (cols.idxTransportista !== -1) sheet.getRange(rowNumber, cols.idxTransportista + 1).setValue(nombre);
  if (cols.idxTelefonos !== -1) sheet.getRange(rowNumber, cols.idxTelefonos + 1).setValue(telefonos);
  if (cols.idxDestinos !== -1) sheet.getRange(rowNumber, cols.idxDestinos + 1).setValue(destinos);
  if (cols.idxBodegas !== -1) sheet.getRange(rowNumber, cols.idxBodegas + 1).setValue(bodegaComun);
  if (cols.idxHorario !== -1) sheet.getRange(rowNumber, cols.idxHorario + 1).setValue(horario);
  if (cols.idxObservaciones !== -1) sheet.getRange(rowNumber, cols.idxObservaciones + 1).setValue(obs);
  
  if (cols.idxEstado !== -1) sheet.getRange(rowNumber, cols.idxEstado + 1).setValue(CONFIG.STATUS_DONE);
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
