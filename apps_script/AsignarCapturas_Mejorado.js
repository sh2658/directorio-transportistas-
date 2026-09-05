/**
 * ====================================================================
 * SISTEMA DE ASIGNACIÓN Y DISTRIBUCIÓN DE CAPTURAS APROBADAS (V9)
 * ====================================================================
 * - ACTUALIZACIÓN A LA ÚLTIMA TOMA: Si el transportista ya existe,
 *   actualiza su HORARIO, su IMAGEN/FOTO más reciente, sus OBSERVACIONES
 *   y las coordenadas GPS de la bodega capturada.
 * - AGREGA NUEVOS TELÉFONOS y DESTINOS sin duplicar los existentes.
 * - Anti-duplicados inteligente (ignora tildes, espacios y mayúsculas).
 * - Normaliza teléfonos a formato tico (XXXX-XXXX, 8 dígitos).
 * - Guarda todo estandarizado en MAYÚSCULAS.
 * ====================================================================
 */

function asignarCapturasAprobadas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    return asignarCapturasAprobadasInterno_();
  } finally {
    lock.releaseLock();
  }
}

function asignarCapturasAprobadasInterno_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const sheetCapturas      = ss.getSheetByName("CAPTURAS");
  const sheetTransportista = ss.getSheetByName("TRANSPORTISTA");
  const sheetTelefonos     = ss.getSheetByName("TELEFONOS");
  const sheetLugares       = ss.getSheetByName("LUGARES");
  const sheetVisita        = ss.getSheetByName("VISITA");
  const sheetDireccion     = ss.getSheetByName("DIRECCION");

  if (!sheetCapturas || !sheetTransportista || !sheetTelefonos || !sheetLugares || !sheetVisita || !sheetDireccion) {
    Logger.log("❌ Error: Una o más pestañas no se encontraron en la base de datos.");
    return 0;
  }

  const capturasData = sheetCapturas.getDataRange().getValues();
  if (capturasData.length <= 1) return 0;

  const rawHeaders = capturasData[0];
  const headers = rawHeaders.map(h => h.toString().trim());

  const idxEstado         = findHeaderIndex(headers, ["ESTADO", "Estado"]);
  const idxIdTransporte   = findHeaderIndex(headers, ["IDTRANSPORTE", "ID TRANSPORTE"]);
  const idxTransportista  = findHeaderIndex(headers, ["NOMBRE DEL TRANSPORTISTA", "TRANSPORTISTA"]);
  const idxTelefonos      = findHeaderIndex(headers, ["TELEFONOS", "Teléfonos"]);
  const idxDestinos       = findHeaderIndex(headers, ["LUGARES O DESTINOS", "DESTINOS"]);
  const idxBodegas        = findHeaderIndex(headers, ["DIRECCIONES O BODEGAS", "BODEGAS"]);
  const idxHorario        = findHeaderIndex(headers, ["HORARIO", "Horario"]);
  const idxObservaciones  = findHeaderIndex(headers, ["OBSERVACIONES", "Observaciones"]);
  const idxGps            = findHeaderIndex(headers, ["GPS"]);
  const idxFoto           = findHeaderIndex(headers, ["FOTO", "Foto"]);

  if (idxEstado === -1) return 0;

  const mapTransportistas = getMapPorColumnas(sheetTransportista, 1, 0);
  const setIdTransporte   = new Set(mapTransportistas.values());
  const mapLugares        = getMapPorColumnas(sheetLugares, 1, 0);
  const setTelefonos      = getCombinedKeys(sheetTelefonos, 1, 2);
  const setDirecciones    = getCombinedKeys(sheetDireccion, 1, 2);
  const setVisitas        = getCombinedKeys(sheetVisita, 1, 2);

  let procesados = 0;

  for (let i = 1; i < capturasData.length; i++) {
    const row = capturasData[i];
    const estado = normalizarTexto(row[idxEstado]);

    // Acepta "aprobado", "actualizar", "aprobado - actualizar"
    if (!estado.includes("aprobad") && !estado.includes("actualiz")) continue;

    const nombreTransportista = (row[idxTransportista] || "").toString().trim().toUpperCase();
    const horario             = (row[idxHorario]       || "").toString().trim().toUpperCase();
    const observaciones       = (row[idxObservaciones] || "").toString().trim().toUpperCase();
    const gpsCaptura          = (idxGps !== -1) ? String(row[idxGps] || "").trim() : "";
    const fotoCaptura         = (idxFoto !== -1) ? String(row[idxFoto] || "").trim() : "";

    const nombreKey = normalizarTexto(nombreTransportista);

    let idTransporte = "";
    let esActualizacion = false;

    // 1. ¿YA EXISTE EL TRANSPORTISTA?
    if (mapTransportistas.has(nombreKey)) {
      idTransporte = mapTransportistas.get(nombreKey);
      esActualizacion = true;
      // 🔥 ACTUALIZAR A LA ÚLTIMA TOMA: Horario, Foto más reciente y Observaciones
      actualizarDatosTransportistaExistente_(sheetTransportista, idTransporte, horario, fotoCaptura, observaciones);
    } else if (nombreTransportista) {
      // ES NUEVO: Crear nuevo ID TRP-
      idTransporte = generarId(sheetTransportista, "TRP-");
      sheetTransportista.appendRow([idTransporte, nombreTransportista, horario, observaciones, fotoCaptura, "", "", ""]);
      mapTransportistas.set(nombreKey, idTransporte);
      setIdTransporte.add(idTransporte);
    } else {
      continue;
    }

    // Vincular IDTRANSPORTE en la hoja CAPTURAS
    if (idxIdTransporte !== -1 && idTransporte) {
      sheetCapturas.getRange(i + 1, idxIdTransporte + 1).setValue(idTransporte);
    }

    const listaTelefonos = splitList(row[idxTelefonos]);
    const listaDestinos  = splitList(row[idxDestinos]);
    const listaBodegas   = splitList(row[idxBodegas]);

    // 2. TELÉFONOS (agrega nuevos teléfonos si la foto trae números adicionales)
    listaTelefonos.forEach(tel => {
      const telNorm = normalizarTelefono(tel);
      if (!telNorm) return;
      const clave = `${idTransporte}_${normalizarTexto(telNorm)}`;
      if (!setTelefonos.has(clave)) {
        const idTelefono = generarId(sheetTelefonos, "TEL-");
        sheetTelefonos.appendRow([idTelefono, idTransporte, telNorm, ""]);
        setTelefonos.add(clave);
      }
    });

    // 3. LUGARES / DESTINOS (agrega nuevas rutas si la foto trae nuevos pueblos)
    listaDestinos.forEach(destino => {
      if (!destino) return;
      const destinoKey = normalizarTexto(destino);
      let idLugares = mapLugares.get(destinoKey);

      if (!idLugares) {
        idLugares = generarId(sheetLugares, "LUG-");
        sheetLugares.appendRow([idLugares, destino]);
        mapLugares.set(destinoKey, idLugares);
      }

      const claveVisita = `${idTransporte}_${idLugares}`;
      if (!setVisitas.has(claveVisita)) {
        const idVisita = generarId(sheetVisita, "VIS-");
        sheetVisita.appendRow([idVisita, idTransporte, idLugares]);
        setVisitas.add(claveVisita);
      }
    });

    // 4. BODEGAS / DIRECCIONES (actualiza el GPS de la bodega a la última toma satelital)
    listaBodegas.forEach((bodega, index) => {
      if (!bodega) return;
      const clave = `${idTransporte}_${normalizarTexto(bodega)}`;
      const gps = (index === 0) ? gpsCaptura : "";
      if (!setDirecciones.has(clave)) {
        const idDireccion = generarId(sheetDireccion, "DIR-");
        sheetDireccion.appendRow([idDireccion, idTransporte, bodega, gps, ""]);
        setDirecciones.add(clave);
      } else if (gps) {
        // 🔥 Actualizar coordenadas GPS a la última visita
        actualizarGpsBodega_(sheetDireccion, idTransporte, bodega, gps);
      }
    });

    // Estado final en la hoja CAPTURAS
    const estadoFinal = esActualizacion ? "Actualizado a última toma" : "Asignado";
    sheetCapturas.getRange(i + 1, idxEstado + 1).setValue(estadoFinal);
    procesados++;
  }

  return procesados;
}

// ======================================================================
// FUNCIONES DE ACTUALIZACIÓN A LA ÚLTIMA TOMA
// ======================================================================

/**
 * Sobrescribe con la información de la última captura (horario, foto, notas)
 */
function actualizarDatosTransportistaExistente_(sheetTransportista, idTransporte, nuevoHorario, nuevaFoto, nuevasObs) {
  const data = sheetTransportista.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toUpperCase());
  const idxId = headers.indexOf("IDTRANSPORTE");
  const idxHorario = headers.indexOf("HORARIO");
  const idxObs = headers.indexOf("OBSERVACIONES");
  const idxImg = headers.indexOf("IMAGEN");

  if (idxId < 0) return;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId] || "").trim() === idTransporte) {
      const fila = i + 1;
      // Actualizar horario si la nueva toma tiene horario
      if (nuevoHorario && idxHorario >= 0) {
        sheetTransportista.getRange(fila, idxHorario + 1).setValue(nuevoHorario);
      }
      // Actualizar a la foto más reciente
      if (nuevaFoto && idxImg >= 0) {
        sheetTransportista.getRange(fila, idxImg + 1).setValue(nuevaFoto);
      }
      // Actualizar observaciones si hay notas
      if (nuevasObs && idxObs >= 0) {
        const obsPrevias = String(data[i][idxObs] || '').trim();
        const obsFinal = obsPrevias ? `${obsPrevias} | ${nuevasObs}` : nuevasObs;
        sheetTransportista.getRange(fila, idxObs + 1).setValue(obsFinal);
      }
      return;
    }
  }
}

/**
 * Actualiza el GPS de la bodega con las coordenadas más recientes
 */
function actualizarGpsBodega_(sheetDireccion, idTransporte, bodega, nuevoGps) {
  if (!nuevoGps) return;
  const data = sheetDireccion.getDataRange().getValues();
  const bodegaKey = normalizarTexto(bodega);
  for (let i = 1; i < data.length; i++) {
    if (normalizarTexto(data[i][1]) === normalizarTexto(idTransporte) &&
        normalizarTexto(data[i][2]) === bodegaKey) {
      // Sobrescribe con el GPS más reciente
      sheetDireccion.getRange(i + 1, 4).setValue(nuevoGps);
      return;
    }
  }
}

// ======================================================================
// FUNCIONES AUXILIARES
// ======================================================================

function normalizarTexto(texto) {
  if (!texto) return "";
  return texto.toString()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();
}

function normalizarTelefono(tel) {
  let t = String(tel || "").trim().toUpperCase();
  t = t.replace(/^\+?506[\s-]*/i, "");
  const digits = t.replace(/\D/g, "");
  if (digits.length === 8) {
    return digits.slice(0, 4) + "-" + digits.slice(4);
  }
  return t;
}

function findHeaderIndex(headers, variants) {
  const normHeaders = headers.map(normalizarTexto);
  const normVariants = variants.map(normalizarTexto);
  for (let i = 0; i < normHeaders.length; i++) {
    if (normVariants.includes(normHeaders[i])) return i;
  }
  for (let i = 0; i < normHeaders.length; i++) {
    for (let variant of normVariants) {
      if (normHeaders[i].includes(variant)) return i;
    }
  }
  return -1;
}

function getMapPorColumnas(sheet, colKey, colValue) {
  const map  = new Map();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = normalizarTexto(data[i][colKey]);
    const val = data[i][colValue] ? data[i][colValue].toString().trim() : "";
    if (key && val) map.set(key, val);
  }
  return map;
}

function getCombinedKeys(sheet, col1, col2) {
  const keys = new Set();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const v1 = data[i][col1] ? data[i][col1].toString().trim() : "";
    const v2 = normalizarTexto(data[i][col2]);
    if (v1 && v2) keys.add(`${v1}_${v2}`);
  }
  return keys;
}

function generarId(sheet, prefijo) {
  const lastRow = sheet.getLastRow();
  const num     = lastRow > 0 ? lastRow : 1;
  return prefijo + String(num).padStart(4, "0");
}

function splitList(val) {
  if (!val) return [];
  return val.toString().split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
}
