/**
 * ==============================================================================
 * RUTAS CR - MOTOR DE EXTRACCIÓN Y REPARTO MULTI-TRANSPORTISTA CON GEMINI
 * Proyecto Apps Script: "Procesar capturas con Gemini"
 * Hoja de Cálculo: https://docs.google.com/spreadsheets/d/1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA/edit
 * ==============================================================================
 * 
 * ¿QUÉ HACE ESTE SCRIPT?
 * 1. Analiza con Gemini 1.5 / 2.0 Flash cualquier imagen o fotografía (letrero, rótulo, volante).
 * 2. REPARTO MULTI-EMPRESA: Si la imagen contiene varios transportistas en una misma bodega,
 *    extrae cada transportista individualmente y les REPARTE el mismo GPS (LatLong),
 *    la misma Zona, la misma Dirección de Bodega y el mismo Horario general (a menos que se indique otro).
 * 3. FLUJO DE REVISIÓN Y APROBACIÓN (HUMAN-IN-THE-LOOP):
 *    - Guarda la captura y el desglose en tablas intermedias de revisión para que AppSheet
 *      muestre la FOTO original al lado de los datos leídos.
 *    - Permite al usuario revisar, corregir o editar lo leído en AppSheet.
 *    - Al presionar "APROBAR", transfiere los transportistas a la tabla maestra definitiva.
 */

const CONFIG = {
  ID_HOJA: "1gXtF2KcCuy_cdYRNTbGrulNbB5SYw_mrN-H_AVSXOeA",
  HOJA_MAESTRA: "Transportistas",
  HOJA_CAPTURAS: "Capturas_Revision",
  HOJA_DETALLES: "Capturas_Detalle",
  // La clave se toma de Propiedades del Script o se define aquí
  GEMINI_API_KEY: PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || ""
};

/**
 * Función principal: Procesa una captura recién subida desde AppSheet o Drive.
 * @param {string} idCaptura Identificador único de la captura
 * @param {string} urlOIdImagen URL de Google Drive o ID del archivo de imagen
 * @param {string} gpsOpcional Coordenadas LatLong capturadas por el móvil (ej: "9.9354, -84.0921")
 */
function procesarCapturaConGemini(idCaptura, urlOIdImagen, gpsOpcional) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.ID_HOJA);
    asegurarEstructuraTablas(ss);

    // 1. Obtener los bytes de la imagen
    const imagenBlob = obtenerBlobImagen(urlOIdImagen);
    if (!imagenBlob) {
      throw new Error("No se pudo descargar la imagen desde: " + urlOIdImagen);
    }

    // 2. Llamar a Gemini Vision para extracción estructurada
    const resultadoIA = llamarGeminiVision(imagenBlob);

    // 3. Registrar en tabla de revisión para AppSheet
    const idGenerado = idCaptura || "CAP-" + Utilities.formatDate(new Date(), "GMT-6", "yyyyMMdd-HHmmss");
    guardarEnStagingRevision(ss, idGenerado, urlOIdImagen, gpsOpcional, resultadoIA);

    return {
      exito: true,
      idCaptura: idGenerado,
      bodega: resultadoIA.bodega,
      transportistasExtraidos: resultadoIA.transportistas.length
    };
  } catch (error) {
    Logger.log("Error procesando captura: " + error.toString());
    return { exito: false, error: error.toString() };
  }
}

/**
 * Llama a la API de Gemini con un prompt especializado en logística costarricense
 */
function llamarGeminiVision(imagenBlob) {
  const apiKey = CONFIG.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en las Propiedades del Script (Configuración del proyecto > Propiedades del script).");
  }

  const base64Data = Utilities.base64Encode(imagenBlob.getBytes());
  const mimeType = imagenBlob.getContentType() || "image/jpeg";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
Eres un analista experto en logística y empresas de transporte y encomiendas en Costa Rica.
Analiza con máxima precisión la imagen adjunta (letrero, rótulo de bodega, pizarrón, volante o aviso).

REGLAS DE NEGOCIO OBLIGATORIAS:
1. UBICACIÓN Y BODEGA COMPARTIDA:
   - Identifica la ubicación física de la bodega (dirección descriptiva y zona/cantón en Costa Rica, ej: "COLIMA DE TIBÁS", "BARRIO MÉXICO", "SAN CARLOS", etc.).
   - Esta ubicación es la BODEGA FÍSICA que se aplicará a TODOS los transportistas que aparezcan en este rótulo.
2. HORARIO:
   - Si hay un horario visible (ej: "L-V 7:00 AM - 5:00 PM, SÁB 7:00 AM - 12:00 MD"), extráelo en mayúsculas como "horario_general".
   - Este horario se aplicará a TODOS los transportistas de la imagen, salvo que alguno tenga indicado un horario particular.
3. REPARTO INDIVIDUAL DE TRANSPORTISTAS:
   - Extrae CADA transportista o empresa de encomienda mencionada como un objeto independiente en una lista.
   - Para cada uno extrae:
     * nombre: Nombre de la empresa en MAYÚSCULAS (ej: "TRANSPORTES MEJÍA", "SAN CARLEÑOS", "TRANSCAMA").
     * telefonos: Array con los números de teléfono limpios (ej: ["8841-1594", "2222-3333"]).
     * destinos: Array con todos los pueblos, cantones o distritos que cubre este transportista en particular (ej: ["AGUAS ZARCAS", "CIUDAD QUESADA", "PITAL"]).
     * horario_especifico: String con horario propio o null para heredar el horario general.

Devuelve EXCLUSIVAMENTE un JSON válido con esta estructura exacta, sin texto adicional ni bloques markdown:
{
  "bodega": {
    "zona": "CANTON O ZONA EN MAYUSCULAS",
    "direccion": "DIRECCION DESCRIPTIVA EXACTA EN MAYUSCULAS",
    "horario_general": "HORARIO EN MAYUSCULAS"
  },
  "transportistas": [
    {
      "nombre": "NOMBRE DE LA EMPRESA EN MAYUSCULAS",
      "telefonos": ["8888-8888"],
      "destinos": ["DESTINO 1", "DESTINO 2"],
      "horario_especifico": null
    }
  ]
}
`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json"
    }
  };

  const opciones = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const respuesta = UrlFetchApp.fetch(url, opciones);
  const jsonResp = JSON.parse(respuesta.getContentText());

  if (jsonResp.error) {
    throw new Error("Gemini API Error: " + JSON.stringify(jsonResp.error));
  }

  const textoGenerado = jsonResp.candidates[0].content.parts[0].text;
  return JSON.parse(textoGenerado);
}

/**
 * Guarda el resultado en las dos tablas de revisión vinculadas:
 * 1. Capturas_Revision (Padre con la imagen original y datos de bodega)
 * 2. Capturas_Detalle (Hijos: cada transportista individual con GPS y horario heredado)
 */
function guardarEnStagingRevision(ss, idCaptura, urlImagen, gpsCapturado, dataIA) {
  const hojaPadre = ss.getSheetByName(CONFIG.HOJA_CAPTURAS);
  const hojaHijos = ss.getSheetByName(CONFIG.HOJA_DETALLES);

  const b = dataIA.bodega || {};
  const transportistas = dataIA.transportistas || [];
  const fechaActual = Utilities.formatDate(new Date(), "GMT-6", "yyyy-MM-dd HH:mm:ss");

  // 1. Insertar registro padre en Capturas_Revision
  hojaPadre.appendRow([
    idCaptura,
    fechaActual,
    urlImagen,
    (b.zona || "").toUpperCase(),
    (b.direccion || "").toUpperCase(),
    gpsCapturado || "",
    (b.horario_general || "").toUpperCase(),
    transportistas.length,
    "PENDIENTE DE REVISIÓN"
  ]);

  // 2. Insertar cada transportista en Capturas_Detalle heredando bodega, GPS y horario
  transportistas.forEach((t, index) => {
    const idDetalle = idCaptura + "-T" + (index + 1);
    const telefonosStr = Array.isArray(t.telefonos) ? t.telefonos.join(", ") : (t.telefonos || "");
    const destinosStr = Array.isArray(t.destinos) ? t.destinos.join(", ") : (t.destinos || "");
    const horarioFinal = (t.horario_especifico || b.horario_general || "").toUpperCase();

    hojaHijos.appendRow([
      idDetalle,
      idCaptura,
      (t.nombre || "").toUpperCase(),
      telefonosStr,
      destinosStr,
      horarioFinal,
      (b.zona || "").toUpperCase(),
      (b.direccion || "").toUpperCase(),
      gpsCapturado || "",
      "POR APROBAR"
    ]);
  });
}

/**
 * ACCIÓN DE APROBACIÓN DEFINITIVA:
 * Cuando el usuario revisa en AppSheet y presiona "APROBAR CAPTURA":
 * Toma todos los transportistas aprobados de esa captura y los transfiere
 * a la tabla maestra definitiva "Transportistas" con sus coordenadas y bodega lista.
 */
function aprobarYDistribuirCaptura(idCaptura) {
  const ss = SpreadsheetApp.openById(CONFIG.ID_HOJA);
  const hojaHijos = ss.getSheetByName(CONFIG.HOJA_DETALLES);
  const hojaMaestra = ss.getSheetByName(CONFIG.HOJA_MAESTRA);
  const hojaPadre = ss.getSheetByName(CONFIG.HOJA_CAPTURAS);

  const datosHijos = hojaHijos.getDataRange().getValues();
  if (datosHijos.length <= 1) return { exito: false, mensaje: "No hay detalles" };

  // Índices de columnas en Capturas_Detalle
  // [0: ID_Detalle, 1: ID_Captura, 2: Nombre, 3: Telefonos, 4: Destinos, 5: Horario, 6: Zona, 7: Direccion, 8: GPS, 9: Estado]
  let transferidos = 0;

  for (let i = 1; i < datosHijos.length; i++) {
    const fila = datosHijos[i];
    const capturaFila = fila[1];
    const estadoFila = fila[9];

    if (capturaFila === idCaptura && estadoFila !== "DESCARTADO") {
      const nombre = fila[2];
      const telefonos = fila[3];
      const destinos = fila[4];
      const horario = fila[5];
      const zona = fila[6];
      const direccion = fila[7];
      const gps = fila[8];

      // Parsear latitud y longitud si vienen como "9.93, -84.09"
      let lat = "";
      let lng = "";
      if (gps && gps.includes(",")) {
        const partes = gps.split(",");
        lat = partes[0].trim();
        lng = partes[1].trim();
      }

      const idMaestro = "TR-" + Utilities.formatDate(new Date(), "GMT-6", "yyyyMMdd") + "-" + (i);

      // Insertar en tabla maestra Transportistas
      hojaMaestra.appendRow([
        idMaestro,
        nombre,
        horario,
        "Importado desde captura " + idCaptura,
        "", // imagen
        direccion,
        lat,
        lng,
        zona,
        telefonos,
        destinos,
        "APROBADO" // Estado para que la web pública lo muestre de inmediato
      ]);

      // Marcar el detalle como APROBADO
      hojaHijos.getRange(i + 1, 10).setValue("APROBADO");
      transferidos++;
    }
  }

  // Marcar el padre como APROBADO
  const datosPadre = hojaPadre.getDataRange().getValues();
  for (let j = 1; j < datosPadre.length; j++) {
    if (datosPadre[j][0] === idCaptura) {
      hojaPadre.getRange(j + 1, 9).setValue("APROBADO");
      break;
    }
  }

  return { exito: true, transferidos: transferidos };
}

/**
 * Asegura que existan las pestañas de revisión en el Google Sheet
 */
function asegurarEstructuraTablas(ss) {
  let hojaPadre = ss.getSheetByName(CONFIG.HOJA_CAPTURAS);
  if (!hojaPadre) {
    hojaPadre = ss.insertSheet(CONFIG.HOJA_CAPTURAS);
    hojaPadre.appendRow([
      "ID_Captura", "Fecha", "Imagen", "Zona_Bodega", "Direccion_Bodega",
      "GPS_Coordenadas", "Horario_General", "Cantidad_Detectada", "Estado"
    ]);
    hojaPadre.setFrozenRows(1);
    hojaPadre.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#0B2545").setFontColor("#FFFFFF");
  }

  let hojaHijos = ss.getSheetByName(CONFIG.HOJA_DETALLES);
  if (!hojaHijos) {
    hojaHijos = ss.insertSheet(CONFIG.HOJA_DETALLES);
    hojaHijos.appendRow([
      "ID_Detalle", "ID_Captura", "Nombre_Transportista", "Telefonos", "Destinos",
      "Horario", "Zona_Bodega", "Direccion_Bodega", "GPS_Coordenadas", "Estado"
    ]);
    hojaHijos.setFrozenRows(1);
    hojaHijos.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#12325E").setFontColor("#FFFFFF");
  }
}

/**
 * Descarga los bytes de la imagen dada una URL de Drive, AppSheet o ID de archivo
 */
function obtenerBlobImagen(urlOId) {
  if (!urlOId) return null;
  
  // Si es un ID de archivo en Google Drive
  if (!urlOId.includes("http") && urlOId.length > 20) {
    return DriveApp.getFileById(urlOId).getBlob();
  }

  // Si es una URL de Google Drive
  const matchDrive = urlOId.match(/[-\w]{25,}/);
  if (matchDrive && (urlOId.includes("drive.google.com") || urlOId.includes("docs.google.com"))) {
    return DriveApp.getFileById(matchDrive[0]).getBlob();
  }

  // URL web estándar
  const resp = UrlFetchApp.fetch(urlOId, { muteHttpExceptions: true });
  return resp.getBlob();
}
